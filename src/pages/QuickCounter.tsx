import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHeroes } from '../hooks/useHeroes'
import { fetchHeroMatchups, type HeroMatchup } from '../api/matchups'
import { HeroIcon } from '../components/HeroIcon'
import type { Hero } from '../types'
import clsx from 'clsx'

// ---------------------------------------------------------------------------
// Position definitions with realistic role weights
// ---------------------------------------------------------------------------

const POSITIONS = [
  { pos: 1, label: 'Carry', roleHints: ['Carry'] },
  { pos: 2, label: 'Mid', roleHints: ['Nuker', 'Pusher', 'Escape'] },
  { pos: 3, label: 'Offlane', roleHints: ['Initiator', 'Durable', 'Disabler'] },
  { pos: 4, label: 'Soft Sup', roleHints: ['Support', 'Disabler', 'Initiator'] },
  { pos: 5, label: 'Hard Sup', roleHints: ['Support'] },
] as const

// Heroes that are strongly tied to core roles and should almost never appear as support
const CORE_ONLY_NAMES = new Set([
  'anti_mage', 'phantom_assassin', 'juggernaut', 'faceless_void', 'spectre',
  'medusa', 'terrorblade', 'luna', 'morphling', 'slark', 'ursa', 'troll_warlord',
  'lifestealer', 'phantom_lancer', 'naga_siren', 'broodmother', 'meepo',
  'alchemist', 'arc_warden', 'templar_assassin', 'storm_spirit', 'ember_spirit',
  'invoker', 'tinker', 'sniper', 'huskar', 'viper', 'razor', 'drow_ranger',
  'clinkz', 'weaver', 'riki', 'bloodseeker', 'lone_druid',
])

function pickRandomForPos(
  heroes: Hero[],
  pos: typeof POSITIONS[number],
  exclude: Set<number>,
): Hero | null {
  // For support positions, filter out heroes that are core-only
  const isSupport = pos.pos >= 4
  let pool = heroes.filter((h) => {
    if (exclude.has(h.id)) return false
    if (isSupport && CORE_ONLY_NAMES.has(h.shortName)) return false
    return h.roles.some((r) => pos.roleHints.includes(r))
  })
  if (pool.length === 0) {
    pool = heroes.filter((h) => !exclude.has(h.id) && !(isSupport && CORE_ONLY_NAMES.has(h.shortName)))
  }
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = 'random' | 'my-hero'
type Phase = 'setup' | 'picking' | 'results'

/** A counter-pick placed into a position slot */
interface SlotHero {
  heroId: number
  pos: number
  winrate: number // counter's WR vs enemy (= 1 - enemy_wr)
  games: number
}

interface RoundResult {
  enemy: Hero
  enemyPos: number
  slots: SlotHero[]
  avgWinrate: number
}

const DND_MIME = 'application/x-quick-counter'

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QuickCounter() {
  const { data: heroes, byId, isLoading } = useHeroes()

  const [mode, setMode] = useState<Mode>('random')
  const [phase, setPhase] = useState<Phase>('picking')
  const [history, setHistory] = useState<RoundResult[]>([])

  // Enemy hero state
  const [enemyId, setEnemyId] = useState<number | null>(null)
  const [enemyPos, setEnemyPos] = useState<number | null>(null)
  const [matchups, setMatchups] = useState<HeroMatchup[] | null>(null)
  const [loadingMatchups, setLoadingMatchups] = useState(false)

  // Team slots: pos (1-5) -> heroId
  const [slots, setSlots] = useState<Record<number, number>>({})

  // My-hero setup state
  const [myHeroId, setMyHeroId] = useState<number | null>(null)
  const [myPos, setMyPos] = useState<number | null>(null)

  const enemy = enemyId != null ? byId[enemyId] : null

  // Load matchups for a hero
  const loadMatchups = useCallback((heroId: number) => {
    setLoadingMatchups(true)
    setMatchups(null)
    fetchHeroMatchups(heroId)
      .then((m) => setMatchups(m))
      .catch(() => setMatchups([]))
      .finally(() => setLoadingMatchups(false))
  }, [])

  // Generate random enemy
  const generateRandom = useCallback(() => {
    if (!heroes || heroes.length === 0) return
    const posIdx = Math.floor(Math.random() * POSITIONS.length)
    const pos = POSITIONS[posIdx]
    const hero = pickRandomForPos(heroes, pos, new Set())
    if (!hero) return
    setEnemyId(hero.id)
    setEnemyPos(pos.pos)
    setSlots({})
    setPhase('picking')
    loadMatchups(hero.id)
  }, [heroes, loadMatchups])

  // Init
  useEffect(() => {
    if (heroes && heroes.length > 0 && enemyId === null && mode === 'random') {
      generateRandom()
    }
  }, [heroes, enemyId, mode, generateRandom])

  // Get winrate info for a hero vs the enemy
  const getWr = useCallback(
    (heroId: number): { winrate: number; games: number } => {
      if (!matchups) return { winrate: 0.5, games: 0 }
      const m = matchups.find((x) => x.hero_id === heroId)
      if (!m || m.games_played === 0) return { winrate: 0.5, games: 0 }
      return { winrate: 1 - m.wins / m.games_played, games: m.games_played }
    },
    [matchups],
  )

  // Slot management
  const assignSlot = useCallback(
    (pos: number, heroId: number) => {
      setSlots((prev) => {
        // Remove hero from any other slot first
        const next: Record<number, number> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (v !== heroId) next[Number(k)] = v
        }
        next[pos] = heroId
        return next
      })
    },
    [],
  )

  const removeSlot = useCallback((pos: number) => {
    setSlots((prev) => {
      const next = { ...prev }
      delete next[pos]
      return next
    })
  }, [])

  // Active slot for click-to-assign
  const [activeSlot, setActiveSlot] = useState<number | null>(null)

  const handleHeroPick = useCallback(
    (heroId: number) => {
      // Find target slot: active slot, or first empty slot
      const targetPos = activeSlot ?? POSITIONS.find((p) => !slots[p.pos])?.pos
      if (targetPos == null) return
      assignSlot(targetPos, heroId)
      // Advance active slot to next empty
      const nextEmpty = POSITIONS.find((p) => p.pos !== targetPos && !slots[p.pos] && !(slots[p.pos] === heroId))
      setActiveSlot(nextEmpty?.pos ?? null)
    },
    [activeSlot, slots, assignSlot],
  )

  // Auto-finish when all 5 slots filled
  const filledCount = Object.keys(slots).length
  const prevFilledRef = useRef(filledCount)
  useEffect(() => {
    if (filledCount === 5 && prevFilledRef.current < 5 && phase === 'picking') {
      finishRound()
    }
    prevFilledRef.current = filledCount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filledCount, phase])

  const finishRound = useCallback(() => {
    if (!enemy || enemyPos == null) return
    const slotEntries = Object.entries(slots).map(([pos, hid]) => {
      const wr = getWr(hid)
      return { heroId: hid, pos: Number(pos), winrate: wr.winrate, games: wr.games }
    })
    if (slotEntries.length === 0) {
      setPhase('results')
      return
    }
    const avg = slotEntries.reduce((s, x) => s + x.winrate, 0) / slotEntries.length
    setHistory((h) => [
      { enemy, enemyPos, slots: slotEntries, avgWinrate: avg },
      ...h,
    ])
    setPhase('results')
  }, [enemy, enemyPos, slots, getWr])

  // Used hero ids (enemy + all slots)
  const usedIds = useMemo(() => {
    const s = new Set<number>()
    if (enemyId != null) s.add(enemyId)
    for (const hid of Object.values(slots)) s.add(hid)
    return s
  }, [enemyId, slots])

  // My-hero mode helpers
  const selectMyHero = (heroId: number) => {
    setMyHeroId(heroId)
  }

  const startMyHeroRound = () => {
    if (myHeroId == null || myPos == null) return
    setEnemyId(myHeroId)
    setEnemyPos(myPos)
    setSlots({})
    setPhase('picking')
    loadMatchups(myHeroId)
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setEnemyId(null)
    setEnemyPos(null)
    setSlots({})
    setMatchups(null)
    setMyHeroId(null)
    setMyPos(null)
    setActiveSlot(null)
    setPhase(m === 'random' ? 'picking' : 'setup')
  }

  const newRound = () => {
    if (mode === 'random') {
      generateRandom()
    } else {
      // Keep the chosen hero, regenerate
      startMyHeroRound()
    }
  }

  const grouped = useMemo(() => {
    if (!heroes) return null
    const map: Record<Hero['primary_attr'], Hero[]> = { str: [], agi: [], int: [], all: [] }
    for (const h of heroes) map[h.primary_attr]?.push(h)
    return map
  }, [heroes])

  if (isLoading || !heroes || !grouped) {
    return <div className="p-6 text-zinc-400">Загрузка героев...</div>
  }

  const totalAvg =
    history.length > 0
      ? history.reduce((s, r) => s + r.avgWinrate, 0) / history.length
      : null

  const myHero = myHeroId != null ? byId[myHeroId] : null

  return (
    <div className="min-h-screen p-4 max-w-[1400px] mx-auto space-y-4">
      {/* Header */}
      <header className="flex items-center justify-between bg-panel border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
          >
            ← на главную
          </Link>
          <div className="font-semibold">Quick Counterpick</div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {history.length > 0 && totalAvg != null && (
            <span className="text-zinc-400">
              Раундов: <span className="text-zinc-100">{history.length}</span>
              {' · Средний WR: '}
              <span
                className={
                  totalAvg >= 0.52
                    ? 'text-emerald-400'
                    : totalAvg <= 0.48
                      ? 'text-rose-400'
                      : 'text-zinc-100'
                }
              >
                {(totalAvg * 100).toFixed(1)}%
              </span>
            </span>
          )}
          <button
            onClick={() => setHistory([])}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
          >
            сброс
          </button>
        </div>
      </header>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => switchMode('random')}
          className={`text-sm rounded-lg px-4 py-2 font-medium transition ${
            mode === 'random'
              ? 'bg-emerald-700 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Случайный враг
        </button>
        <button
          onClick={() => switchMode('my-hero')}
          className={`text-sm rounded-lg px-4 py-2 font-medium transition ${
            mode === 'my-hero'
              ? 'bg-amber-700 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Мой герой
        </button>
      </div>

      {/* My-hero setup */}
      {mode === 'my-hero' && phase === 'setup' && (
        <div className="space-y-4">
          {!myHero ? (
            <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
              <div className="text-sm text-zinc-400">Выбери своего героя</div>
              <HeroPicker grouped={grouped} onPick={selectMyHero} disabledIds={new Set()} />
            </div>
          ) : (
            <div className="bg-panel border border-border rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-20">
                  <HeroIcon hero={myHero} variant="landscape" />
                </div>
                <div>
                  <div className="text-lg font-bold">{myHero.localized_name}</div>
                  <button
                    onClick={() => { setMyHeroId(null); setMyPos(null) }}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    сменить
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-zinc-400">Выбери позицию</div>
                <div className="flex gap-2">
                  {POSITIONS.map((p) => (
                    <button
                      key={p.pos}
                      onClick={() => setMyPos(p.pos)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                        myPos === p.pos
                          ? 'bg-amber-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {p.pos}. {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {myPos != null && (
                <button
                  onClick={startMyHeroRound}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-lg py-3 font-semibold"
                >
                  Начать
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Picking / Results phases */}
      {(phase === 'picking' || phase === 'results') && enemy && enemyPos != null && (
        <>
          {/* Enemy display */}
          <div className="bg-panel border border-border rounded-xl p-4">
            <div className="flex items-center gap-4">
              <div className="w-24">
                <HeroIcon hero={enemy} variant="landscape" />
              </div>
              <div>
                <div className="text-xs text-zinc-500">Враг</div>
                <div className="text-xl font-bold">{enemy.localized_name}</div>
                <div className="text-sm text-zinc-400">
                  {POSITIONS.find((p) => p.pos === enemyPos)?.label ?? `pos ${enemyPos}`}
                </div>
              </div>
              {phase === 'picking' && mode === 'random' && (
                <button
                  onClick={generateRandom}
                  className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
                >
                  пропустить →
                </button>
              )}
              {loadingMatchups && (
                <span className="ml-auto text-xs text-zinc-500">загрузка матчапов...</span>
              )}
            </div>
          </div>

          {/* Position slots */}
          <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
            <div className="text-sm text-zinc-500">Твоя команда — перетащи или кликни на слот, затем выбери героя</div>
            <div className="grid grid-cols-5 gap-3">
              {POSITIONS.map((p) => {
                const heroId = slots[p.pos]
                const hero = heroId != null ? byId[heroId] : null
                const wr = heroId != null ? getWr(heroId) : null
                const isActive = activeSlot === p.pos && phase === 'picking'
                return (
                  <PositionSlot
                    key={p.pos}
                    pos={p.pos}
                    label={p.label}
                    hero={hero}
                    winrate={wr?.winrate ?? null}
                    games={wr?.games ?? null}
                    isActive={isActive}
                    disabled={phase === 'results'}
                    onClick={() => {
                      if (phase !== 'picking') return
                      if (hero) {
                        removeSlot(p.pos)
                      } else {
                        setActiveSlot(isActive ? null : p.pos)
                      }
                    }}
                    onDrop={(heroId) => {
                      if (phase !== 'picking') return
                      assignSlot(p.pos, heroId)
                    }}
                  />
                )
              })}
            </div>
            {phase === 'picking' && filledCount > 0 && filledCount < 5 && (
              <button
                onClick={finishRound}
                className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-lg py-2.5 font-semibold text-sm"
              >
                Готово ({filledCount}/5)
              </button>
            )}
          </div>

          {/* Hero picker (during picking) */}
          {phase === 'picking' && !loadingMatchups && matchups && (
            <HeroPicker
              grouped={grouped}
              onPick={handleHeroPick}
              disabledIds={usedIds}
              matchups={matchups}
              enemyId={enemyId!}
            />
          )}

          {/* Results */}
          {phase === 'results' && (
            <div className="space-y-4">
              <ResultsView
                enemy={enemy}
                enemyPos={enemyPos}
                slots={Object.entries(slots).map(([pos, hid]) => ({
                  heroId: hid,
                  pos: Number(pos),
                  ...getWr(hid),
                }))}
                byId={byId}
              />
              <div className="flex gap-3">
                <button
                  onClick={newRound}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg py-3 font-semibold"
                >
                  Новый раунд
                </button>
                {mode === 'my-hero' && (
                  <button
                    onClick={() => {
                      setPhase('setup')
                      setEnemyId(null)
                      setSlots({})
                    }}
                    className="bg-zinc-700 hover:bg-zinc-600 rounded-lg px-6 py-3 text-sm font-semibold"
                  >
                    Сменить героя
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold">История</div>
          <div className="space-y-2">
            {history.map((round, ri) => (
              <div
                key={ri}
                className="flex items-center gap-3 bg-bg rounded-lg px-3 py-2 text-sm"
              >
                <span className="text-zinc-500 text-xs">#{history.length - ri}</span>
                <div className="w-8 shrink-0">
                  <HeroIcon hero={round.enemy} variant="portrait" />
                </div>
                <span className="text-zinc-500 text-xs">
                  {POSITIONS.find((p) => p.pos === round.enemyPos)?.label}
                </span>
                <span className="text-zinc-600 mx-1">vs</span>
                <div className="flex gap-1">
                  {round.slots.map((s) => {
                    const h = byId[s.heroId]
                    return h ? (
                      <div key={s.pos} className="w-7" title={`${h.localized_name} ${(s.winrate * 100).toFixed(1)}%`}>
                        <HeroIcon hero={h} variant="portrait" />
                      </div>
                    ) : null
                  })}
                </div>
                <span
                  className={`ml-auto font-bold ${
                    round.avgWinrate >= 0.52
                      ? 'text-emerald-400'
                      : round.avgWinrate <= 0.48
                        ? 'text-rose-400'
                        : 'text-zinc-300'
                  }`}
                >
                  {(round.avgWinrate * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Position slot with drag-and-drop
// ---------------------------------------------------------------------------

function PositionSlot({
  pos,
  label,
  hero,
  winrate,
  games,
  isActive,
  disabled,
  onClick,
  onDrop,
}: {
  pos: number
  label: string
  hero: Hero | null
  winrate: number | null
  games: number | null
  isActive: boolean
  disabled: boolean
  onClick: () => void
  onDrop: (heroId: number) => void
}) {
  const counter = useRef(0)
  const [isOver, setIsOver] = useState(false)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    counter.current += 1
    if (counter.current > 0) setIsOver(true)
  }
  const handleDragLeave = () => {
    counter.current = Math.max(0, counter.current - 1)
    if (counter.current === 0) setIsOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    counter.current = 0
    setIsOver(false)
    const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain')
    const heroId = Number(raw)
    if (Number.isFinite(heroId) && heroId > 0) onDrop(heroId)
  }

  return (
    <div
      onClick={onClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
      onDrop={handleDrop}
      className={clsx(
        'text-center rounded-lg p-2 transition cursor-pointer space-y-1',
        hero ? 'bg-bg/50' : 'border-2 border-dashed border-zinc-700 bg-bg/20',
        isActive && 'ring-2 ring-amber-400 bg-amber-900/20',
        isOver && 'ring-2 ring-emerald-400 bg-emerald-900/20 scale-[1.03]',
        disabled && 'pointer-events-none',
      )}
    >
      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
        {pos}. {label}
      </div>
      {hero ? (
        <>
          <div className="w-14 mx-auto">
            <HeroIcon hero={hero} variant="portrait" />
          </div>
          <div className="text-[10px] truncate">{hero.localized_name}</div>
          {winrate != null && (
            <div
              className={`text-xs font-bold ${
                winrate >= 0.52
                  ? 'text-emerald-400'
                  : winrate <= 0.48
                    ? 'text-rose-400'
                    : 'text-zinc-300'
              }`}
            >
              {(winrate * 100).toFixed(1)}%
            </div>
          )}
          {games != null && games > 0 && (
            <div className="text-[9px] text-zinc-600">{games.toLocaleString()} игр</div>
          )}
        </>
      ) : (
        <div className="aspect-[71/94] flex items-center justify-center">
          <span className="text-zinc-600 text-xs">пусто</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero picker with winrate hints
// ---------------------------------------------------------------------------

const ATTR_GROUPS = [
  { key: 'str' as const, label: 'Strength', color: 'text-rose-300' },
  { key: 'agi' as const, label: 'Agility', color: 'text-emerald-300' },
  { key: 'int' as const, label: 'Intelligence', color: 'text-sky-300' },
  { key: 'all' as const, label: 'Universal', color: 'text-amber-300' },
]

function HeroPicker({
  grouped,
  onPick,
  disabledIds,
  matchups,
  enemyId,
}: {
  grouped: Record<Hero['primary_attr'], Hero[]>
  onPick: (heroId: number) => void
  disabledIds: Set<number>
  matchups?: HeroMatchup[] | null
  enemyId?: number
}) {
  return (
    <div className="p-2">
      <div className="grid grid-cols-4 gap-8">
        {ATTR_GROUPS.map((g) => {
          const list = grouped[g.key]
          if (!list?.length) return <div key={g.key} />
          return (
            <div key={g.key} className="min-w-0">
              <div
                className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${g.color}`}
              >
                {g.label}
              </div>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))' }}
              >
                {list.map((h) => {
                  const disabled = disabledIds.has(h.id)
                  // Compute winrate hint for this hero vs enemy
                  let wrHint: string | undefined
                  if (matchups && enemyId != null && !disabled) {
                    const m = matchups.find((x) => x.hero_id === h.id)
                    if (m && m.games_played > 0) {
                      const wr = 1 - m.wins / m.games_played
                      wrHint = `${h.localized_name} — ${(wr * 100).toFixed(1)}% vs enemy`
                    }
                  }
                  return (
                    <DraggableHeroCell
                      key={h.id}
                      hero={h}
                      disabled={disabled}
                      onClick={!disabled ? () => onPick(h.id) : undefined}
                      title={wrHint ?? h.localized_name}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DraggableHeroCell({
  hero,
  disabled,
  onClick,
  title,
}: {
  hero: Hero
  disabled: boolean
  onClick?: () => void
  title: string
}) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(DND_MIME, String(hero.id))
    e.dataTransfer.setData('text/plain', String(hero.id))
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      draggable={!disabled}
      onDragStart={disabled ? undefined : onDragStart}
      className={disabled ? '' : 'cursor-grab active:cursor-grabbing'}
    >
      <HeroIcon
        hero={hero}
        variant="portrait"
        dim={disabled}
        selectable={!disabled}
        onClick={onClick}
        title={title}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results view with matchup bars
// ---------------------------------------------------------------------------

function ResultsView({
  enemy,
  enemyPos,
  slots,
  byId,
}: {
  enemy: Hero
  enemyPos: number
  slots: SlotHero[]
  byId: Record<number, Hero>
}) {
  const avg =
    slots.length > 0
      ? slots.reduce((s, x) => s + x.winrate, 0) / slots.length
      : null

  return (
    <div className="bg-panel border border-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Результат</div>
        {avg != null && (
          <div
            className={`text-lg font-bold ${
              avg >= 0.52
                ? 'text-emerald-400'
                : avg <= 0.48
                  ? 'text-rose-400'
                  : 'text-zinc-300'
            }`}
          >
            Средний WR: {(avg * 100).toFixed(1)}%
          </div>
        )}
      </div>
      <div className="space-y-2">
        {POSITIONS.map((p) => {
          const slot = slots.find((s) => s.pos === p.pos)
          const hero = slot ? byId[slot.heroId] : null
          return (
            <div key={p.pos} className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 w-14 shrink-0 uppercase">
                {p.label}
              </span>
              {hero && slot ? (
                <div className="flex items-center gap-1.5 flex-1">
                  <div className="w-8 shrink-0">
                    <HeroIcon hero={hero} variant="portrait" />
                  </div>
                  {/* Matchup bar */}
                  <div className="flex-1 flex h-7 rounded overflow-hidden text-[11px] font-bold">
                    <div
                      className="bg-emerald-600/80 flex items-center justify-center min-w-[2rem]"
                      style={{ width: `${Math.max(slot.winrate * 100, 8)}%` }}
                    >
                      {(slot.winrate * 100).toFixed(1)}%
                    </div>
                    <div
                      className="bg-rose-600/80 flex items-center justify-center min-w-[2rem]"
                      style={{ width: `${Math.max((1 - slot.winrate) * 100, 8)}%` }}
                    >
                      {((1 - slot.winrate) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="w-8 shrink-0">
                    <HeroIcon hero={enemy} variant="portrait" />
                  </div>
                  <span className="text-[10px] text-zinc-600 w-14 text-right shrink-0">
                    {slot.games.toLocaleString()} игр
                  </span>
                </div>
              ) : (
                <span className="text-zinc-600 text-xs italic">не выбран</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
