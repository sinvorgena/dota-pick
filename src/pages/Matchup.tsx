import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useHeroes } from '../hooks/useHeroes'
import {
  fetchAllMatchups,
  fetchAllPositionMatchups,
  type HeroMatchup,
  type PositionMatchups,
} from '../api/matchups'
import { HeroIcon } from '../components/HeroIcon'
import { getMetaPool, type MetaPosition } from '../data/meta-heroes'
import type { Hero } from '../types'

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

type Side = 'my' | 'enemy'
type Pos = 1 | 2 | 3 | 4 | 5
type SlotKey = `${Side}_${Pos}`

const POSITIONS: { pos: Pos; label: string }[] = [
  { pos: 1, label: 'Carry' },
  { pos: 2, label: 'Mid' },
  { pos: 3, label: 'Offlane' },
  { pos: 4, label: 'Soft Sup' },
  { pos: 5, label: 'Hard Sup' },
]

/**
 * Three lane groups. `mine` is positions in my team that share this lane,
 * `theirs` is positions in the enemy team that share it. Pairs cross
 * between the two — e.g. safe lane = (my pos1, my pos5) vs (enemy pos3,
 * enemy pos4), giving 4 hero-pair WRs to average.
 */
const LANES: { label: string; mine: Pos[]; theirs: Pos[] }[] = [
  { label: 'Safe (мы) ↔ Off (враг)', mine: [1, 5], theirs: [3, 4] },
  { label: 'Mid', mine: [2], theirs: [2] },
  { label: 'Off (мы) ↔ Safe (враг)', mine: [3, 4], theirs: [1, 5] },
]

const ALL_KEYS: SlotKey[] = (['my', 'enemy'] as const).flatMap((side) =>
  ([1, 2, 3, 4, 5] as Pos[]).map((p) => `${side}_${p}` as SlotKey),
)

const slotKey = (side: Side, pos: Pos): SlotKey => `${side}_${pos}`
const parseSlot = (k: SlotKey): { side: Side; pos: Pos } => {
  const [side, pos] = k.split('_') as [Side, string]
  return { side, pos: Number(pos) as Pos }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Matchup() {
  const { data: heroes, byId, isLoading } = useHeroes()
  const [slots, setSlots] = useState<Partial<Record<SlotKey, number>>>({})
  const [activeSlot, setActiveSlot] = useState<SlotKey | null>(null)
  const [allMatchups, setAllMatchups] = useState<Record<number, HeroMatchup[]> | null>(null)
  const [posMatchups, setPosMatchups] = useState<PositionMatchups | null>(null)

  // Load matchup data once on mount
  useEffect(() => {
    fetchAllMatchups().then(setAllMatchups).catch(() => setAllMatchups({}))
    fetchAllPositionMatchups().then(setPosMatchups).catch(() => setPosMatchups({}))
  }, [])

  const byShortName = useMemo(() => {
    const m = new Map<string, Hero>()
    for (const h of heroes ?? []) m.set(h.shortName, h)
    return m
  }, [heroes])

  const usedIds = useMemo(
    () => new Set(Object.values(slots).filter((x): x is number => x != null)),
    [slots],
  )

  // ---------------- Slot ops ----------------

  const setSlot = useCallback((key: SlotKey, heroId: number) => {
    setSlots((prev) => {
      const next: Partial<Record<SlotKey, number>> = {}
      for (const k of Object.keys(prev) as SlotKey[]) {
        if (prev[k] !== heroId) next[k] = prev[k]
      }
      next[key] = heroId
      return next
    })
  }, [])

  const clearSlot = useCallback((key: SlotKey) => {
    setSlots((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const generateRandom = useCallback(() => {
    if (!heroes) return
    const used = new Set<number>()
    const next: Partial<Record<SlotKey, number>> = {}
    for (const side of ['my', 'enemy'] as const) {
      for (const p of [1, 2, 3, 4, 5] as Pos[]) {
        const pool = getMetaPool(p)
          .map((s) => byShortName.get(s))
          .filter((h): h is Hero => !!h && !used.has(h.id))
        if (pool.length === 0) continue
        const pick = pool[Math.floor(Math.random() * pool.length)]
        used.add(pick.id)
        next[slotKey(side, p)] = pick.id
      }
    }
    setSlots(next)
    setActiveSlot(null)
  }, [heroes, byShortName])

  // ---------------- WR helpers ----------------

  /** Lane WR of my hero on `myPos` vs enemy hero, my-perspective. */
  const getLaneWr = useCallback(
    (myHeroId: number, myPos: Pos, enemyHeroId: number): number | null => {
      if (!posMatchups) return null
      const list = posMatchups[myPos]?.[myHeroId]
      if (!list) return null
      const m = list.find((x) => x.hero_id === enemyHeroId)
      if (!m || m.games_played === 0) return null
      return m.wins / m.games_played
    },
    [posMatchups],
  )

  /** Global WR of my hero vs enemy hero (any position), my-perspective. */
  const getGameWr = useCallback(
    (myHeroId: number, enemyHeroId: number): number | null => {
      if (!allMatchups) return null
      const list = allMatchups[myHeroId]
      if (!list) return null
      const m = list.find((x) => x.hero_id === enemyHeroId)
      if (!m || m.games_played === 0) return null
      return m.wins / m.games_played
    },
    [allMatchups],
  )

  // For each lane: avg lane WR (using position data when available, falling
  // back to global game WR so the user gets *some* number even without the
  // position-matchups JSON loaded).
  const laneStats = useMemo(() => {
    return LANES.map((lane) => {
      const laneWrs: number[] = []
      const fallbackWrs: number[] = []
      for (const mp of lane.mine) {
        const myH = slots[slotKey('my', mp)]
        if (!myH) continue
        for (const tp of lane.theirs) {
          const enH = slots[slotKey('enemy', tp)]
          if (!enH) continue
          const lwr = getLaneWr(myH, mp, enH)
          const gwr = getGameWr(myH, enH)
          if (lwr != null) laneWrs.push(lwr)
          if (gwr != null) fallbackWrs.push(gwr)
        }
      }
      const lane_wr =
        laneWrs.length > 0 ? laneWrs.reduce((s, x) => s + x, 0) / laneWrs.length : null
      const fallback_wr =
        fallbackWrs.length > 0
          ? fallbackWrs.reduce((s, x) => s + x, 0) / fallbackWrs.length
          : null
      return { lane_wr, fallback_wr }
    })
  }, [slots, getLaneWr, getGameWr])

  // Overall game WR — average across all 5×5 hero pairs we have data for.
  const gameWr = useMemo(() => {
    const wrs: number[] = []
    for (const mp of [1, 2, 3, 4, 5] as Pos[]) {
      const myH = slots[slotKey('my', mp)]
      if (!myH) continue
      for (const tp of [1, 2, 3, 4, 5] as Pos[]) {
        const enH = slots[slotKey('enemy', tp)]
        if (!enH) continue
        const wr = getGameWr(myH, enH)
        if (wr != null) wrs.push(wr)
      }
    }
    if (wrs.length === 0) return null
    return wrs.reduce((s, x) => s + x, 0) / wrs.length
  }, [slots, getGameWr])

  if (isLoading || !heroes) {
    return <div className="p-6 text-zinc-400">Загрузка героев...</div>
  }

  const activeInfo = activeSlot ? parseSlot(activeSlot) : null

  return (
    <div className="min-h-screen p-4 max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between bg-panel border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5">
            ← на главную
          </Link>
          <div className="font-semibold">Matchup builder</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={generateRandom}
            className="text-xs bg-emerald-700 hover:bg-emerald-600 rounded px-3 py-1.5"
          >
            случайно
          </button>
          <button
            onClick={() => {
              setSlots({})
              setActiveSlot(null)
            }}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
          >
            сброс
          </button>
        </div>
      </header>

      {/* Lane summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {LANES.map((lane, i) => {
          const { lane_wr, fallback_wr } = laneStats[i]
          const wr = lane_wr ?? fallback_wr
          const isFallback = lane_wr == null && fallback_wr != null
          return (
            <div key={lane.label} className="bg-panel border border-border rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] text-zinc-500 uppercase tracking-wider">
                  {lane.label}
                </div>
                {isFallback && (
                  <span
                    className="text-[9px] text-zinc-600 italic"
                    title="Нет lane-данных, показан глобальный WR. Запусти scripts/fetch-stratz-position-matchups.js"
                  >
                    global
                  </span>
                )}
              </div>
              {wr != null ? (
                <WrBar wr={wr} />
              ) : (
                <div className="text-xs text-zinc-600 italic">
                  заполни обе стороны лайна
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Slots: 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SideColumn
          side="my"
          title="Моя команда"
          accent="emerald"
          slots={slots}
          byId={byId}
          activeSlot={activeSlot}
          onClickSlot={(key) => {
            if (slots[key]) clearSlot(key)
            else setActiveSlot(activeSlot === key ? null : key)
          }}
        />
        <SideColumn
          side="enemy"
          title="Враги"
          accent="rose"
          slots={slots}
          byId={byId}
          activeSlot={activeSlot}
          onClickSlot={(key) => {
            if (slots[key]) clearSlot(key)
            else setActiveSlot(activeSlot === key ? null : key)
          }}
        />
      </div>

      {/* Game WR overall */}
      <div className="bg-panel border border-border rounded-xl p-4 flex items-center gap-4">
        <div className="text-xs text-zinc-500 uppercase tracking-wider w-24 shrink-0">
          Game WR
        </div>
        {gameWr != null ? (
          <div className="flex-1">
            <WrBar wr={gameWr} />
          </div>
        ) : (
          <div className="text-xs text-zinc-600 italic">заполни хотя бы пару героев</div>
        )}
      </div>

      {/* Picker for active slot */}
      {activeSlot && activeInfo && (
        <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
          <div className="text-sm text-zinc-400">
            Герой на{' '}
            <span className="text-zinc-200 font-semibold">
              {POSITIONS.find((p) => p.pos === activeInfo.pos)?.label}
            </span>{' '}
            ({activeInfo.side === 'my' ? 'моя сторона' : 'враг'})
          </div>
          <MetaPicker
            heroes={heroes}
            position={activeInfo.pos as MetaPosition}
            disabledIds={usedIds}
            onPick={(hid) => {
              setSlot(activeSlot, hid)
              const next = ALL_KEYS.find((k) => k !== activeSlot && slots[k] == null)
              setActiveSlot(next ?? null)
            }}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function SideColumn({
  side,
  title,
  accent,
  slots,
  byId,
  activeSlot,
  onClickSlot,
}: {
  side: Side
  title: string
  accent: 'emerald' | 'rose'
  slots: Partial<Record<SlotKey, number>>
  byId: Record<number, Hero>
  activeSlot: SlotKey | null
  onClickSlot: (key: SlotKey) => void
}) {
  return (
    <div className="bg-panel border border-border rounded-xl p-4 space-y-2">
      <div
        className={clsx(
          'text-[11px] uppercase tracking-wider font-semibold',
          accent === 'emerald' ? 'text-emerald-300' : 'text-rose-300',
        )}
      >
        {title}
      </div>
      {POSITIONS.map((p) => {
        const key = slotKey(side, p.pos)
        const heroId = slots[key]
        const hero = heroId ? byId[heroId] : null
        const isActive = activeSlot === key
        return (
          <div
            key={key}
            onClick={() => onClickSlot(key)}
            className={clsx(
              'flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition',
              hero ? 'bg-bg/50' : 'border-2 border-dashed border-zinc-700 bg-bg/20',
              isActive && 'ring-2 ring-amber-400 bg-amber-900/20',
            )}
          >
            <div className="text-[10px] text-zinc-500 uppercase tracking-wider w-16 shrink-0">
              {p.pos}. {p.label}
            </div>
            {hero ? (
              <>
                <div className="w-10 shrink-0">
                  <HeroIcon hero={hero} variant="portrait" />
                </div>
                <div className="text-xs truncate flex-1">{hero.localized_name}</div>
              </>
            ) : (
              <div className="h-10 flex items-center flex-1">
                <span className="text-zinc-600 text-xs">пусто</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WrBar({ wr }: { wr: number }) {
  const us = wr * 100
  const them = 100 - us
  return (
    <div className="flex h-7 rounded overflow-hidden text-[11px] font-bold">
      <div
        className="bg-emerald-600/80 flex items-center justify-center min-w-[2rem]"
        style={{ width: `${Math.max(us, 8)}%` }}
      >
        {us.toFixed(1)}%
      </div>
      <div
        className="bg-rose-600/80 flex items-center justify-center min-w-[2rem]"
        style={{ width: `${Math.max(them, 8)}%` }}
      >
        {them.toFixed(1)}%
      </div>
    </div>
  )
}

function MetaPicker({
  heroes,
  position,
  disabledIds,
  onPick,
}: {
  heroes: Hero[]
  position: MetaPosition
  disabledIds: Set<number>
  onPick: (heroId: number) => void
}) {
  const byShort = useMemo(() => {
    const m = new Map<string, Hero>()
    for (const h of heroes) m.set(h.shortName, h)
    return m
  }, [heroes])
  const pool = getMetaPool(position)
    .map((s) => byShort.get(s))
    .filter((h): h is Hero => !!h)
  if (pool.length === 0) {
    return <div className="text-xs text-zinc-600 italic">пул пуст</div>
  }
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(56px, 1fr))' }}
    >
      {pool.map((h) => {
        const disabled = disabledIds.has(h.id)
        return (
          <HeroIcon
            key={h.id}
            hero={h}
            variant="portrait"
            dim={disabled}
            selectable={!disabled}
            onClick={!disabled ? () => onPick(h.id) : undefined}
            title={h.localized_name}
          />
        )
      })}
    </div>
  )
}
