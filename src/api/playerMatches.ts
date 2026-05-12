import ky from 'ky'

const OPEN_DOTA = 'https://api.opendota.com/api'

export interface OpenDotaPlayerMatch {
  match_id: number
  player_slot: number
  radiant_win: boolean
  duration: number
  game_mode: number
  lobby_type: number
  hero_id: number
  start_time: number
  version: number | null
  kills: number
  deaths: number
  assists: number
  average_rank: number | null
  leaver_status: number
  party_size: number | null
}

export interface OpenDotaPlayerProfile {
  profile: {
    account_id: number
    personaname: string | null
    avatarfull: string | null
  } | null
  rank_tier: number | null
  leaderboard_rank: number | null
  mmr_estimate: {
    estimate: number | null
  } | null
}

export async function fetchPlayerMatches(
  accountId: string,
  limit = 100,
): Promise<OpenDotaPlayerMatch[]> {
  return ky
    .get(`${OPEN_DOTA}/players/${accountId}/matches`, {
      searchParams: { limit },
      timeout: 20000,
    })
    .json<OpenDotaPlayerMatch[]>()
}

export async function fetchPlayerProfile(
  accountId: string,
): Promise<OpenDotaPlayerProfile> {
  return ky
    .get(`${OPEN_DOTA}/players/${accountId}`, { timeout: 20000 })
    .json<OpenDotaPlayerProfile>()
}

export interface OpenDotaPlayerHeroStat {
  hero_id: string // OpenDota returns as string here, cast at read site
  last_played: number
  games: number
  win: number
  with_games: number
  with_win: number
  against_games: number
  against_win: number
}

/**
 * Per-hero aggregated stats for a player over the last `days` days.
 * Pass `days` undefined for the full history OpenDota keeps.
 *
 * Filter: `lobby_type=7` (ranked) — we want MMR-relevant games only,
 * otherwise normal/turbo skew the +/- delta.
 */
export async function fetchPlayerHeroStats(
  accountId: string,
  days?: number,
): Promise<OpenDotaPlayerHeroStat[]> {
  const searchParams: Record<string, string | number> = { lobby_type: 7 }
  if (days != null) searchParams.date = days
  return ky
    .get(`${OPEN_DOTA}/players/${accountId}/heroes`, {
      searchParams,
      timeout: 20000,
    })
    .json<OpenDotaPlayerHeroStat[]>()
}
