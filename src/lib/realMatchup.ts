import type { Hero, Lane, LaneAssignment, Side } from '../types'
import type { HeroMatchup } from '../api/matchups'

export type RealVerdict =
  | 'won'
  | 'small-win'
  | 'contested'
  | 'draw'
  | 'small-loss'
  | 'lost'
  | 'unknown'

export interface PairwiseStat {
  radiantHero: Hero
  direHero: Hero
  games: number
  radiantWins: number
  winrate: number // 0..1, from radiant POV
}

export interface RealLaneResult {
  lane: Lane
  radiantHeroes: Hero[]
  direHeroes: Hero[]
  pairs: PairwiseStat[]
  totalGames: number
  /** weighted average winrate from radiant POV (0..1) */
  avgWinrate: number | null
  verdict: RealVerdict
}

export const realVerdictLabel: Record<RealVerdict, string> = {
  won: 'Уверенно выигран',
  'small-win': 'Небольшой перевес',
  contested: 'Спорный',
  draw: 'Равный',
  'small-loss': 'Небольшой проигрыш',
  lost: 'Уверенно проигран',
  unknown: 'Нет данных',
}

export const realVerdictColor: Record<RealVerdict, string> = {
  won: 'text-emerald-400',
  'small-win': 'text-lime-400',
  contested: 'text-yellow-300',
  draw: 'text-zinc-300',
  'small-loss': 'text-orange-400',
  lost: 'text-rose-400',
  unknown: 'text-zinc-500',
}

function verdictFromWinrate(wr: number): RealVerdict {
  // wr is from radiant POV, range 0..1
  const delta = wr - 0.5
  const abs = Math.abs(delta)
  if (abs < 0.01) return 'draw'
  if (abs < 0.025) return 'contested'
  if (abs < 0.05) return delta > 0 ? 'small-win' : 'small-loss'
  return delta > 0 ? 'won' : 'lost'
}

const lanePairs: Array<{ lane: Lane; radiantLane: Lane; direLane: Lane }> = [
  { lane: 'safe', radiantLane: 'safe', direLane: 'off' },
  { lane: 'mid', radiantLane: 'mid', direLane: 'mid' },
  { lane: 'off', radiantLane: 'off', direLane: 'safe' },
]

/**
 * Compute lane verdicts based on real public-match win rates from
 * OpenDota /heroes/{id}/matchups endpoint.
 *
 * For each lane we look at every (radiantHero, direHero) pair and
 * average the radiant-POV winrates weighted by games_played.
 */
export function computeRealLaneResults(
  heroesById: Record<number, Hero>,
  picks: { radiant: number[]; dire: number[] },
  assignments: {
    radiant: Record<number, LaneAssignment | undefined>
    dire: Record<number, LaneAssignment | undefined>
  },
  matchups: Record<number, HeroMatchup[]>,
): RealLaneResult[] {
  return lanePairs.map(({ lane, radiantLane, direLane }) => {
    const radiantHeroes = picks.radiant
      .filter((id) => assignments.radiant[id]?.lane === radiantLane)
      .map((id) => heroesById[id])
      .filter(Boolean)
    const direHeroes = picks.dire
      .filter((id) => assignments.dire[id]?.lane === direLane)
      .map((id) => heroesById[id])
      .filter(Boolean)

    const pairs: PairwiseStat[] = []
    let weightedSum = 0
    let totalGames = 0

    for (const r of radiantHeroes) {
      const rMatchups = matchups[r.id] ?? []
      for (const d of direHeroes) {
        const m = rMatchups.find((x) => x.hero_id === d.id)
        if (!m || m.games_played === 0) continue
        const wr = m.wins / m.games_played
        pairs.push({
          radiantHero: r,
          direHero: d,
          games: m.games_played,
          radiantWins: m.wins,
          winrate: wr,
        })
        weightedSum += wr * m.games_played
        totalGames += m.games_played
      }
    }

    const avgWinrate = totalGames > 0 ? weightedSum / totalGames : null
    const verdict: RealVerdict =
      avgWinrate === null ? 'unknown' : verdictFromWinrate(avgWinrate)

    return {
      lane,
      radiantHeroes,
      direHeroes,
      pairs,
      totalGames,
      avgWinrate,
      verdict,
    }
  })
}

// ---------------------------------------------------------------------------
// Counterpick analysis
// ---------------------------------------------------------------------------

export interface Counterpick {
  hero: Hero
  /** Enemy hero that counters `hero` */
  counter: Hero
  /** Winrate of `hero` AGAINST `counter` — lower = stronger counter */
  winrate: number
  games: number
}

export interface PotentialCounterpick {
  hero: Hero
  /** Hero NOT in the draft that would counter `hero` */
  counter: Hero
  winrate: number
  games: number
}

export interface HeroCounterpickInfo {
  hero: Hero
  side: Side
  /** Enemy heroes from the draft that counter this hero (sorted worst first) */
  counters: Counterpick[]
  /** Top N heroes outside the draft that could have countered this hero */
  potentials: PotentialCounterpick[]
}

/**
 * For every picked hero, compute:
 * 1. Which enemy heroes counter it (WR < 50% from the hero's POV)
 * 2. Top `potentialCount` heroes that aren't picked/banned that would counter it
 */
export function computeCounterpicks(
  heroesById: Record<number, Hero>,
  picks: { radiant: number[]; dire: number[] },
  bans: { radiant: number[]; dire: number[] },
  matchups: Record<number, HeroMatchup[]>,
  potentialCount = 3,
): HeroCounterpickInfo[] {
  const allPicked = new Set([...picks.radiant, ...picks.dire])
  const allBanned = new Set([...bans.radiant, ...bans.dire])
  const unavailable = new Set([...allPicked, ...allBanned])

  const results: HeroCounterpickInfo[] = []

  const processSide = (side: Side) => {
    const myPicks = picks[side]
    const enemyPicks = picks[side === 'radiant' ? 'dire' : 'radiant']

    for (const heroId of myPicks) {
      const hero = heroesById[heroId]
      if (!hero) continue
      const heroMatchups = matchups[heroId] ?? []

      // 1. Active counters from enemy team
      const counters: Counterpick[] = []
      for (const enemyId of enemyPicks) {
        const enemy = heroesById[enemyId]
        if (!enemy) continue
        const m = heroMatchups.find((x) => x.hero_id === enemyId)
        if (!m || m.games_played === 0) continue
        const wr = m.wins / m.games_played
        // Only show as counter if winrate is below 50%
        if (wr < 0.5) {
          counters.push({
            hero,
            counter: enemy,
            winrate: wr,
            games: m.games_played,
          })
        }
      }
      counters.sort((a, b) => a.winrate - b.winrate) // worst matchup first

      // 2. Potential counters — heroes not in draft that would be strong against this hero
      const potentials: PotentialCounterpick[] = heroMatchups
        .filter(
          (m) =>
            m.games_played >= 100 &&
            !unavailable.has(m.hero_id) &&
            heroesById[m.hero_id] &&
            m.wins / m.games_played < 0.48, // meaningful counter threshold
        )
        .map((m) => ({
          hero,
          counter: heroesById[m.hero_id],
          winrate: m.wins / m.games_played,
          games: m.games_played,
        }))
        .sort((a, b) => a.winrate - b.winrate)
        .slice(0, potentialCount)

      results.push({ hero, side, counters, potentials })
    }
  }

  processSide('radiant')
  processSide('dire')

  return results
}

// ---------------------------------------------------------------------------
// Overall win probability
// ---------------------------------------------------------------------------

export interface WinProbability {
  /** Radiant win probability 0..1 */
  radiantWinProb: number
  /** Total pairwise matchups considered */
  totalGames: number
  /** Number of individual matchup pairs */
  pairsCount: number
}

/**
 * Compute overall win probability based on ALL pairwise matchups between
 * radiant and dire heroes (not just lane-based). Uses weighted average of
 * winrates across all 5v5 hero pairs (up to 25 pairs).
 */
export function computeOverallWinProbability(
  picks: { radiant: number[]; dire: number[] },
  matchups: Record<number, HeroMatchup[]>,
): WinProbability {
  let weightedSum = 0
  let totalGames = 0
  let pairsCount = 0

  for (const rId of picks.radiant) {
    const rMatchups = matchups[rId] ?? []
    for (const dId of picks.dire) {
      const m = rMatchups.find((x) => x.hero_id === dId)
      if (!m || m.games_played === 0) continue
      const wr = m.wins / m.games_played
      weightedSum += wr * m.games_played
      totalGames += m.games_played
      pairsCount++
    }
  }

  return {
    radiantWinProb: totalGames > 0 ? weightedSum / totalGames : 0.5,
    totalGames,
    pairsCount,
  }
}
