import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { getMetaPool } from '../data/meta-heroes'
import type { Hero } from '../types'

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

type Side = 'my' | 'enemy'
type Pos = 1 | 2 | 3 | 4 | 5
type SlotKey = `${Side}_${Pos}`

type Mode = 'lane' | 'mid'
type LaneSide = 'safe' | 'off'

interface SlotConfig {
  side: Side
  pos: Pos
}

const POS_LABEL: Record<Pos, string> = {
  1: 'Carry',
  2: 'Mid',
  3: 'Offlane',
  4: 'Soft Sup',
  5: 'Hard Sup',
}

const slotKey = (side: Side, pos: Pos): SlotKey => `${side}_${pos}`
const DND_MIME = 'application/x-matchup-hero'

/** Which slots are visible for the chosen mode/side. */
function activeSlots(mode: Mode, mySide: LaneSide): SlotConfig[] {
  if (mode === 'mid') {
    return [
      { side: 'my', pos: 2 },
      { side: 'enemy', pos: 2 },
    ]
  }
  if (mySide === 'safe') {
    return [
      { side: 'my', pos: 1 },
      { side: 'my', pos: 5 },
      { side: 'enemy', pos: 3 },
      { side: 'enemy', pos: 4 },
    ]
  }
  return [
    { side: 'my', pos: 3 },
    { side: 'my', pos: 4 },
    { side: 'enemy', pos: 1 },
    { side: 'enemy', pos: 5 },
  ]
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Matchup() {
  const { data: heroes, byId, isLoading } = useHeroes()
  const [mode, setMode] = useState<Mode>('lane')
  const [mySide, setMySide] = useState<LaneSide>('safe')
  const [slots, setSlots] = useState<Partial<Record<SlotKey, number>>>({})
  const [allMatchups, setAllMatchups] = useState<Record<number, HeroMatchup[]> | null>(null)
  const [posMatchups, setPosMatchups] = useState<PositionMatchups | null>(null)

  useEffect(() => {
    fetchAllMatchups().then(setAllMatchups).catch(() => setAllMatchups({}))
    fetchAllPositionMatchups().then(setPosMatchups).catch(() => setPosMatchups({}))
  }, [])

  const byShortName = useMemo(() => {
    const m = new Map<string, Hero>()
    for (const h of heroes ?? []) m.set(h.shortName, h)
    return m
  }, [heroes])

  const config = useMemo(() => activeSlots(mode, mySide), [mode, mySide])

  /**
   * Slots filtered to the currently visible config — keeps the global `slots`
   * state intact when the user toggles modes (so swap back doesn't lose work),
   * while WR & UI only see what's relevant.
   */
  const visibleSlots = useMemo(() => {
    const out: Partial<Record<SlotKey, number>> = {}
    for (const c of config) {
      const k = slotKey(c.side, c.pos)
      const v = slots[k]
      if (v != null) out[k] = v
    }
    return out
  }, [config, slots])

  const usedIds = useMemo(
    () => new Set(Object.values(visibleSlots).filter((x): x is number => x != null)),
    [visibleSlots],
  )

  // Hero pool — union of meta heroes across the positions involved in the
  // current mode. For lane = pos 1/3/4/5 (covers both safe and off). For
  // mid = pos 2 only.
  const heroPool = useMemo(() => {
    const positions: Pos[] = mode === 'mid' ? [2] : [1, 3, 4, 5]
    const seen = new Set<number>()
    const list: Hero[] = []
    for (const p of positions) {
      for (const sn of getMetaPool(p)) {
        const h = byShortName.get(sn)
        if (!h || seen.has(h.id)) continue
        seen.add(h.id)
        list.push(h)
      }
    }
    list.sort((a, b) => a.localized_name.localeCompare(b.localized_name))
    return list
  }, [mode, byShortName])

  const grouped = useMemo(() => {
    const m: Record<Hero['primary_attr'], Hero[]> = { str: [], agi: [], int: [], all: [] }
    for (const h of heroPool) m[h.primary_attr]?.push(h)
    return m
  }, [heroPool])

  // ---------- slot ops ----------

  const setSlot = useCallback((key: SlotKey, heroId: number) => {
    setSlots((prev) => {
      const next: Partial<Record<SlotKey, number>> = {}
      for (const [k, v] of Object.entries(prev)) {
        if (v !== heroId) next[k as SlotKey] = v as number
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

  const reset = () => setSlots({})

  const generateRandom = useCallback(() => {
    if (!heroes) return
    const used = new Set<number>()
    const next: Partial<Record<SlotKey, number>> = { ...slots }
    // Drop existing values for the active config, we'll rebuild them
    for (const c of config) delete next[slotKey(c.side, c.pos)]
    for (const c of config) {
      const pool = getMetaPool(c.pos)
        .map((s) => byShortName.get(s))
        .filter((h): h is Hero => !!h && !used.has(h.id))
      if (pool.length === 0) continue
      const pick = pool[Math.floor(Math.random() * pool.length)]
      used.add(pick.id)
      next[slotKey(c.side, c.pos)] = pick.id
    }
    setSlots(next)
  }, [heroes, byShortName, config, slots])

  // ---------- WR helpers ----------

  /** Lane WR of `myHeroId` on `myPos` vs `enemyHeroId` (my-perspective). */
  const getLaneWr = useCallback(
    (myH: number, myPos: Pos, enH: number): number | null => {
      if (!posMatchups) return null
      const list = posMatchups[myPos]?.[myH]
      if (!list) return null
      const m = list.find((x) => x.hero_id === enH)
      if (!m || m.games_played === 0) return null
      return m.wins / m.games_played
    },
    [posMatchups],
  )

  /** Global WR of `myHeroId` vs `enemyHeroId` (my-perspective). */
  const getGameWr = useCallback(
    (myH: number, enH: number): number | null => {
      if (!allMatchups) return null
      const list = allMatchups[myH]
      if (!list) return null
      const m = list.find((x) => x.hero_id === enH)
      if (!m || m.games_played === 0) return null
      return m.wins / m.games_played
    },
    [allMatchups],
  )

  const myConfigs = config.filter((c) => c.side === 'my')
  const enemyConfigs = config.filter((c) => c.side === 'enemy')

  // Lane WR — averaged over my×enemy hero pairs in the current config.
  // If position-matchups data is missing for a pair, fall back to global WR
  // so the user always gets a number (with an inline note).
  const laneWr = useMemo(() => {
    const wrs: number[] = []
    let usedFallback = false
    for (const mc of myConfigs) {
      const myH = visibleSlots[slotKey('my', mc.pos)]
      if (!myH) continue
      for (const ec of enemyConfigs) {
        const enH = visibleSlots[slotKey('enemy', ec.pos)]
        if (!enH) continue
        const lwr = getLaneWr(myH, mc.pos, enH)
        if (lwr != null) {
          wrs.push(lwr)
        } else {
          const gwr = getGameWr(myH, enH)
          if (gwr != null) {
            wrs.push(gwr)
            usedFallback = true
          }
        }
      }
    }
    if (wrs.length === 0) return null
    return {
      value: wrs.reduce((s, x) => s + x, 0) / wrs.length,
      fallback: usedFallback,
    }
  }, [visibleSlots, myConfigs, enemyConfigs, getLaneWr, getGameWr])

  const gameWr = useMemo(() => {
    const wrs: number[] = []
    for (const mc of myConfigs) {
      const myH = visibleSlots[slotKey('my', mc.pos)]
      if (!myH) continue
      for (const ec of enemyConfigs) {
        const enH = visibleSlots[slotKey('enemy', ec.pos)]
        if (!enH) continue
        const wr = getGameWr(myH, enH)
        if (wr != null) wrs.push(wr)
      }
    }
    if (wrs.length === 0) return null
    return wrs.reduce((s, x) => s + x, 0) / wrs.length
  }, [visibleSlots, myConfigs, enemyConfigs, getGameWr])

  if (isLoading || !heroes) {
    return <div className="p-6 text-zinc-400">Загрузка героев...</div>
  }

  const myTitle =
    mode === 'mid' ? 'Я · мид' : mySide === 'safe' ? 'Я · safe lane' : 'Я · off lane'
  const enemyTitle =
    mode === 'mid' ? 'Враг · мид' : mySide === 'safe' ? 'Враг · off lane' : 'Враг · safe lane'

  return (
    <div className="min-h-screen p-4 max-w-[1400px] mx-auto space-y-4">
      <header className="flex items-center justify-between bg-panel border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5">
            ← на главную
          </Link>
          <div className="font-semibold">Matchup</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={generateRandom}
            className="text-xs bg-emerald-700 hover:bg-emerald-600 rounded px-3 py-1.5"
          >
            случайно
          </button>
          <button
            onClick={reset}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
          >
            сброс
          </button>
        </div>
      </header>

      {/* Mode switch */}
      <div className="flex gap-2 flex-wrap items-center">
        <ModeButton active={mode === 'lane'} onClick={() => setMode('lane')}>
          Сайд лейн (2v2)
        </ModeButton>
        <ModeButton active={mode === 'mid'} onClick={() => setMode('mid')}>
          Мид (1v1)
        </ModeButton>
        {mode === 'lane' && (
          <>
            <div className="w-px h-6 bg-zinc-800 mx-1" />
            <ModeButton
              active={mySide === 'safe'}
              onClick={() => setMySide('safe')}
              variant="amber"
            >
              я safe
            </ModeButton>
            <ModeButton
              active={mySide === 'off'}
              onClick={() => setMySide('off')}
              variant="amber"
            >
              я off
            </ModeButton>
          </>
        )}
      </div>

      {/* Slots: my vs enemy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SlotsColumn
          title={myTitle}
          accent="emerald"
          configs={myConfigs}
          slots={visibleSlots}
          byId={byId}
          onClear={clearSlot}
          onDrop={setSlot}
        />
        <SlotsColumn
          title={enemyTitle}
          accent="rose"
          configs={enemyConfigs}
          slots={visibleSlots}
          byId={byId}
          onClear={clearSlot}
          onDrop={setSlot}
        />
      </div>

      {/* WR cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <WrCard
          label={mode === 'mid' ? 'Lane WR (mid)' : 'Lane WR'}
          wr={laneWr?.value ?? null}
          subtitle={
            laneWr?.fallback
              ? 'нет lane-данных, используем global matchup'
              : undefined
          }
        />
        <WrCard label="Game WR" wr={gameWr} />
      </div>

      {/* Hero pool grid */}
      <div className="bg-panel border border-border rounded-xl p-3 space-y-2">
        <div className="text-xs text-zinc-500 uppercase tracking-wider px-1 flex items-center justify-between">
          <span>Пул героев · перетащи на слот</span>
          <span className="text-[10px] text-zinc-600 normal-case">{heroPool.length} героев</span>
        </div>
        <HeroPoolGrid grouped={grouped} disabledIds={usedIds} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function ModeButton({
  active,
  onClick,
  children,
  variant = 'emerald',
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  variant?: 'emerald' | 'amber'
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'text-sm rounded-lg px-3 py-1.5 font-medium transition',
        active
          ? variant === 'amber'
            ? 'bg-amber-700 text-white'
            : 'bg-emerald-700 text-white'
          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
      )}
    >
      {children}
    </button>
  )
}

function SlotsColumn({
  title,
  accent,
  configs,
  slots,
  byId,
  onClear,
  onDrop,
}: {
  title: string
  accent: 'emerald' | 'rose'
  configs: SlotConfig[]
  slots: Partial<Record<SlotKey, number>>
  byId: Record<number, Hero>
  onClear: (key: SlotKey) => void
  onDrop: (key: SlotKey, heroId: number) => void
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
      {configs.map((c) => {
        const key = slotKey(c.side, c.pos)
        const heroId = slots[key]
        const hero = heroId != null ? byId[heroId] : null
        return (
          <DropSlot
            key={key}
            label={`${c.pos}. ${POS_LABEL[c.pos]}`}
            hero={hero}
            onClear={() => onClear(key)}
            onDrop={(hid) => onDrop(key, hid)}
          />
        )
      })}
    </div>
  )
}

function DropSlot({
  label,
  hero,
  onClear,
  onDrop,
}: {
  label: string
  hero: Hero | null
  onClear: () => void
  onDrop: (heroId: number) => void
}) {
  const counter = useRef(0)
  const [over, setOver] = useState(false)
  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault()
        counter.current += 1
        if (counter.current > 0) setOver(true)
      }}
      onDragLeave={() => {
        counter.current = Math.max(0, counter.current - 1)
        if (counter.current === 0) setOver(false)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e) => {
        e.preventDefault()
        counter.current = 0
        setOver(false)
        const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain')
        const id = Number(raw)
        if (Number.isFinite(id) && id > 0) onDrop(id)
      }}
      onClick={() => {
        if (hero) onClear()
      }}
      className={clsx(
        'flex items-center gap-2 rounded-lg px-3 py-2 transition cursor-pointer',
        hero ? 'bg-bg/50' : 'border-2 border-dashed border-zinc-700 bg-bg/20',
        over && 'ring-2 ring-emerald-400 bg-emerald-900/20 scale-[1.02]',
      )}
    >
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider w-20 shrink-0">
        {label}
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
          <span className="text-zinc-600 text-xs">перетащи героя</span>
        </div>
      )}
    </div>
  )
}

const ATTR_GROUPS = [
  { key: 'str' as const, label: 'Strength', color: 'text-rose-300' },
  { key: 'agi' as const, label: 'Agility', color: 'text-emerald-300' },
  { key: 'int' as const, label: 'Intelligence', color: 'text-sky-300' },
  { key: 'all' as const, label: 'Universal', color: 'text-amber-300' },
]

function HeroPoolGrid({
  grouped,
  disabledIds,
}: {
  grouped: Record<Hero['primary_attr'], Hero[]>
  disabledIds: Set<number>
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {ATTR_GROUPS.map((a) => {
        const list = grouped[a.key]
        if (!list?.length) return <div key={a.key} />
        return (
          <div key={a.key} className="min-w-0">
            <div
              className={clsx('text-[11px] font-bold uppercase tracking-wider mb-2', a.color)}
            >
              {a.label}
            </div>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))' }}
            >
              {list.map((h) => (
                <DragHero key={h.id} hero={h} disabled={disabledIds.has(h.id)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DragHero({ hero, disabled }: { hero: Hero; disabled: boolean }) {
  return (
    <div
      draggable={!disabled}
      onDragStart={
        disabled
          ? undefined
          : (e) => {
              e.dataTransfer.setData(DND_MIME, String(hero.id))
              e.dataTransfer.setData('text/plain', String(hero.id))
              e.dataTransfer.effectAllowed = 'move'
            }
      }
      className={disabled ? '' : 'cursor-grab active:cursor-grabbing'}
    >
      <HeroIcon
        hero={hero}
        variant="portrait"
        dim={disabled}
        title={hero.localized_name}
      />
    </div>
  )
}

function WrCard({
  label,
  wr,
  subtitle,
}: {
  label: string
  wr: number | null
  subtitle?: string
}) {
  return (
    <div className="bg-panel border border-border rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] text-zinc-500 uppercase tracking-wider">{label}</div>
        {subtitle && <div className="text-[9px] text-zinc-600 italic">{subtitle}</div>}
      </div>
      {wr != null ? (
        <div className="flex h-7 rounded overflow-hidden text-[11px] font-bold">
          <div
            className="bg-emerald-600/80 flex items-center justify-center min-w-[2rem]"
            style={{ width: `${Math.max(wr * 100, 8)}%` }}
          >
            {(wr * 100).toFixed(1)}%
          </div>
          <div
            className="bg-rose-600/80 flex items-center justify-center min-w-[2rem]"
            style={{ width: `${Math.max((1 - wr) * 100, 8)}%` }}
          >
            {((1 - wr) * 100).toFixed(1)}%
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-600 italic">заполни обе стороны</div>
      )}
    </div>
  )
}
