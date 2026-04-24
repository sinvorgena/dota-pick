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
