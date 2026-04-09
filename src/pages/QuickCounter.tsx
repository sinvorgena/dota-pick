import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHeroes } from '../hooks/useHeroes'
import { fetchHeroMatchups, type HeroMatchup } from '../api/matchups'
import { HeroIcon } from '../components/HeroIcon'
import type { Hero } from '../types'

const POSITIONS = [
  { pos: 1, label: 'Carry', short: 'pos 1', roleHints: ['Carry'] },
  { pos: 2, label: 'Mid', short: 'pos 2', roleHints: ['Nuker', 'Pusher'] },
  { pos: 3, label: 'Offlane', short: 'pos 3', roleHints: ['Initiator', 'Durable'] },
  { pos: 4, label: 'Soft Support', short: 'pos 4', roleHints: ['Disabler', 'Initiator'] },
  { pos: 5, label: 'Hard Support', short: 'pos 5', roleHints: ['Support'] },
] as const

interface EnemySlot {
  hero: Hero
  pos: number
  label: string
  matchups: HeroMatchup[] | null
}

interface CounterSlot {
  hero: Hero
  pos: number
  winrate: number
  games: number
}

interface RoundHistory {
  enemies: EnemySlot[]
  counters: CounterSlot[]
  avgWinrate: number
}

type Mode = 'random' | 'my-hero'

function pickRandomForRole(heroes: Hero[], roleHints: readonly string[], exclude: Set<number>): Hero | null {
  const matching = heroes.filter(
    (h) => !exclude.has(h.id) && h.roles.some((r) => roleHints.includes(r)),
  )
  const pool = matching.length > 0 ? matching : heroes.filter((h) => !exclude.has(h.id))
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QuickCounter() {
  const { data: heroes, byId, isLoading } = useHeroes()

  const [mode, setMode] = useState<Mode>('random')
  const [enemies, setEnemies] = useState<EnemySlot[]>([])
  const [counters, setCounters] = useState<CounterSlot[]>([])
  const [currentPos, setCurrentPos] = useState(0)
  const [phase, setPhase] = useState<'setup' | 'picking' | 'results'>('picking')
  const [history, setHistory] = useState<RoundHistory[]>([])
  const [loadingMatchups, setLoadingMatchups] = useState(false)

  // My-hero mode state
  const [myHeroId, setMyHeroId] = useState<number | null>(null)
  const [myPos, setMyPos] = useState<number | null>(null)
  const [myHeroMatchups, setMyHeroMatchups] = useState<HeroMatchup[] | null>(null)

  const generateEnemies = useCallback(() => {
    if (!heroes || heroes.length === 0) return
    const used = new Set<number>()
    if (myHeroId != null) used.add(myHeroId)
    const slots: EnemySlot[] = []
    for (const p of POSITIONS) {
      const hero = pickRandomForRole(heroes, p.roleHints, used)
      if (hero) {
        used.add(hero.id)
        slots.push({ hero, pos: p.pos, label: p.label, matchups: null })
      }
    }
    setEnemies(slots)
    setCounters([])
    setCurrentPos(0)
    setPhase('picking')

    setLoadingMatchups(true)
    Promise.all(
      slots.map((s) =>
        fetchHeroMatchups(s.hero.id)
          .then((m) => ({ heroId: s.hero.id, matchups: m }))
          .catch(() => ({ heroId: s.hero.id, matchups: [] as HeroMatchup[] })),
      ),
    ).then((results) => {
      setEnemies((prev) =>
        prev.map((s) => {
          const found = results.find((r) => r.heroId === s.hero.id)
          return found ? { ...s, matchups: found.matchups } : s
        }),
      )
      setLoadingMatchups(false)
    })
  }, [heroes, myHeroId])

  // Init on load (random mode)
  useEffect(() => {
    if (heroes && heroes.length > 0 && enemies.length === 0 && mode === 'random') {
      generateEnemies()
    }
  }, [heroes, enemies.length, generateEnemies, mode])

  const currentEnemy = enemies[currentPos] ?? null
  const usedHeroIds = useMemo(() => {
    const s = new Set<number>()
    for (const e of enemies) s.add(e.hero.id)
    for (const c of counters) s.add(c.hero.id)
    if (myHeroId != null) s.add(myHeroId)
    return s
  }, [enemies, counters, myHeroId])

  const handlePick = (heroId: number) => {
    if (!currentEnemy || !byId[heroId]) return

    const m = currentEnemy.matchups?.find((x) => x.hero_id === heroId)
    const enemyWr = m && m.games_played > 0 ? m.wins / m.games_played : 0.5
    const counterWr = 1 - enemyWr

    const newCounters = [
      ...counters,
      {
        hero: byId[heroId],
        pos: currentEnemy.pos,
        winrate: counterWr,
        games: m?.games_played ?? 0,
      },
    ]
    setCounters(newCounters)

    if (currentPos + 1 >= enemies.length) {
      finishRound(newCounters)
    } else {
      setCurrentPos(currentPos + 1)
    }
  }

  const finishRound = (finalCounters?: CounterSlot[]) => {
    const c = finalCounters ?? counters
    if (c.length === 0) {
      setPhase('results')
      return
    }
    const avg = c.reduce((s, x) => s + x.winrate, 0) / c.length
    setHistory((h) => [{ enemies: [...enemies], counters: c, avgWinrate: avg }, ...h])
    setPhase('results')
  }

  // My-hero mode: pick your hero
  const selectMyHero = (heroId: number) => {
    setMyHeroId(heroId)
    setMyHeroMatchups(null)
    fetchHeroMatchups(heroId)
      .then((m) => setMyHeroMatchups(m))
      .catch(() => setMyHeroMatchups([]))
  }

  // My-hero mode: after selecting hero+pos, generate enemies and start
  const startMyHeroRound = () => {
    if (myHeroId == null || myPos == null) return
    generateEnemies()
  }

  // Switch modes
  const switchMode = (m: Mode) => {
    setMode(m)
    setEnemies([])
    setCounters([])
    setCurrentPos(0)
    setMyHeroId(null)
    setMyPos(null)
    setMyHeroMatchups(null)
    if (m === 'random') {
      setPhase('picking')
    } else {
      setPhase('setup')
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
          Случайные враги
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

      {/* My-hero setup phase */}
      {mode === 'my-hero' && phase === 'setup' && (
        <div className="space-y-4">
          {!myHero ? (
            <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
              <div className="text-sm text-zinc-400">Выбери своего героя</div>
              <HeroPicker
                grouped={grouped}
                onPick={selectMyHero}
                disabledIds={new Set()}
              />
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
                    сменить героя
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
                  Сгенерировать врагов и начать
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* My-hero mode: show my hero's winrates against enemies */}
      {mode === 'my-hero' && phase !== 'setup' && myHero && (
        <div className="bg-panel border border-border rounded-xl p-3 text-center text-sm">
          Твой герой:{' '}
          <span className="font-semibold text-amber-300">{myHero.localized_name}</span>
          <span className="text-zinc-500"> (pos {myPos})</span>
        </div>
      )}

      {/* Enemy team display */}
      {enemies.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
          <div className="text-sm text-zinc-500">Вражеская команда</div>
          <div className="grid grid-cols-5 gap-3">
            {enemies.map((e, i) => {
              const counter = counters.find((c) => c.pos === e.pos)
              const isCurrent = phase === 'picking' && i === currentPos
              // In my-hero mode show my hero's WR against this enemy
              const myWr = mode === 'my-hero' && myHeroMatchups && phase === 'results'
                ? (() => {
                    const m = myHeroMatchups.find((x) => x.hero_id === e.hero.id)
                    return m && m.games_played > 0 ? m.wins / m.games_played : null
                  })()
                : null
              return (
                <div
                  key={e.hero.id}
                  className={`text-center space-y-1 rounded-lg p-2 transition ${
                    isCurrent
                      ? 'ring-2 ring-amber-400 bg-amber-900/20'
                      : 'bg-bg/50'
                  }`}
                >
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                    {e.label}
                  </div>
                  <div className="w-16 mx-auto">
                    <HeroIcon hero={e.hero} variant="portrait" />
                  </div>
                  <div className="text-xs font-medium truncate">
                    {e.hero.localized_name}
                  </div>
                  {myWr != null && (
                    <div
                      className={`text-[10px] font-bold ${
                        myWr >= 0.52
                          ? 'text-emerald-400'
                          : myWr <= 0.48
                            ? 'text-rose-400'
                            : 'text-zinc-400'
                      }`}
                    >
                      твой WR: {(myWr * 100).toFixed(1)}%
                    </div>
                  )}
                  {counter && (
                    <div className="mt-1 space-y-1">
                      <div className="text-[10px] text-zinc-600">vs</div>
                      <div className="w-12 mx-auto">
                        <HeroIcon hero={counter.hero} variant="portrait" />
                      </div>
                      <div className="text-[10px] truncate">{counter.hero.localized_name}</div>
                      <div
                        className={`text-xs font-bold ${
                          counter.winrate >= 0.52
                            ? 'text-emerald-400'
                            : counter.winrate <= 0.48
                              ? 'text-rose-400'
                              : 'text-zinc-300'
                        }`}
                      >
                        {(counter.winrate * 100).toFixed(1)}%
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {phase === 'picking' && counters.length > 0 && (
            <button
              onClick={() => finishRound()}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              завершить досрочно →
            </button>
          )}
        </div>
      )}

      {/* Picking phase */}
      {phase === 'picking' && currentEnemy && (
        <>
          <div className="bg-panel border border-border rounded-xl p-3 text-center text-sm">
            Выбери контрпик для{' '}
            <span className="font-semibold text-amber-300">
              {currentEnemy.hero.localized_name}
            </span>
            {' '}
            <span className="text-zinc-500">({currentEnemy.label})</span>
            {loadingMatchups && (
              <span className="text-zinc-600 ml-2">загрузка матчапов...</span>
            )}
          </div>

          <HeroPicker
            grouped={grouped}
            onPick={handlePick}
            disabledIds={usedHeroIds}
          />
        </>
      )}

      {/* Results phase */}
      {phase === 'results' && (
        <div className="space-y-4">
          <ResultsCard
            enemies={enemies}
            counters={counters}
            myHero={mode === 'my-hero' ? myHero : null}
            myHeroMatchups={mode === 'my-hero' ? myHeroMatchups : null}
          />
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (mode === 'my-hero') {
                  generateEnemies()
                } else {
                  generateEnemies()
                }
              }}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded-lg py-3 font-semibold"
            >
              Новый раунд
            </button>
            {mode === 'my-hero' && (
              <button
                onClick={() => {
                  setPhase('setup')
                  setEnemies([])
                  setCounters([])
                }}
                className="bg-zinc-700 hover:bg-zinc-600 rounded-lg px-6 py-3 font-semibold text-sm"
              >
                Сменить героя
              </button>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold">История раундов</div>
          <div className="space-y-2">
            {history.map((round, ri) => (
              <details key={ri} className="bg-bg rounded-lg">
                <summary className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-zinc-800/50 rounded-lg text-sm">
                  <span className="text-zinc-500">#{history.length - ri}</span>
                  <div className="flex gap-1">
                    {round.enemies.map((e) => (
                      <div key={e.hero.id} className="w-7">
                        <HeroIcon hero={e.hero} variant="portrait" />
                      </div>
                    ))}
                  </div>
                  <span className="text-zinc-600">vs</span>
                  <div className="flex gap-1">
                    {round.counters.map((c) => (
                      <div key={c.hero.id} className="w-7">
                        <HeroIcon hero={c.hero} variant="portrait" />
                      </div>
                    ))}
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
                </summary>
                <div className="px-3 pb-3">
                  <ResultsCard enemies={round.enemies} counters={round.counters} />
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero picker grid (reusable)
// ---------------------------------------------------------------------------

function HeroPicker({
  grouped,
  onPick,
  disabledIds,
}: {
  grouped: Record<Hero['primary_attr'], Hero[]>
  onPick: (heroId: number) => void
  disabledIds: Set<number>
}) {
  return (
    <div className="p-2">
      <div className="grid grid-cols-4 gap-8">
        {(
          [
            { key: 'str' as const, label: 'Strength', color: 'text-rose-300' },
            { key: 'agi' as const, label: 'Agility', color: 'text-emerald-300' },
            { key: 'int' as const, label: 'Intelligence', color: 'text-sky-300' },
            { key: 'all' as const, label: 'Universal', color: 'text-amber-300' },
          ] as const
        ).map((g) => {
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
                style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))',
                }}
              >
                {list.map((h) => {
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results card
// ---------------------------------------------------------------------------

function ResultsCard({
  enemies,
  counters,
  myHero,
  myHeroMatchups,
}: {
  enemies: EnemySlot[]
  counters: CounterSlot[]
  myHero?: Hero | null
  myHeroMatchups?: HeroMatchup[] | null
}) {
  const avg =
    counters.length > 0
      ? counters.reduce((s, c) => s + c.winrate, 0) / counters.length
      : null

  return (
    <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
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
        {enemies.map((e) => {
          const counter = counters.find((c) => c.pos === e.pos)
          const myWr = myHero && myHeroMatchups
            ? (() => {
                const m = myHeroMatchups.find((x) => x.hero_id === e.hero.id)
                return m && m.games_played > 0 ? m.wins / m.games_played : null
              })()
            : null
          return (
            <div
              key={e.hero.id}
              className="flex items-center gap-3 bg-bg rounded-lg px-3 py-2 text-sm"
            >
              <span className="text-[10px] text-zinc-500 w-12 shrink-0 uppercase">
                {e.label}
              </span>
              <div className="w-10 shrink-0">
                <HeroIcon hero={e.hero} variant="portrait" />
              </div>
              <span className="text-zinc-400 w-28 truncate">
                {e.hero.localized_name}
              </span>
              {myWr != null && (
                <span
                  className={`text-xs ${
                    myWr >= 0.52 ? 'text-emerald-400' : myWr <= 0.48 ? 'text-rose-400' : 'text-zinc-400'
                  }`}
                >
                  ({(myWr * 100).toFixed(1)}%)
                </span>
              )}
              {counter ? (
                <>
                  <span className="text-zinc-600">vs</span>
                  <div className="w-10 shrink-0">
                    <HeroIcon hero={counter.hero} variant="portrait" />
                  </div>
                  <span className="text-zinc-300 w-28 truncate">
                    {counter.hero.localized_name}
                  </span>
                  <span
                    className={`ml-auto font-bold ${
                      counter.winrate >= 0.52
                        ? 'text-emerald-400'
                        : counter.winrate <= 0.48
                          ? 'text-rose-400'
                          : 'text-zinc-300'
                    }`}
                  >
                    {(counter.winrate * 100).toFixed(1)}%
                  </span>
                  <span className="text-zinc-600 text-xs">
                    {counter.games.toLocaleString()} игр
                  </span>
                </>
              ) : (
                <span className="text-zinc-600 italic ml-auto">не выбран</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
