import ky from 'ky'
import type { Hero } from '../types'

const OPEN_DOTA = 'https://api.opendota.com/api'

interface RawHeroStat {
  id: number
  name: string
  localized_name: string
  primary_attr: 'str' | 'agi' | 'int' | 'all'
  attack_type: 'Melee' | 'Ranged'
  roles: string[]
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
  attack_rate?: number
}

/**
 * Lane power = rough early-game (~lvl 6) effective combat strength.
 * Used as a proxy for "net worth contribution" on the lane.
 *
 * Computed as: dps_at_lvl6 * ehp_at_lvl6 / 1000  (kept on a similar scale to gold)
 */
function computeLanePower(h: RawHeroStat): number {
  const lvl = 6
  const str = h.base_str + h.str_gain * (lvl - 1)
  const agi = h.base_agi + h.agi_gain * (lvl - 1)
  const int = h.base_int + h.int_gain * (lvl - 1)

  const primaryBonus =
    h.primary_attr === 'str' ? str
      : h.primary_attr === 'agi' ? agi
      : h.primary_attr === 'int' ? int
      : (str + agi + int) * 0.7

  const baseDmg = (h.base_attack_min + h.base_attack_max) / 2 + primaryBonus
  const attackRate = h.attack_rate ?? 1.7
  const ias = 100 + agi
  const aps = (ias / 100) / attackRate
  const dps = baseDmg * aps

  const hp = h.base_health + str * 22
  const armor = h.base_armor + agi / 6
  const ehp = hp * (1 + 0.06 * armor)

  return Math.round((dps * ehp) / 1000)
}

export async function fetchHeroes(): Promise<Hero[]> {
  const raw = await ky.get(`${OPEN_DOTA}/heroStats`).json<RawHeroStat[]>()
  return raw
    .map((h): Hero => ({
      id: h.id,
      name: h.name,
      shortName: h.name.replace('npc_dota_hero_', ''),
      localized_name: h.localized_name,
      primary_attr: h.primary_attr,
      attack_type: h.attack_type,
      roles: h.roles,
      base_health: h.base_health,
      base_health_regen: h.base_health_regen,
      base_mana: h.base_mana,
      base_armor: h.base_armor,
      base_attack_min: h.base_attack_min,
      base_attack_max: h.base_attack_max,
      base_str: h.base_str,
      base_agi: h.base_agi,
      base_int: h.base_int,
      str_gain: h.str_gain,
      agi_gain: h.agi_gain,
      int_gain: h.int_gain,
      attack_range: h.attack_range,
      move_speed: h.move_speed,
      lanePower: computeLanePower(h),
    }))
    .sort((a, b) => a.localized_name.localeCompare(b.localized_name))
}
