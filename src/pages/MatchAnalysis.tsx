import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import ky from 'ky'
import { useHeroes } from '../hooks/useHeroes'
import { useDraftStore } from '../store/draftStore'
import type { DraftState, Lane, Role } from '../types'
import { HeroIcon } from '../components/HeroIcon'

const OPEN_DOTA = 'https://api.opendota.com/api'

interface MatchPlayer {
  hero_id: number
  player_slot: number // 0-4 radiant, 128-132 dire
  lane_role: number // 1=safe, 2=mid, 3=off
  is_roaming: boolean
  win: number
  kills: number
  deaths: number
  assists: number
  gold_per_min: number
  xp_per_min: number
  hero_damage: number
  tower_damage: number
  last_hits: number
}

interface MatchData {
  match_id: number
  radiant_win: boolean
  duration: number
  start_time: number
  players: MatchPlayer[]
  radiant_team?: { name: string }
  dire_team?: { name: string }
  game_mode: number
  lobby_type: number
  avg_rank_tier?: number
  picks_bans?: Array<{
    is_pick: boolean
    hero_id: number
    team: number // 0=radiant, 1=dire
    order: number
  }>
}

/**
 * Map OpenDota player data to a lane assignment.
 *
 * OpenDota fields:
 *   lane_role: 1=safe, 2=mid, 3=off, 0=unknown/roaming
 *   is_roaming: boolean
 *   player_slot: 0-4 radiant, 128-132 dire (team index, NOT role)
 *
 * We determine core vs support based on gold_per_min: within the same side,
 * higher GPM players are cores. This is much more reliable than player_slot
 * which is just a team index.
 */
function buildAssignments(
  players: MatchPlayer[],
): DraftState['assignments'] {
  const assignments: DraftState['assignments'] = { radiant: {}, dire: {} }

  for (const side of ['radiant', 'dire'] as const) {
    const sidePlayers = players
      .filter((p) => (side === 'radiant' ? p.player_slot < 128 : p.player_slot >= 128))
      .sort((a, b) => b.gold_per_min - a.gold_per_min)

    // Top 3 by GPM are cores, bottom 2 are supports
    const coreSet = new Set(sidePlayers.slice(0, 3).map((p) => p.hero_id))

    for (const p of sidePlayers) {
      const isCore = coreSet.has(p.hero_id)
      let lane: Lane
      if (p.lane_role === 1) lane = 'safe'
      else if (p.lane_role === 2) lane = 'mid'
      else if (p.lane_role === 3) lane = 'off'
      else {
        // Unknown lane — guess from role: supports default to safe (pos 5)
        lane = isCore ? 'off' : 'safe'
      }

      const role: Role = isCore ? 'core' : 'support'

      // Avoid duplicate lane+role by checking if already occupied
      const existing = Object.values(assignments[side])
      const occupied = existing.some((a) => a && a.lane === lane && a.role === role)
      if (occupied) {
        // Try alternative lane placement
        if (lane === 'safe' && !existing.some((a) => a && a.lane === 'off' && a.role === role)) {
          lane = 'off'
        } else if (lane === 'off' && !existing.some((a) => a && a.lane === 'safe' && a.role === role)) {
          lane = 'safe'
        }
        // If still occupied, skip — better to leave unassigned than corrupt
        const stillOccupied = existing.some((a) => a && a.lane === lane && a.role === role)
        if (stillOccupied) continue
      }

      assignments[side][p.hero_id] = { lane, role }
    }
  }

  return assignments
}

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function MatchAnalysis() {
  const navigate = useNavigate()
  const { byId, isLoading: heroesLoading } = useHeroes()
  const loadDraft = useDraftStore((s) => s.loadDraft)
  const [searchParams] = useSearchParams()

  const [matchInput, setMatchInput] = useState('')
  const [match, setMatch] = useState<MatchData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoFetchedRef = useRef<string | null>(null)

  const fetchMatchById = async (matchId: string) => {
    setLoading(true)
    setError(null)
    setMatch(null)
    try {
      const data = await ky
        .get(`${OPEN_DOTA}/matches/${matchId}`)
        .json<MatchData>()
      setMatch(data)
    } catch (e: unknown) {
      setError(`Матч не найден: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchMatch = async () => {
    const raw = matchInput.trim()
    const idMatch = raw.match(/(\d{8,12})/)
    if (!idMatch) {
      setError('Введи ID матча или ссылку на OpenDota/Dotabuff')
      return
    }
    await fetchMatchById(idMatch[1])
  }

  useEffect(() => {
    const id = searchParams.get('id')
    if (!id) return
    if (!/^\d{8,12}$/.test(id)) return
    if (autoFetchedRef.current === id) return
    autoFetchedRef.current = id
    setMatchInput(id)
    void fetchMatchById(id)
  }, [searchParams])

  const loadIntoDraft = () => {
    if (!match) return

    const radiantPicks: number[] = []
    const direPicks: number[] = []
    const radiantBans: number[] = []
    const direBans: number[] = []
    // If match has picks_bans (CM mode), use them
    if (match.picks_bans && match.picks_bans.length > 0) {
      for (const pb of match.picks_bans) {
        const side = pb.team === 0 ? 'radiant' : 'dire'
        if (pb.is_pick) {
          if (side === 'radiant') radiantPicks.push(pb.hero_id)
          else direPicks.push(pb.hero_id)
        } else {
          if (side === 'radiant') radiantBans.push(pb.hero_id)
          else direBans.push(pb.hero_id)
        }
      }
    } else {
      // All Pick — just use player heroes
      for (const p of match.players) {
        if (p.player_slot < 128) radiantPicks.push(p.hero_id)
        else direPicks.push(p.hero_id)
      }
    }

    // Build lane assignments from player data (GPM-based core/support detection)
    const assignments = buildAssignments(match.players)

    const draftState: DraftState = {
      phase: 'assigning',
      picks: { radiant: radiantPicks, dire: direPicks },
      bans: { radiant: radiantBans, dire: direBans },
      step: 24,
      assignments,
    }

    loadDraft(draftState)
    navigate('/solo')
  }

  if (heroesLoading) {
    return <div className="p-6 text-zinc-400">Загрузка героев...</div>
  }

  const radiantPlayers = match?.players.filter((p) => p.player_slot < 128) ?? []
  const direPlayers = match?.players.filter((p) => p.player_slot >= 128) ?? []

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto space-y-4">
      <header className="flex items-center gap-3 bg-panel border border-border rounded-xl px-4 py-3">
        <Link
          to="/"
          className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
        >
          ← на главную
        </Link>
        <div className="font-semibold">Анализ матча</div>
      </header>

      <div className="bg-panel border border-border rounded-xl p-6 space-y-4">
        <div className="text-sm text-zinc-400">
          Введи ID матча или ссылку на OpenDota/Dotabuff
        </div>
        <div className="flex gap-2">
          <input
            value={matchInput}
            onChange={(e) => setMatchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchMatch()}
            placeholder="Match ID или ссылка"
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 outline-none focus:border-zinc-500"
          />
          <button
            onClick={fetchMatch}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg px-6 py-2 font-semibold"
          >
            {loading ? 'Загрузка...' : 'Найти'}
          </button>
        </div>
        {error && <div className="text-sm text-rose-400">{error}</div>}
      </div>

      {match && (
        <div className="space-y-4">
          {/* Match summary */}
          <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">
                  Match {match.match_id}
                </div>
                <div className="text-sm text-zinc-400">
                  {formatDuration(match.duration)} ·{' '}
                  {new Date(match.start_time * 1000).toLocaleDateString('ru-RU')}
                  {match.avg_rank_tier && (
                    <> · Ранг ~{match.avg_rank_tier}</>
                  )}
                </div>
              </div>
              <div
                className={`text-lg font-bold ${
                  match.radiant_win ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {match.radiant_win ? 'Radiant Win' : 'Dire Win'}
              </div>
            </div>

            {/* Picks/Bans */}
            {match.picks_bans && match.picks_bans.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-zinc-500 uppercase tracking-wider">
                  Баны
                </div>
                <div className="flex gap-2 flex-wrap">
                  {match.picks_bans
                    .filter((pb) => !pb.is_pick)
                    .map((pb, i) => {
                      const hero = byId[pb.hero_id]
                      if (!hero) return null
                      return (
                        <div key={i} className="w-12">
                          <HeroIcon
                            hero={hero}
                            variant="portrait"
                            banned
                          />
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Team tables */}
            {[
              { label: 'Radiant', players: radiantPlayers, color: 'text-emerald-400' },
              { label: 'Dire', players: direPlayers, color: 'text-rose-400' },
            ].map((team) => (
              <div key={team.label} className="space-y-1">
                <div className={`text-sm font-semibold ${team.color}`}>
                  {team.label}
                </div>
                <div className="space-y-1">
                  {team.players.map((p) => {
                    const hero = byId[p.hero_id]
                    if (!hero) return null
                    return (
                      <div
                        key={p.player_slot}
                        className="flex items-center gap-3 bg-bg rounded px-3 py-1.5 text-sm"
                      >
                        <div className="w-8 shrink-0">
                          <HeroIcon hero={hero} variant="portrait" />
                        </div>
                        <span className="w-32 truncate font-medium">
                          {hero.localized_name}
                        </span>
                        <span className="text-zinc-400">
                          {p.kills}/{p.deaths}/{p.assists}
                        </span>
                        <span className="text-zinc-500 text-xs">
                          GPM {p.gold_per_min} · XPM {p.xp_per_min}
                        </span>
                        <span className="text-zinc-600 text-xs ml-auto">
                          HD {(p.hero_damage / 1000).toFixed(1)}k · TD{' '}
                          {(p.tower_damage / 1000).toFixed(1)}k
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <button
              onClick={loadIntoDraft}
              className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-lg py-3 font-semibold"
            >
              Загрузить в драфт и анализировать
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
