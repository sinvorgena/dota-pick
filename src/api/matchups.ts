import ky from 'ky'

const OPEN_DOTA = 'https://api.opendota.com/api'

export interface HeroMatchup {
  hero_id: number // opposing hero id
  games_played: number
  wins: number // wins from the requested hero's perspective
}

// ---------------------------------------------------------------------------
// Static Stratz matchup data (Divine+Immortal bracket snapshot)
// ---------------------------------------------------------------------------

let stratzData: Record<number, HeroMatchup[]> | null = null
let stratzLoading: Promise<Record<number, HeroMatchup[]>> | null = null

async function loadStratzData(): Promise<Record<number, HeroMatchup[]>> {
  if (stratzData) return stratzData
  if (stratzLoading) return stratzLoading
  stratzLoading = (async () => {
    try {
      const mod = await import('../data/stratz-matchups.json')
      // JSON import: keys are string hero ids, values are HeroMatchup[]
      const raw = mod.default as Record<string, HeroMatchup[]>
      const result: Record<number, HeroMatchup[]> = {}
      for (const [k, v] of Object.entries(raw)) {
        result[Number(k)] = v
      }
      stratzData = result
      return result
    } catch {
      console.warn('[matchups] stratz-matchups.json not found, falling back to OpenDota')
      stratzData = {}
      return {}
    }
  })()
  return stratzLoading
}

/**
 * Fetch matchups for a hero. Uses static Stratz data (Divine+Immortal)
 * if available, otherwise falls back to OpenDota API.
 */
export async function fetchHeroMatchups(heroId: number): Promise<HeroMatchup[]> {
  const data = await loadStratzData()
  if (data[heroId]) return data[heroId]
  // Fallback to OpenDota if Stratz data missing for this hero
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

export interface SampleMatchesResult {
  rows: ExplorerRow[]
  /** Number of matches actually returned (capped by `limit`). */
  totalCount: number
  /** True if the result hit the limit — there may be more matches. */
  capped: boolean
  /** The limit used for the query. */
  limit: number
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
 *
 * Note: OpenDota Explorer has a hard 10s statement timeout, and `COUNT(*)`
 * over `public_matches` (millions of rows) times out — even with date bounds.
 * So instead of a separate count query, we just fetch a generous LIMIT and
 * report `rows.length`, marking the result as `capped` if the limit was hit.
 */
export async function findSampleMatches(
  radiantHeroIds: number[],
  direHeroIds: number[],
  limit = 100,
): Promise<SampleMatchesResult> {
  if (radiantHeroIds.length === 0 && direHeroIds.length === 0) {
    return { rows: [], totalCount: 0, capped: false, limit }
  }

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
    SELECT match_id, start_time, duration, radiant_win, avg_rank_tier,
           radiant_team, dire_team
    FROM public_matches
    WHERE ${conditions.join(' AND ')}
    ORDER BY start_time DESC
    LIMIT ${limit}
  `.trim()

  const url = `${OPEN_DOTA}/explorer?sql=${encodeURIComponent(sql)}`
  const data = await ky.get(url, { timeout: 20_000 }).json<ExplorerResponse>()
  if (data.err) throw new Error(data.err)
  const rows = data.rows ?? []
  return {
    rows,
    totalCount: rows.length,
    capped: rows.length >= limit,
    limit,
  }
}
