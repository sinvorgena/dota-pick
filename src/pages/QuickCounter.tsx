import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHeroes } from '../hooks/useHeroes'
import { fetchHeroMatchups, type HeroMatchup } from '../api/matchups'
import { HeroIcon } from '../components/HeroIcon'
import type { Hero } from '../types'

interface RoundResult {
  enemy: Hero
  pick: Hero
  winrate: number
  games: number
  bestCounter: Hero | null
  bestWinrate: number
}

export default function QuickCounter() {
  const { data: heroes, byId, isLoading } = useHeroes()

  const [enemyId, setEnemyId] = useState<number | null>(null)
  const [matchups, setMatchups] = useState<HeroMatchup[] | null>(null)
  const [history, setHistory] = useState<RoundResult[]>([])
  const [loading, setLoading] = useState(false)

  const pickRandom = useCallback(() => {
    if (!heroes || heroes.length === 0) return
    const idx = Math.floor(Math.random() * heroes.length)
    const hero = heroes[idx]
    setEnemyId(hero.id)
    setMatchups(null)
    setLoading(true)
    fetchHeroMatchups(hero.id)
      .then((m) => setMatchups(m))
      .catch(() => setMatchups([]))
      .finally(() => setLoading(false))
  }, [heroes])

  // Pick first random hero on load
  useEffect(() => {
    if (heroes && heroes.length > 0 && enemyId === null) {
      pickRandom()
    }
  }, [heroes, enemyId, pickRandom])

  const enemy = enemyId != null ? byId[enemyId] : null

  // Pre-compute best counter for current enemy
  const bestCounter = useMemo(() => {
    if (!matchups || !byId) return null
    let best: HeroMatchup | null = null
    for (const m of matchups) {
      if (!byId[m.hero_id]) continue
      // winrate from the perspective of the enemy hero — lower = better counter
      const wr = m.wins / m.games_played
      if (!best || wr < best.wins / best.games_played) {
        best = m
      }
    }
    return best
  }, [matchups, byId])

  const handlePick = (heroId: number) => {
    if (!enemy || !matchups || !byId[heroId]) return
    const m = matchups.find((x) => x.hero_id === heroId)
    // winrate is from enemy's perspective: low = good counter
    const enemyWr = m ? m.wins / m.games_played : 0.5
    const counterWr = 1 - enemyWr
    const games = m?.games_played ?? 0

    const bestHero = bestCounter && byId[bestCounter.hero_id] ? byId[bestCounter.hero_id] : null
    const bestWr = bestCounter ? 1 - bestCounter.wins / bestCounter.games_played : 0.5

    setHistory((h) => [
      {
        enemy,
        pick: byId[heroId],
        winrate: counterWr,
        games,
        bestCounter: bestHero,
        bestWinrate: bestWr,
      },
      ...h,
    ])

    // Next round
    pickRandom()
  }

  // Group heroes by attribute for the picker
  const grouped = useMemo(() => {
    if (!heroes) return null
    const map: Record<Hero['primary_attr'], Hero[]> = { str: [], agi: [], int: [], all: [] }
    for (const h of heroes) map[h.primary_attr]?.push(h)
    return map
  }, [heroes])

  if (isLoading || !heroes || !grouped) {
    return <div className="p-6 text-zinc-400">Загрузка героев...</div>
  }

  const avgWinrate =
    history.length > 0
      ? history.reduce((s, r) => s + r.winrate, 0) / history.length
      : null

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
          {history.length > 0 && (
            <span className="text-zinc-400">
              Раундов: <span className="text-zinc-100">{history.length}</span>
              {avgWinrate != null && (
                <>
                  {' · Средний WR: '}
                  <span
                    className={
                      avgWinrate >= 0.52
                        ? 'text-emerald-400'
                        : avgWinrate <= 0.48
                          ? 'text-rose-400'
                          : 'text-zinc-100'
                    }
                  >
                    {(avgWinrate * 100).toFixed(1)}%
                  </span>
                </>
              )}
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

      {/* Enemy hero display */}
      {enemy && (
        <div className="bg-panel border border-border rounded-xl p-6 text-center space-y-3">
          <div className="text-sm text-zinc-500">Выбери контрпик для</div>
          <div className="flex justify-center">
            <div className="w-32">
              <HeroIcon hero={enemy} variant="landscape" />
            </div>
          </div>
          <div className="text-xl font-bold">{enemy.localized_name}</div>
          {loading && (
            <div className="text-xs text-zinc-500">Загрузка матчапов...</div>
          )}
          <button
            onClick={pickRandom}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            пропустить →
          </button>
        </div>
      )}

      {/* Hero picker grid */}
      {!loading && matchups && (
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
                      const isEnemy = h.id === enemyId
                      return (
                        <HeroIcon
                          key={h.id}
                          hero={h}
                          variant="portrait"
                          dim={isEnemy}
                          selectable={!isEnemy}
                          onClick={!isEnemy ? () => handlePick(h.id) : undefined}
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
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
          <div className="text-sm font-semibold">История</div>
          <div className="space-y-2">
            {history.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-bg rounded-lg px-3 py-2 text-sm"
              >
                <div className="w-10 shrink-0">
                  <HeroIcon hero={r.enemy} variant="portrait" />
                </div>
                <span className="text-zinc-500">vs</span>
                <div className="w-10 shrink-0">
                  <HeroIcon hero={r.pick} variant="portrait" />
                </div>
                <span className="font-semibold">{r.pick.localized_name}</span>
                <span
                  className={
                    r.winrate >= 0.52
                      ? 'text-emerald-400'
                      : r.winrate <= 0.48
                        ? 'text-rose-400'
                        : 'text-zinc-300'
                  }
                >
                  {(r.winrate * 100).toFixed(1)}%
                </span>
                <span className="text-zinc-600 text-xs">
                  ({r.games.toLocaleString()} игр)
                </span>
                {r.bestCounter && (
                  <span className="ml-auto text-xs text-zinc-500 flex items-center gap-1">
                    лучший:
                    <span className="w-6 inline-block">
                      <HeroIcon hero={r.bestCounter} variant="portrait" />
                    </span>
                    <span className="text-emerald-400">
                      {(r.bestWinrate * 100).toFixed(1)}%
                    </span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
