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

// ---------------------------------------------------------------------------
// Position importance weighting
// ---------------------------------------------------------------------------

/**
 * Importance weight by position. Cores (1/2/3) decide games;
 * supports (4/5) have less impact on the final outcome, so their
 * matchups count proportionally less in the overall winrate.
 */
export function positionWeight(pos: number | null): number {
  if (pos == null) return 1.0
  switch (pos) {
    case 1: return 1.25 // safelane carry — primary win condition
    case 2: return 1.15 // mid — tempo/tower pressure
    case 3: return 1.05 // offlane core
    case 4: return 0.65 // roaming/creative support
    case 5: return 0.55 // hard support
    default: return 1.0
  }
}

/** Importance of a pairwise matchup based on both heroes' positions. */
function pairImportance(posR: number | null, posD: number | null): number {
  // Use the max — a matchup is as important as the more-impactful hero involved.
  // A support vs carry matchup still matters (support can ruin a lane), but a
  // support mirror (5 vs 5) is the least decisive.
  return Math.max(positionWeight(posR), positionWeight(posD))
}

export function assignmentToPos(a: LaneAssignment | undefined): number | null {
  if (!a) return null
  if (a.lane === 'safe' && a.role === 'core') return 1
  if (a.lane === 'mid' && a.role === 'core') return 2
  if (a.lane === 'off' && a.role === 'core') return 3
  if (a.lane === 'off' && a.role === 'support') return 4
  if (a.lane === 'safe' && a.role === 'support') return 5
  if (a.lane === 'mid' && a.role === 'support') return 4 // treat as roaming 4
  return null
}

/** Estimate typical position for an unpicked hero based on its roles array. */
export function estimatePos(hero: Hero): number | null {
  const r = hero.roles
  if (r.includes('Carry') && !r.includes('Support')) return 1
  if (r.includes('Nuker') && r.includes('Escape') && !r.includes('Support')) return 2
  if (r.includes('Initiator') && r.includes('Durable') && !r.includes('Support')) return 3
  if (r.includes('Support') && r.includes('Disabler')) return 4
  if (r.includes('Support')) return 5
  if (r.includes('Carry')) return 1
  if (r.includes('Pusher') && r.includes('Nuker')) return 2
  if (r.includes('Durable') || r.includes('Initiator')) return 3
  return null
}

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

/** Max WR a picked hero may have vs an enemy for the enemy to count as a "counter". */
const COUNTER_THRESHOLD = 0.485 // enemy winning by >1.5pp
/** WR threshold for potential counters — stricter because sample is the whole pool. */
const POTENTIAL_COUNTER_THRESHOLD = 0.47
const POTENTIAL_MIN_GAMES = 100

export interface Counterpick {
  hero: Hero
  /** Position (1-5) of the hero being countered, null if unassigned */
  heroPos: number | null
  /** Enemy hero that counters `hero` */
  counter: Hero
  /** Position (1-5) of the counter hero, null if unassigned */
  counterPos: number | null
  /** Winrate of `hero` AGAINST `counter` — lower = stronger counter */
  winrate: number
  games: number
}

export interface PotentialCounterpick {
  hero: Hero
  heroPos: number | null
  /** Hero NOT in the draft that would counter `hero` */
  counter: Hero
  /** Estimated typical position (1-5) of the counter hero */
  counterPos: number | null
  winrate: number
  games: number
}

export interface HeroCounterpickInfo {
  hero: Hero
  side: Side
  heroPos: number | null
  /** Enemy heroes from the draft that counter this hero (sorted worst first) */
  counters: Counterpick[]
  /** Top N heroes outside the draft that could have countered this hero */
  potentials: PotentialCounterpick[]
}

/**
 * For every picked hero, compute:
 * 1. Which enemy heroes counter it (WR < 48.5% from the hero's POV)
 * 2. Top `potentialCount` heroes that aren't picked/banned that would counter it
 */
export function computeCounterpicks(
  heroesById: Record<number, Hero>,
  picks: { radiant: number[]; dire: number[] },
  bans: { radiant: number[]; dire: number[] },
  assignments: {
    radiant: Record<number, LaneAssignment | undefined>
    dire: Record<number, LaneAssignment | undefined>
  },
  matchups: Record<number, HeroMatchup[]>,
  potentialCount = 3,
): HeroCounterpickInfo[] {
  const allPicked = new Set([...picks.radiant, ...picks.dire])
  const allBanned = new Set([...bans.radiant, ...bans.dire])
  const unavailable = new Set([...allPicked, ...allBanned])

  const results: HeroCounterpickInfo[] = []

  const processSide = (side: Side) => {
    const enemySide: Side = side === 'radiant' ? 'dire' : 'radiant'
    const myPicks = picks[side]
    const enemyPicks = picks[enemySide]

    for (const heroId of myPicks) {
      const hero = heroesById[heroId]
      if (!hero) continue
      const heroMatchups = matchups[heroId] ?? []
      const heroPos = assignmentToPos(assignments[side][heroId])

      // 1. Active counters from enemy team
      const counters: Counterpick[] = []
      for (const enemyId of enemyPicks) {
        const enemy = heroesById[enemyId]
        if (!enemy) continue
        const m = heroMatchups.find((x) => x.hero_id === enemyId)
        if (!m || m.games_played === 0) continue
        const wr = m.wins / m.games_played
        if (wr < COUNTER_THRESHOLD) {
          counters.push({
            hero,
            heroPos,
            counter: enemy,
            counterPos: assignmentToPos(assignments[enemySide][enemyId]),
            winrate: wr,
            games: m.games_played,
          })
        }
      }
      counters.sort((a, b) => a.winrate - b.winrate)

      // 2. Potential counters — heroes not in draft
      const potentials: PotentialCounterpick[] = heroMatchups
        .filter(
          (m) =>
            m.games_played >= POTENTIAL_MIN_GAMES &&
            !unavailable.has(m.hero_id) &&
            heroesById[m.hero_id] &&
            m.wins / m.games_played < POTENTIAL_COUNTER_THRESHOLD,
        )
        .map((m) => ({
          hero,
          heroPos,
          counter: heroesById[m.hero_id],
          counterPos: estimatePos(heroesById[m.hero_id]),
          winrate: m.wins / m.games_played,
          games: m.games_played,
        }))
        .sort((a, b) => a.winrate - b.winrate)
        .slice(0, potentialCount)

      results.push({ hero, side, heroPos, counters, potentials })
    }
  }

  processSide('radiant')
  processSide('dire')

  return results
}

// ---------------------------------------------------------------------------
// Overall win probability (position-weighted)
// ---------------------------------------------------------------------------

export interface WinProbability {
  /** Radiant win probability 0..1, position-weighted */
  radiantWinProb: number
  /** Raw (unweighted-by-position) radiant WR — for comparison */
  rawRadiantWinProb: number
  /** Total pairwise matchups considered */
  totalGames: number
  /** Number of individual matchup pairs */
  pairsCount: number
}

/**
 * Compute overall win probability based on ALL pairwise matchups between
 * radiant and dire heroes (not just lane-based). Weighted average of
 * per-pair winrates, where each pair's weight is
 *   games_played * pairImportance(posR, posD)
 *
 * This downweights support-vs-support mirrors relative to core matchups,
 * matching the intuition that counters on pos1/2/3 matter more than on pos4/5.
 */
export function computeOverallWinProbability(
  picks: { radiant: number[]; dire: number[] },
  assignments: {
    radiant: Record<number, LaneAssignment | undefined>
    dire: Record<number, LaneAssignment | undefined>
  },
  matchups: Record<number, HeroMatchup[]>,
): WinProbability {
  let weightedSum = 0
  let totalWeight = 0
  let rawSum = 0
  let rawWeight = 0
  let totalGames = 0
  let pairsCount = 0

  for (const rId of picks.radiant) {
    const rMatchups = matchups[rId] ?? []
    const posR = assignmentToPos(assignments.radiant[rId])
    for (const dId of picks.dire) {
      const m = rMatchups.find((x) => x.hero_id === dId)
      if (!m || m.games_played === 0) continue
      const wr = m.wins / m.games_played
      const posD = assignmentToPos(assignments.dire[dId])
      const imp = pairImportance(posR, posD)
      const w = m.games_played * imp

      weightedSum += wr * w
      totalWeight += w
      rawSum += wr * m.games_played
      rawWeight += m.games_played
      totalGames += m.games_played
      pairsCount++
    }
  }

  return {
    radiantWinProb: totalWeight > 0 ? weightedSum / totalWeight : 0.5,
    rawRadiantWinProb: rawWeight > 0 ? rawSum / rawWeight : 0.5,
    totalGames,
    pairsCount,
  }
}

// ---------------------------------------------------------------------------
// Per-hero difficulty summary
// ---------------------------------------------------------------------------

export type MatchupDifficulty =
  | 'very-easy'
  | 'easy'
  | 'comfortable'
  | 'balanced'
  | 'tough'
  | 'hard'
  | 'very-hard'
  | 'unknown'

export interface MatchupHit {
  enemy: Hero
  enemyPos: number | null
  /** WR of the hero against `enemy`, from hero's POV */
  winrate: number
  games: number
}

export interface HeroMatchupSummary {
  hero: Hero
  side: Side
  heroPos: number | null
  /** Weighted average WR against the whole enemy team (from hero's POV) */
  avgWinrate: number | null
  /** Enemies the hero crushes (wr ≥ 0.525) */
  crushes: MatchupHit[]
  /** Enemies that crush the hero (wr ≤ 0.475) */
  crushedBy: MatchupHit[]
  /** Difficulty classification */
  difficulty: MatchupDifficulty
  /** 1-2 sentence human-readable description */
  description: string
}

export const difficultyLabel: Record<MatchupDifficulty, string> = {
  'very-easy': 'Очень лёгкий матч',
  easy: 'Лёгкий матч',
  comfortable: 'Комфортный матч',
  balanced: 'Ровный матч',
  tough: 'Непростой матч',
  hard: 'Сложный матч',
  'very-hard': 'Очень сложный матч',
  unknown: 'Нет данных',
}

export const difficultyColor: Record<MatchupDifficulty, string> = {
  'very-easy': 'text-emerald-400',
  easy: 'text-lime-400',
  comfortable: 'text-teal-300',
  balanced: 'text-zinc-300',
  tough: 'text-amber-400',
  hard: 'text-orange-400',
  'very-hard': 'text-rose-400',
  unknown: 'text-zinc-500',
}

const CRUSHES_THRESHOLD = 0.525
const CRUSHED_BY_THRESHOLD = 0.475

function classifyDifficulty(
  avgWr: number | null,
  crushesCount: number,
  crushedByCount: number,
): MatchupDifficulty {
  if (avgWr === null) return 'unknown'
  const delta = avgWr - 0.5

  if (delta >= 0.04 && crushedByCount === 0 && crushesCount >= 2) return 'very-easy'
  if (delta >= 0.025 && crushedByCount <= 1) return 'easy'
  if (delta >= 0.01) return 'comfortable'
  if (delta <= -0.04 && crushedByCount >= 3) return 'very-hard'
  if (delta <= -0.025 && crushedByCount >= 2) return 'hard'
  if (delta <= -0.01) return 'tough'
  return 'balanced'
}

function formatDescription(
  crushes: MatchupHit[],
  crushedBy: MatchupHit[],
  avgWr: number | null,
): string {
  const pct = avgWr !== null ? ((avgWr - 0.5) * 100).toFixed(1) : '0'
  const sign = avgWr !== null && avgWr >= 0.5 ? '+' : ''
  const wrStr = `${sign}${pct}%`

  const names = (hits: MatchupHit[]) =>
    hits
      .slice(0, 3)
      .map((h) => h.enemy.localized_name)
      .join(', ')

  if (crushes.length > 0 && crushedBy.length === 0) {
    return `Контрит ${names(crushes)} · средний WR ${wrStr}`
  }
  if (crushedBy.length > 0 && crushes.length === 0) {
    return `Контрят ${names(crushedBy)} · средний WR ${wrStr}`
  }
  if (crushes.length > 0 && crushedBy.length > 0) {
    return `Контрит ${names(crushes)}, но уязвим к ${names(crushedBy)} · ${wrStr}`
  }
  return `Ровный матч против всей команды · ${wrStr}`
}

/**
 * Per-picked-hero summary: who they counter, who counters them,
 * overall WR against the enemy, and a human-readable difficulty.
 *
 * avgWinrate weights by games_played * enemy-position-importance, so
 * a support counter matters less than a core counter.
 */
export function computeHeroMatchupSummaries(
  heroesById: Record<number, Hero>,
  picks: { radiant: number[]; dire: number[] },
  assignments: {
    radiant: Record<number, LaneAssignment | undefined>
    dire: Record<number, LaneAssignment | undefined>
  },
  matchups: Record<number, HeroMatchup[]>,
): HeroMatchupSummary[] {
  const results: HeroMatchupSummary[] = []

  const processSide = (side: Side) => {
    const enemySide: Side = side === 'radiant' ? 'dire' : 'radiant'
    const myPicks = picks[side]
    const enemyPicks = picks[enemySide]

    for (const heroId of myPicks) {
      const hero = heroesById[heroId]
      if (!hero) continue
      const heroMatchups = matchups[heroId] ?? []
      const heroPos = assignmentToPos(assignments[side][heroId])

      let weightedSum = 0
      let totalWeight = 0
      const hits: MatchupHit[] = []

      for (const enemyId of enemyPicks) {
        const enemy = heroesById[enemyId]
        if (!enemy) continue
        const m = heroMatchups.find((x) => x.hero_id === enemyId)
        if (!m || m.games_played === 0) continue
        const wr = m.wins / m.games_played
        const enemyPos = assignmentToPos(assignments[enemySide][enemyId])
        // Weight each matchup by the enemy's position importance: countering
        // an enemy carry moves avgWr more than countering an enemy pos5.
        const imp = positionWeight(enemyPos)
        const w = m.games_played * imp
        weightedSum += wr * w
        totalWeight += w
        hits.push({ enemy, enemyPos, winrate: wr, games: m.games_played })
      }

      const avgWinrate = totalWeight > 0 ? weightedSum / totalWeight : null

      const crushes = hits
        .filter((h) => h.winrate >= CRUSHES_THRESHOLD)
        .sort((a, b) => b.winrate - a.winrate)
      const crushedBy = hits
        .filter((h) => h.winrate <= CRUSHED_BY_THRESHOLD)
        .sort((a, b) => a.winrate - b.winrate)

      const difficulty = classifyDifficulty(
        avgWinrate,
        crushes.length,
        crushedBy.length,
      )
      const description = formatDescription(crushes, crushedBy, avgWinrate)

      results.push({
        hero,
        side,
        heroPos,
        avgWinrate,
        crushes,
        crushedBy,
        difficulty,
        description,
      })
    }
  }

  processSide('radiant')
  processSide('dire')

  return results
}
