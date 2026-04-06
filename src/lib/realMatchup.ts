import type { Hero, Lane, LaneAssignment } from '../types'
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
