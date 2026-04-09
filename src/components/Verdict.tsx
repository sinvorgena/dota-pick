import { useMemo } from 'react'
import type { Hero } from '../types'
import { laneLabel } from '../lib/matchup'
import { HeroIcon } from './HeroIcon'
import { useDraftStore } from '../store/draftStore'
import { useHeroMatchups, useSampleMatches } from '../hooks/useMatchups'
import {
  computeRealLaneResults,
  computeCounterpicks,
  computeOverallWinProbability,
  realVerdictColor,
  realVerdictLabel,
  type RealLaneResult,
  type HeroCounterpickInfo,
  type WinProbability,
} from '../lib/realMatchup'

export function Verdict({ byId }: { byId: Record<number, Hero> }) {
  const draft = useDraftStore((s) => s.draft)

  const allHeroIds = useMemo(
    () => [...draft.picks.radiant, ...draft.picks.dire],
    [draft.picks],
  )
  const { data: matchups, isLoading, error } = useHeroMatchups(allHeroIds)

  const results = useMemo(
    () => computeRealLaneResults(byId, draft.picks, draft.assignments, matchups),
    [byId, draft.picks, draft.assignments, matchups],
  )

  const counterpicks = useMemo(
    () => computeCounterpicks(byId, draft.picks, draft.bans, matchups, 3),
    [byId, draft.picks, draft.bans, matchups],
  )

  const winProb = useMemo(
    () => computeOverallWinProbability(draft.picks, matchups),
    [draft.picks, matchups],
  )

  const radiantCPs = counterpicks.filter((c) => c.side === 'radiant')
  const direCPs = counterpicks.filter((c) => c.side === 'dire')

  return (
    <div className="space-y-6">
      {/* Overall win probability */}
      <WinProbabilityBar winProb={winProb} isLoading={isLoading} />

      {/* Lane analysis */}
      <div>
        <h2 className="text-xl font-semibold">Анализ лайнов</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Источник: OpenDota — public matches последнего патча. Для каждой пары
          (radiant × dire) на лайне берётся винрейт, усреднённый с весом по играм.
        </p>
        {isLoading && (
          <div className="text-xs text-zinc-400 mt-2">
            Загружаю данные матчапов...
          </div>
        )}
        {error && (
          <div className="text-xs text-rose-400 mt-2">
            Ошибка загрузки: {error.message}
          </div>
        )}
      </div>

      <div className="grid gap-3">
        {results.map((r) => (
          <LaneCard key={r.lane} result={r} />
        ))}
      </div>

      {/* Counterpicks section */}
      <div>
        <h2 className="text-xl font-semibold">Контрпики</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Кто из вражеской команды контрит каждого героя + 3 потенциальных
          контрпика, которые не были пикнуты/забанены.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-emerald-400 mb-2">
            Radiant
          </h3>
          <div className="space-y-2">
            {radiantCPs.map((c) => (
              <CounterpickCard key={c.hero.id} info={c} byId={byId} />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-rose-400 mb-2">Dire</h3>
          <div className="space-y-2">
            {direCPs.map((c) => (
              <CounterpickCard key={c.hero.id} info={c} byId={byId} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Win probability bar
// ---------------------------------------------------------------------------

function WinProbabilityBar({
  winProb,
  isLoading,
}: {
  winProb: WinProbability
  isLoading: boolean
}) {
  const rPct = (winProb.radiantWinProb * 100).toFixed(1)
  const dPct = ((1 - winProb.radiantWinProb) * 100).toFixed(1)
  const rWidth = Math.max(winProb.radiantWinProb * 100, 5)
  const dWidth = Math.max((1 - winProb.radiantWinProb) * 100, 5)

  const delta = Math.abs(winProb.radiantWinProb - 0.5) * 100
  let summary: string
  if (isLoading) summary = 'Расчёт...'
  else if (winProb.pairsCount === 0) summary = 'Нет данных для расчёта'
  else if (delta < 1) summary = 'Драфт абсолютно равный'
  else if (delta < 2.5) summary = 'Драфт почти равный'
  else if (delta < 5)
    summary = `Небольшое преимущество ${winProb.radiantWinProb > 0.5 ? 'Radiant' : 'Dire'}`
  else
    summary = `Преимущество ${winProb.radiantWinProb > 0.5 ? 'Radiant' : 'Dire'}`

  return (
    <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Шанс выигрыша</h2>
        <span className="text-xs text-zinc-500">
          {winProb.pairsCount} пар · {winProb.totalGames.toLocaleString()} игр
        </span>
      </div>

      <div className="flex h-8 rounded overflow-hidden text-sm font-bold">
        <div
          className="bg-emerald-600 flex items-center justify-center transition-all duration-500"
          style={{ width: `${rWidth}%` }}
        >
          {rPct}%
        </div>
        <div
          className="bg-rose-600 flex items-center justify-center transition-all duration-500"
          style={{ width: `${dWidth}%` }}
        >
          {dPct}%
        </div>
      </div>

      <div className="flex justify-between text-xs">
        <span className="text-emerald-400">Radiant</span>
        <span
          className={
            delta < 2.5
              ? 'text-zinc-400'
              : winProb.radiantWinProb > 0.5
                ? 'text-emerald-400'
                : 'text-rose-400'
          }
        >
          {summary}
        </span>
        <span className="text-rose-400">Dire</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Counterpick card per hero
// ---------------------------------------------------------------------------

function CounterpickCard({
  info,
}: {
  info: HeroCounterpickInfo
  byId: Record<number, Hero>
}) {
  const hasCounters = info.counters.length > 0
  const hasPotentials = info.potentials.length > 0

  return (
    <div className="bg-panel border border-border rounded-lg p-3 space-y-2">
      {/* Hero header */}
      <div className="flex items-center gap-2">
        <div className="w-12">
          <HeroIcon hero={info.hero} />
        </div>
        <div>
          <div className="text-sm font-semibold">
            {info.hero.localized_name}
          </div>
          {!hasCounters && !hasPotentials && (
            <div className="text-xs text-zinc-500">контрпиков нет</div>
          )}
        </div>
      </div>

      {/* Active counters from enemy team */}
      {hasCounters && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            контрят из вражеского пика
          </div>
          {info.counters.map((c) => (
            <div
              key={c.counter.id}
              className="flex items-center gap-2 text-xs bg-bg/60 rounded px-2 py-1"
            >
              <div className="w-8">
                <HeroIcon hero={c.counter} />
              </div>
              <span className="text-zinc-300">{c.counter.localized_name}</span>
              <span className="ml-auto text-rose-400 font-semibold">
                {(c.winrate * 100).toFixed(1)}%
              </span>
              <span className="text-zinc-600">
                {c.games.toLocaleString()} игр
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Potential counters not in draft */}
      {hasPotentials && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            могли контрить (не пикнуты/забанены)
          </div>
          {info.potentials.map((p) => (
            <div
              key={p.counter.id}
              className="flex items-center gap-2 text-xs bg-bg/60 rounded px-2 py-1 opacity-70"
            >
              <div className="w-8">
                <HeroIcon hero={p.counter} />
              </div>
              <span className="text-zinc-400">{p.counter.localized_name}</span>
              <span className="ml-auto text-amber-400">
                {(p.winrate * 100).toFixed(1)}%
              </span>
              <span className="text-zinc-600">
                {p.games.toLocaleString()} игр
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lane card (unchanged)
// ---------------------------------------------------------------------------

function LaneCard({ result }: { result: RealLaneResult }) {
  const wrPct =
    result.avgWinrate !== null ? (result.avgWinrate * 100).toFixed(1) : '—'

  const radiantIds = result.radiantHeroes.map((h) => h.id)
  const direIds = result.direHeroes.map((h) => h.id)

  return (
    <div className="bg-panel border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-sm font-semibold w-32">{laneLabel[result.lane]}</div>

        <div className="flex items-center gap-1">
          {result.radiantHeroes.length === 0 && (
            <span className="text-xs text-zinc-600 italic">пусто</span>
          )}
          {result.radiantHeroes.map((h) => (
            <div key={h.id} className="w-12"><HeroIcon hero={h} /></div>
          ))}
        </div>
        <div className="text-xs text-zinc-500">vs</div>
        <div className="flex items-center gap-1">
          {result.direHeroes.length === 0 && (
            <span className="text-xs text-zinc-600 italic">пусто</span>
          )}
          {result.direHeroes.map((h) => (
            <div key={h.id} className="w-12"><HeroIcon hero={h} /></div>
          ))}
        </div>

        <div className="ml-auto text-right">
          <div className={`font-semibold ${realVerdictColor[result.verdict]}`}>
            {realVerdictLabel[result.verdict]}
          </div>
          <div className="text-xs text-zinc-500">
            Radiant WR {wrPct}% · {result.totalGames.toLocaleString()} игр
          </div>
        </div>
      </div>

      {result.pairs.length > 0 && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer hover:text-zinc-200">
            подробнее по парам ({result.pairs.length})
          </summary>
          <div className="mt-2 grid gap-1">
            {result.pairs
              .slice()
              .sort((a, b) => b.games - a.games)
              .map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-bg/60 rounded px-2 py-1"
                >
                  <div className="w-10"><HeroIcon hero={p.radiantHero} /></div>
                  <span className="text-zinc-500">vs</span>
                  <div className="w-10"><HeroIcon hero={p.direHero} /></div>
                  <span className="ml-auto">
                    {(p.winrate * 100).toFixed(1)}% radiant ·{' '}
                    {p.games.toLocaleString()} игр
                  </span>
                </div>
              ))}
          </div>
        </details>
      )}

      <SampleMatches radiantIds={radiantIds} direIds={direIds} />
    </div>
  )
}

function SampleMatches({
  radiantIds,
  direIds,
}: {
  radiantIds: number[]
  direIds: number[]
}) {
  const { data, isLoading, error } = useSampleMatches(radiantIds, direIds)

  if (radiantIds.length === 0 && direIds.length === 0) return null

  const rows = data?.rows ?? []
  const total = data?.totalCount ?? 0
  const capped = data?.capped ?? false
  const VISIBLE = 10
  const visibleRows = rows.slice(0, VISIBLE)

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
        реальные матчи с такой связкой на лайне
        {isLoading ? (
          <span className="text-zinc-600"> · ...</span>
        ) : (
          <span className="text-amber-300/80">
            {' · '}найдено {total.toLocaleString()}
            {capped && '+'}
          </span>
        )}
      </summary>
      <div className="mt-2 space-y-1">
        {isLoading && <div className="text-zinc-500">поиск матчей...</div>}
        {error && <div className="text-rose-400">не удалось получить</div>}
        {data && rows.length === 0 && (
          <div className="text-zinc-500">матчей с такой связкой не найдено</div>
        )}
        {visibleRows.map((m) => {
          const date = new Date(m.start_time * 1000)
          return (
            <a
              key={m.match_id}
              href={`https://www.opendota.com/matches/${m.match_id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 bg-bg/60 hover:bg-bg rounded px-2 py-1 text-zinc-300"
            >
              <span className="font-mono">{m.match_id}</span>
              <span className="text-zinc-500">
                {date.toLocaleDateString()}
              </span>
              <span className="text-zinc-500">
                {Math.floor(m.duration / 60)}:
                {String(m.duration % 60).padStart(2, '0')}
              </span>
              {m.avg_rank_tier != null && (
                <span className="text-zinc-500">rank {m.avg_rank_tier}</span>
              )}
              <span
                className={`ml-auto font-semibold ${
                  m.radiant_win ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {m.radiant_win ? 'Radiant W' : 'Dire W'}
              </span>
            </a>
          )
        })}
        {rows.length > VISIBLE && (
          <div className="text-[10px] text-zinc-600 italic pt-1">
            показано {VISIBLE} из {total.toLocaleString()}
            {capped && '+'}
          </div>
        )}
      </div>
    </details>
  )
}
