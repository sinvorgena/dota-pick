import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import clsx from 'clsx'
import { useHeroes } from '../hooks/useHeroes'
import {
  fetchPlayerMatches,
  fetchPlayerProfile,
  type OpenDotaPlayerMatch,
} from '../api/playerMatches'
import {
  loadSavedPlayers,
  parsePlayerId,
  saveSavedPlayers,
  type SavedPlayer,
} from '../lib/players'
import { HeroIcon } from '../components/HeroIcon'
import type { Hero } from '../types'

type MatchLimit = 50 | 100 | 200

const LIMIT_OPTIONS: MatchLimit[] = [50, 100, 200]

function isWin(m: OpenDotaPlayerMatch) {
  const isRadiant = m.player_slot < 128
  return isRadiant === m.radiant_win
}

function formatDuration(sec: number) {
  const mm = Math.floor(sec / 60)
  const ss = sec % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

function dayKey(ts: number) {
  const d = new Date(ts * 1000)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function formatDay(ts: number) {
  const d = new Date(ts)
  return d.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function todayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function daysAgoISO(days: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export default function Friends() {
  const navigate = useNavigate()
  const { byId: heroesById, isLoading: heroesLoading } = useHeroes()

  const [players, setPlayers] = useState<SavedPlayer[]>(() => loadSavedPlayers())
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  const [dateFrom, setDateFrom] = useState<string>(daysAgoISO(30))
  const [dateTo, setDateTo] = useState<string>(todayISO())
  const [limit, setLimit] = useState<MatchLimit>(100)
  const [winsOnly, setWinsOnly] = useState(false)

  useEffect(() => {
    saveSavedPlayers(players)
  }, [players])

  const addPlayer = async () => {
    const id = parsePlayerId(input)
    if (!id) {
      setInputError(
        'Не смог распознать. Поддерживаю: account_id, steamid64, ссылка на Dotabuff / OpenDota / Stratz, ссылка на Steam profile.',
      )
      return
    }
    if (players.some((p) => p.accountId === id)) {
      setInputError('Этот игрок уже добавлен.')
      return
    }
    setInputError(null)
    setPlayers((prev) => [...prev, { accountId: id, label: `id ${id}` }])
    setInput('')
    try {
      const profile = await fetchPlayerProfile(id)
      const name = profile.profile?.personaname
      if (name) {
        setPlayers((prev) =>
          prev.map((p) =>
            p.accountId === id ? { ...p, label: name } : p,
          ),
        )
      }
    } catch {
      /* leave fallback label */
    }
  }

  const removePlayer = (accountId: string) => {
    setPlayers((prev) => prev.filter((p) => p.accountId !== accountId))
  }

  const fromTs = useMemo(
    () => Math.floor(new Date(dateFrom).getTime() / 1000),
    [dateFrom],
  )
  const toTs = useMemo(() => {
    const d = new Date(dateTo)
    d.setHours(23, 59, 59, 999)
    return Math.floor(d.getTime() / 1000)
  }, [dateTo])

  const queries = useQueries({
    queries: players.map((p) => ({
      queryKey: ['player-matches', p.accountId, limit],
      queryFn: () => fetchPlayerMatches(p.accountId, limit),
      staleTime: 1000 * 60 * 5,
    })),
  })

  const loading = queries.some((q) => q.isLoading)
  const failed = queries
    .map((q, i) => (q.error ? players[i] : null))
    .filter(Boolean) as SavedPlayer[]

  const filtered = useMemo(
    () =>
      queries.map((q) => {
        const data = q.data ?? []
        return data.filter((m) => {
          if (m.start_time < fromTs || m.start_time > toTs) return false
          if (winsOnly && !isWin(m)) return false
          return true
        })
      }),
    [queries, fromTs, toTs, winsOnly],
  )

  const dayRows = useMemo(() => {
    const perDayPerPlayer = new Map<number, Map<string, OpenDotaPlayerMatch[]>>()
    filtered.forEach((matches, playerIdx) => {
      const accountId = players[playerIdx]?.accountId
      if (!accountId) return
      for (const m of matches) {
        const k = dayKey(m.start_time)
        let perPlayer = perDayPerPlayer.get(k)
        if (!perPlayer) {
          perPlayer = new Map()
          perDayPerPlayer.set(k, perPlayer)
        }
        const arr = perPlayer.get(accountId) ?? []
        arr.push(m)
        perPlayer.set(accountId, arr)
      }
    })
    const days = Array.from(perDayPerPlayer.keys()).sort((a, b) => b - a)
    return days.map((k) => {
      const perPlayer = perDayPerPlayer.get(k)!
      for (const arr of perPlayer.values()) {
        arr.sort((a, b) => b.start_time - a.start_time)
      }
      return { day: k, perPlayer }
    })
  }, [filtered, players])

  const sharedMatchIds = useMemo(() => {
    const counts = new Map<number, number>()
    filtered.forEach((matches) => {
      const seen = new Set<number>()
      for (const m of matches) seen.add(m.match_id)
      seen.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1))
    })
    const shared = new Set<number>()
    counts.forEach((c, id) => {
      if (c >= 2) shared.add(id)
    })
    return shared
  }, [filtered])

  const totalMatches = filtered.reduce((s, a) => s + a.length, 0)

  return (
    <div className="min-h-screen p-4 max-w-[1400px] mx-auto space-y-4">
      <header className="flex items-center gap-3 bg-panel border border-border rounded-xl px-4 py-3">
        <Link
          to="/"
          className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
        >
          ← на главную
        </Link>
        <div className="font-semibold">Матчи друзей</div>
        <div className="ml-auto text-xs text-zinc-500">
          {players.length} игроков
          {totalMatches > 0 && ` · ${totalMatches} матчей в окне`}
        </div>
      </header>

      <section className="bg-panel border border-border rounded-xl p-4 space-y-3">
        <div className="text-sm text-zinc-400">
          Добавь игроков по account_id, steamid64 или ссылке
          (Dotabuff / OpenDota / Stratz / Steam profile).
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              if (inputError) setInputError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
            placeholder="account_id или ссылка"
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 outline-none focus:border-zinc-500"
          />
          <button
            onClick={addPlayer}
            className="bg-emerald-600 hover:bg-emerald-500 transition rounded-lg px-5 py-2 font-semibold"
          >
            Добавить
          </button>
        </div>
        {inputError && (
          <div className="text-sm text-rose-400">{inputError}</div>
        )}
        {players.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {players.map((p) => (
              <div
                key={p.accountId}
                className="flex items-center gap-2 bg-bg border border-border rounded-full pl-3 pr-1 py-1 text-sm"
              >
                <span className="font-medium">{p.label}</span>
                <span className="text-[10px] text-zinc-500">
                  #{p.accountId}
                </span>
                <button
                  onClick={() => removePlayer(p.accountId)}
                  className="w-5 h-5 rounded-full bg-zinc-800 hover:bg-rose-600/60 text-zinc-400 hover:text-white text-xs"
                  title="Удалить"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {players.length > 0 && (
        <section className="bg-panel border border-border rounded-xl p-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">
              С даты
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-bg border border-border rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">
              По дату
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-bg border border-border rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider">
              Матчей на игрока
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value) as MatchLimit)}
              className="bg-bg border border-border rounded-lg px-3 py-1.5 text-sm"
            >
              {LIMIT_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={winsOnly}
              onChange={(e) => setWinsOnly(e.target.checked)}
              className="accent-emerald-500"
            />
            Только победы
          </label>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => {
                setDateFrom(daysAgoISO(7))
                setDateTo(todayISO())
              }}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
            >
              7 дней
            </button>
            <button
              onClick={() => {
                setDateFrom(daysAgoISO(30))
                setDateTo(todayISO())
              }}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
            >
              30 дней
            </button>
            <button
              onClick={() => {
                setDateFrom(daysAgoISO(90))
                setDateTo(todayISO())
              }}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
            >
              90 дней
            </button>
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-900 rounded-xl px-4 py-2 text-sm text-rose-300">
          Не удалось загрузить матчи для: {failed.map((p) => p.label).join(', ')}.
          OpenDota может тротлить запросы — попробуй через минуту.
        </div>
      )}

      {players.length === 0 ? (
        <div className="bg-panel border border-border rounded-xl p-10 text-center text-zinc-500">
          Добавь хотя бы одного игрока, чтобы увидеть таблицу игр.
        </div>
      ) : loading || heroesLoading ? (
        <div className="bg-panel border border-border rounded-xl p-10 text-center text-zinc-500">
          Загрузка матчей...
        </div>
      ) : dayRows.length === 0 ? (
        <div className="bg-panel border border-border rounded-xl p-10 text-center text-zinc-500">
          В выбранном окне нет матчей. Раздвинь даты или увеличь лимит.
        </div>
      ) : (
        <section className="bg-panel border border-border rounded-xl overflow-hidden">
          <div
            className="grid border-b border-border bg-bg sticky top-0 z-10"
            style={{
              gridTemplateColumns: `160px repeat(${players.length}, minmax(180px, 1fr))`,
            }}
          >
            <div className="px-3 py-2 text-[11px] text-zinc-500 uppercase tracking-wider">
              День
            </div>
            {players.map((p) => (
              <div
                key={p.accountId}
                className="px-3 py-2 text-sm font-semibold truncate border-l border-border"
                title={p.label}
              >
                {p.label}
              </div>
            ))}
          </div>
          <div>
            {dayRows.map(({ day, perPlayer }) => (
              <div
                key={day}
                className="grid border-b border-border last:border-b-0"
                style={{
                  gridTemplateColumns: `160px repeat(${players.length}, minmax(180px, 1fr))`,
                }}
              >
                <div className="px-3 py-3 text-sm text-zinc-300 border-r border-border bg-bg/40 flex items-start">
                  {formatDay(day)}
                </div>
                {players.map((p) => {
                  const matches = perPlayer.get(p.accountId) ?? []
                  return (
                    <div
                      key={p.accountId}
                      className="px-2 py-2 border-l border-border space-y-1.5 min-h-[60px]"
                    >
                      {matches.length === 0 ? (
                        <div className="text-[11px] text-zinc-600 italic">—</div>
                      ) : (
                        matches.map((m) => (
                          <MatchCard
                            key={m.match_id}
                            match={m}
                            hero={heroesById[m.hero_id]}
                            shared={sharedMatchIds.has(m.match_id)}
                            onClick={() =>
                              navigate(`/match?id=${m.match_id}`)
                            }
                          />
                        ))
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function MatchCard({
  match,
  hero,
  shared,
  onClick,
}: {
  match: OpenDotaPlayerMatch
  hero: Hero | undefined
  shared: boolean
  onClick: () => void
}) {
  const win = isWin(match)
  const time = new Date(match.start_time * 1000).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left bg-bg border rounded-md overflow-hidden flex items-center gap-2 pr-2 transition hover:bg-zinc-800/60',
        win ? 'border-emerald-800/60' : 'border-rose-900/60',
        shared && 'ring-1 ring-sky-500/60',
      )}
      title={hero ? `${hero.localized_name} · ${win ? 'Win' : 'Loss'}` : undefined}
    >
      {hero ? (
        <div className="w-10 shrink-0">
          <HeroIcon hero={hero} variant="landscape" />
        </div>
      ) : (
        <div className="w-10 h-[22.5px] shrink-0 bg-zinc-800" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span
            className={clsx(
              'font-bold',
              win ? 'text-emerald-400' : 'text-rose-400',
            )}
          >
            {win ? 'W' : 'L'}
          </span>
          <span className="text-zinc-300 tabular-nums">
            {match.kills}/{match.deaths}/{match.assists}
          </span>
          <span className="text-zinc-600 ml-auto tabular-nums">
            {formatDuration(match.duration)}
          </span>
        </div>
        <div className="text-[10px] text-zinc-500 truncate">
          {time}
          {shared && <span className="ml-1 text-sky-400">· party</span>}
        </div>
      </div>
    </button>
  )
}
