import { useMemo } from 'react'
import type { Hero } from '../types'
import { laneLabel } from '../lib/matchup'
import { HeroIcon } from './HeroIcon'
import { useDraftStore } from '../store/draftStore'
import { useHeroMatchups, useSampleMatches } from '../hooks/useMatchups'
import {
  computeRealLaneResults,
  realVerdictColor,
  realVerdictLabel,
  type RealLaneResult,
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

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Анализ лайнов · реальные матчи</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Источник: OpenDota — public matches последнего патча. Для каждой пары
          (radiant hero × dire hero) на лайне берётся винрейт и усредняется с
          весом по сыгранным играм.
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
    </div>
  )
}

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

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
        примеры реальных матчей с такой связкой на лайне
      </summary>
      <div className="mt-2 space-y-1">
        {isLoading && <div className="text-zinc-500">поиск матчей...</div>}
        {error && <div className="text-rose-400">не удалось получить</div>}
        {data && data.length === 0 && (
          <div className="text-zinc-500">матчей с такой связкой не найдено</div>
        )}
        {data?.map((m) => {
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
      </div>
    </details>
  )
}
