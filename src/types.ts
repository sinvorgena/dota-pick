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

// Captains Mode 24-action sequence (14 bans + 10 picks).
// Radiant is first-pick. Numbered comments correspond to slot index 1..24.
export const CM_SEQUENCE: DraftAction[] = [
  { kind: 'ban', side: 'radiant' }, // 1
  { kind: 'ban', side: 'radiant' }, // 2
  { kind: 'ban', side: 'dire' }, // 3
  { kind: 'ban', side: 'dire' }, // 4
  { kind: 'ban', side: 'radiant' }, // 5
  { kind: 'ban', side: 'dire' }, // 6
  { kind: 'ban', side: 'dire' }, // 7
  { kind: 'pick', side: 'radiant' }, // 8
  { kind: 'pick', side: 'dire' }, // 9
  { kind: 'ban', side: 'radiant' }, // 10
  { kind: 'ban', side: 'radiant' }, // 11
  { kind: 'ban', side: 'dire' }, // 12
  { kind: 'pick', side: 'dire' }, // 13
  { kind: 'pick', side: 'radiant' }, // 14
  { kind: 'pick', side: 'radiant' }, // 15
  { kind: 'pick', side: 'dire' }, // 16
  { kind: 'pick', side: 'dire' }, // 17
  { kind: 'pick', side: 'radiant' }, // 18
  { kind: 'ban', side: 'radiant' }, // 19
  { kind: 'ban', side: 'dire' }, // 20
  { kind: 'ban', side: 'radiant' }, // 21
  { kind: 'ban', side: 'dire' }, // 22
  { kind: 'pick', side: 'radiant' }, // 23
  { kind: 'pick', side: 'dire' }, // 24
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

/** Landscape (256×144). Modern Steam dota_react CDN — covers all heroes. */
export const heroImg = (shortName: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${shortName}.png`

/** Vertical portrait (71×94). Stratz CDN — covers all heroes including new ones
 *  (dawnbreaker, marci, muerta, primal_beast, ringmaster, kez). */
export const heroPortrait = (shortName: string) =>
  `https://cdn.stratz.com/images/dota2/heroes/${shortName}_vert.png`
