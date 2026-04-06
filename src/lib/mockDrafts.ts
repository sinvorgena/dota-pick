import type { DraftState, Lane, LaneAssignment, Role } from '../types'

interface HeroSpec {
  id: number
  lane: Lane
  role: Role
}

interface MockDraftSpec {
  name: string
  description: string
  radiantPicks: HeroSpec[]
  direPicks: HeroSpec[]
  radiantBans: number[]
  direBans: number[]
}

// Hero IDs reference (OpenDota): https://api.opendota.com/api/heroes
// 1 Anti-Mage, 8 Juggernaut, 11 Shadow Fiend, 14 Pudge, 22 Zeus,
// 26 Lion, 35 Sniper, 41 Faceless Void, 44 Phantom Assassin,
// 49 Dragon Knight, 52 Leshrac, 53 Nature's Prophet, 62 Bounty Hunter,
// 64 Jakiro, 65 Batrider, 71 Spirit Breaker, 74 Invoker, 81 Chaos Knight,
// 86 Rubick, 87 Disruptor, 90 Keeper of the Light, 92 Visage, 100 Tusk,
// 101 Skywrath Mage, 104 Legion Commander, 110 Phoenix, 114 Monkey King,
// 121 Grimstroke, 126 Void Spirit, 129 Mars, 137 Marci, 145 Hoodwink,
// 5 Crystal Maiden, 17 Storm Spirit, 19 Tiny

export const MOCK_DRAFTS: MockDraftSpec[] = [
  {
    name: 'Стандартный мета-драфт',
    description: 'PA carry vs Sniper carry — обычный публичный matchup',
    radiantPicks: [
      { id: 44, lane: 'safe', role: 'core' },     // Phantom Assassin
      { id: 5, lane: 'safe', role: 'support' },   // Crystal Maiden
      { id: 11, lane: 'mid', role: 'core' },      // Shadow Fiend
      { id: 129, lane: 'off', role: 'core' },     // Mars
      { id: 87, lane: 'off', role: 'support' },   // Disruptor
    ],
    direPicks: [
      { id: 35, lane: 'safe', role: 'core' },     // Sniper
      { id: 26, lane: 'safe', role: 'support' },  // Lion
      { id: 74, lane: 'mid', role: 'core' },      // Invoker
      { id: 49, lane: 'off', role: 'core' },      // Dragon Knight
      { id: 64, lane: 'off', role: 'support' },   // Jakiro
    ],
    radiantBans: [114, 8, 41],
    direBans: [22, 90, 86],
  },
  {
    name: 'Сильный radiant safe lane',
    description: 'Tiny+CM против слабой связки в safe — должен быть выигран лайн',
    radiantPicks: [
      { id: 8, lane: 'safe', role: 'core' },      // Juggernaut
      { id: 19, lane: 'safe', role: 'support' },  // Tiny
      { id: 17, lane: 'mid', role: 'core' },      // Storm Spirit
      { id: 104, lane: 'off', role: 'core' },     // Legion Commander
      { id: 100, lane: 'off', role: 'support' },  // Tusk
    ],
    direPicks: [
      { id: 1, lane: 'safe', role: 'core' },      // Anti-Mage (weak laner)
      { id: 90, lane: 'safe', role: 'support' },  // Keeper of the Light
      { id: 11, lane: 'mid', role: 'core' },      // SF
      { id: 53, lane: 'off', role: 'core' },      // Nature's Prophet (split)
      { id: 101, lane: 'off', role: 'support' },  // Skywrath
    ],
    radiantBans: [44, 41, 22],
    direBans: [74, 71, 65],
  },
  {
    name: 'Тимфайт vs тимфайт',
    description: 'Mars+Disruptor vs Tide+Magnus — поздняя стадия',
    radiantPicks: [
      { id: 41, lane: 'safe', role: 'core' },     // Faceless Void
      { id: 121, lane: 'safe', role: 'support' }, // Grimstroke
      { id: 126, lane: 'mid', role: 'core' },     // Void Spirit
      { id: 129, lane: 'off', role: 'core' },     // Mars
      { id: 87, lane: 'off', role: 'support' },   // Disruptor
    ],
    direPicks: [
      { id: 44, lane: 'safe', role: 'core' },     // PA
      { id: 64, lane: 'safe', role: 'support' },  // Jakiro
      { id: 22, lane: 'mid', role: 'core' },      // Zeus
      { id: 110, lane: 'off', role: 'core' },     // Phoenix
      { id: 137, lane: 'off', role: 'support' },  // Marci
    ],
    radiantBans: [74, 17, 8],
    direBans: [11, 26, 86],
  },
]

/**
 * Convert a mock draft spec into a finished DraftState ready for the
 * 'assigning' or 'verdict' phase.
 */
export function buildMockDraftState(spec: MockDraftSpec): DraftState {
  const radiantAssign: Record<number, LaneAssignment> = {}
  const direAssign: Record<number, LaneAssignment> = {}
  spec.radiantPicks.forEach((p) => {
    radiantAssign[p.id] = { lane: p.lane, role: p.role }
  })
  spec.direPicks.forEach((p) => {
    direAssign[p.id] = { lane: p.lane, role: p.role }
  })

  return {
    phase: 'verdict',
    picks: {
      radiant: spec.radiantPicks.map((p) => p.id),
      dire: spec.direPicks.map((p) => p.id),
    },
    bans: {
      radiant: spec.radiantBans,
      dire: spec.direBans,
    },
    step: 22,
    assignments: {
      radiant: radiantAssign,
      dire: direAssign,
    },
  }
}
