export type Side = 'radiant' | 'dire'

export type Lane = 'safe' | 'mid' | 'off'
export type Role = 'core' | 'support'

export interface LaneAssignment {
  lane: Lane
  role: Role
}

export interface Hero {
  id: number
  name: string // npc_dota_hero_xxx
  shortName: string // xxx
  localized_name: string
  primary_attr: 'str' | 'agi' | 'int' | 'all'
  attack_type: 'Melee' | 'Ranged'
  roles: string[]
  // base stats from OpenDota /heroStats
  base_health: number
  base_health_regen: number
  base_mana: number
  base_armor: number
  base_attack_min: number
  base_attack_max: number
  base_str: number
  base_agi: number
  base_int: number
  str_gain: number
  agi_gain: number
  int_gain: number
  attack_range: number
  move_speed: number
  /** computed lane power proxy (≈ early-game net worth contribution) */
  lanePower: number
}

export type DraftPhase =
  | 'lobby' // waiting for opponent
  | 'side-pick' // pick side
  | 'drafting' // captains draft in progress
  | 'assigning' // map heroes to lanes
  | 'verdict' // see matchup verdict

export type ActionKind = 'ban' | 'pick'

export interface DraftAction {
  kind: ActionKind
  side: Side
}

export interface DraftSlot {
  side: Side
  kind: ActionKind
  index: number
  heroId: number | null
}

// Standard Captains Mode 24-action sequence (14 bans + 10 picks).
// Phase split: 4 bans → 4 picks → 6 bans → 4 picks → 4 bans → 2 picks
// Side order (each ban phase starts with Radiant; picks snake): see entries below.
export const CM_SEQUENCE: DraftAction[] = [
  // Ban phase 1 (4 bans)
  { kind: 'ban', side: 'radiant' },
  { kind: 'ban', side: 'dire' },
  { kind: 'ban', side: 'radiant' },
  { kind: 'ban', side: 'dire' },
  // Pick phase 1 (4 picks)
  { kind: 'pick', side: 'radiant' },
  { kind: 'pick', side: 'dire' },
  { kind: 'pick', side: 'dire' },
  { kind: 'pick', side: 'radiant' },
  // Ban phase 2 (6 bans)
  { kind: 'ban', side: 'radiant' },
  { kind: 'ban', side: 'dire' },
  { kind: 'ban', side: 'radiant' },
  { kind: 'ban', side: 'dire' },
  { kind: 'ban', side: 'radiant' },
  { kind: 'ban', side: 'dire' },
  // Pick phase 2 (4 picks)
  { kind: 'pick', side: 'dire' },
  { kind: 'pick', side: 'radiant' },
  { kind: 'pick', side: 'dire' },
  { kind: 'pick', side: 'radiant' },
  // Ban phase 3 (4 bans)
  { kind: 'ban', side: 'radiant' },
  { kind: 'ban', side: 'dire' },
  { kind: 'ban', side: 'radiant' },
  { kind: 'ban', side: 'dire' },
  // Pick phase 3 (2 picks)
  { kind: 'pick', side: 'radiant' },
  { kind: 'pick', side: 'dire' },
]

export interface DraftState {
  phase: DraftPhase
  picks: { radiant: number[]; dire: number[] } // hero ids in pick order
  bans: { radiant: number[]; dire: number[] }
  step: number // current index into CM_SEQUENCE
  // assignment of picked heroes to lane/role per side
  assignments: {
    radiant: Record<number, LaneAssignment | undefined>
    dire: Record<number, LaneAssignment | undefined>
  }
}

export const heroImg = (shortName: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${shortName}.png`
