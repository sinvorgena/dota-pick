import type { Hero, LaneAssignment, Lane, Side } from '../types'

export type LaneVerdict =
  | 'won'         // > 2000
  | 'small-win'   // > 1000
  | 'draw'        // < 500 abs
  | 'contested'   // 500..1000
  | 'small-loss'
  | 'lost'

export interface LaneResult {
  lane: Lane
  radiantPower: number
  direPower: number
  diff: number // radiant - dire
  radiantVerdict: LaneVerdict
  heroes: { radiant: Hero[]; dire: Hero[] }
}

function verdictFromDiff(diff: number): LaneVerdict {
  const abs = Math.abs(diff)
  if (abs < 500) return 'draw'
  if (abs < 1000) return diff > 0 ? 'contested' : 'contested'
  if (abs < 2000) return diff > 0 ? 'small-win' : 'small-loss'
  return diff > 0 ? 'won' : 'lost'
}

export const verdictLabel: Record<LaneVerdict, string> = {
  won: 'Уверенно выигран',
  'small-win': 'Небольшой перевес',
  contested: 'Спорный',
  draw: 'Равный',
  'small-loss': 'Небольшой проигрыш',
  lost: 'Уверенно проигран',
}

export const verdictColor: Record<LaneVerdict, string> = {
  won: 'text-emerald-400',
  'small-win': 'text-lime-400',
  contested: 'text-yellow-300',
  draw: 'text-zinc-300',
  'small-loss': 'text-orange-400',
  lost: 'text-rose-400',
}

export function computeLaneResults(
  heroesById: Record<number, Hero>,
  picks: { radiant: number[]; dire: number[] },
  assignments: {
    radiant: Record<number, LaneAssignment | undefined>
    dire: Record<number, LaneAssignment | undefined>
  },
): LaneResult[] {
  // Note: in Dota, radiant safe lane meets dire off lane (they share the lane).
  const lanePairs: Array<{ lane: Lane; radiantLane: Lane; direLane: Lane }> = [
    { lane: 'safe', radiantLane: 'safe', direLane: 'off' },
    { lane: 'mid', radiantLane: 'mid', direLane: 'mid' },
    { lane: 'off', radiantLane: 'off', direLane: 'safe' },
  ]

  return lanePairs.map(({ lane, radiantLane, direLane }) => {
    const radiantHeroes = picks.radiant
      .filter((id) => assignments.radiant[id]?.lane === radiantLane)
      .map((id) => heroesById[id])
      .filter(Boolean)
    const direHeroes = picks.dire
      .filter((id) => assignments.dire[id]?.lane === direLane)
      .map((id) => heroesById[id])
      .filter(Boolean)

    const radiantPower = radiantHeroes.reduce((s, h) => s + h.lanePower, 0)
    const direPower = direHeroes.reduce((s, h) => s + h.lanePower, 0)
    const diff = radiantPower - direPower

    return {
      lane,
      radiantPower,
      direPower,
      diff,
      radiantVerdict: verdictFromDiff(diff),
      heroes: { radiant: radiantHeroes, dire: direHeroes },
    }
  })
}

export const laneLabel: Record<Lane, string> = {
  safe: 'Лёгкая (safe)',
  mid: 'Средняя (mid)',
  off: 'Сложная (off)',
}

export const sideLabel: Record<Side, string> = {
  radiant: 'Radiant',
  dire: 'Dire',
}
