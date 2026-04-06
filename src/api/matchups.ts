import ky from 'ky'

const OPEN_DOTA = 'https://api.opendota.com/api'

export interface HeroMatchup {
  hero_id: number // opposing hero id
  games_played: number
  wins: number // wins from the requested hero's perspective
}

/**
 * GET /heroes/{id}/matchups — list of matchups against every other hero
 * (across all roles, public matches). Used as overall pairwise winrate proxy.
 */
export async function fetchHeroMatchups(heroId: number): Promise<HeroMatchup[]> {
  return ky.get(`${OPEN_DOTA}/heroes/${heroId}/matchups`).json<HeroMatchup[]>()
}

export interface ExplorerRow {
  match_id: number
  start_time: number
  duration: number
  radiant_win: boolean
  avg_rank_tier: number | null
  radiant_team: number[]
  dire_team: number[]
}

interface ExplorerResponse {
  command?: string
  rowCount?: number
  rows?: ExplorerRow[]
  err?: string
}

/**
 * Find recent public matches where given hero combos appeared on the
 * specified sides. Uses OpenDota Explorer SQL endpoint (no auth, public).
 */
export async function findSampleMatches(
  radiantHeroIds: number[],
  direHeroIds: number[],
  limit = 5,
): Promise<ExplorerRow[]> {
  if (radiantHeroIds.length === 0 && direHeroIds.length === 0) return []

  const radArr = `ARRAY[${radiantHeroIds.join(',')}]::int[]`
  const direArr = `ARRAY[${direHeroIds.join(',')}]::int[]`

  // OpenDota public_matches: radiant_team / dire_team are int[] columns.
  // Filter:
  //   lobby_type = 7  → Ranked Matchmaking (исключает CM/captain mode/боты)
  //   game_mode  = 22 → Ranked All Pick (обычный матч-мейкинг)
  //   avg_rank_tier ≥ 70 → Divine+ (≈ 5k+ MMR; "минимум титанов")
  //     encoding: tier*10 + sub_tier; 70..75 = Divine I-V, 80+ = Immortal
  const conditions: string[] = ['lobby_type = 7', 'game_mode = 22', 'avg_rank_tier >= 70']
  if (radiantHeroIds.length) conditions.push(`radiant_team @> ${radArr}`)
  if (direHeroIds.length) conditions.push(`dire_team @> ${direArr}`)

  const sql = `
    SELECT match_id, start_time, duration, radiant_win, avg_rank_tier, radiant_team, dire_team
    FROM public_matches
    WHERE ${conditions.join(' AND ')}
    ORDER BY start_time DESC
    LIMIT ${limit}
  `.trim()

  const url = `${OPEN_DOTA}/explorer?sql=${encodeURIComponent(sql)}`
  const data = await ky.get(url, { timeout: 20_000 }).json<ExplorerResponse>()
  if (data.err) throw new Error(data.err)
  return data.rows ?? []
}
