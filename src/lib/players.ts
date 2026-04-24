const STEAM_64_OFFSET = 76561197960265728n

/**
 * Parse a player identifier from several common forms into a 32-bit OpenDota
 * account_id. Returns null if we can't make sense of the input.
 *
 * Accepted forms:
 *   - Raw 32-bit account_id (e.g. "123456789")
 *   - Raw 64-bit steamid (e.g. "76561198083722517")
 *   - dotabuff.com/players/{id}
 *   - opendota.com/players/{id}
 *   - stratz.com/players/{id}
 *   - steamcommunity.com/profiles/{64-bit}
 */
export function parsePlayerId(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const urlMatch = trimmed.match(
    /(?:dotabuff|opendota|stratz)\.com\/players\/(\d+)/i,
  )
  if (urlMatch) return urlMatch[1]

  const steamProfile = trimmed.match(/steamcommunity\.com\/profiles\/(\d+)/i)
  if (steamProfile) return convertSteam64(steamProfile[1])

  const digits = trimmed.match(/^(\d+)$/)
  if (digits) {
    const n = digits[1]
    if (n.length >= 16) return convertSteam64(n)
    return n
  }

  return null
}

function convertSteam64(id: string): string | null {
  try {
    const n = BigInt(id)
    if (n <= STEAM_64_OFFSET) return null
    return (n - STEAM_64_OFFSET).toString()
  } catch {
    return null
  }
}

export interface SavedPlayer {
  accountId: string
  label: string
  mmrEstimate?: number | null
}

const LS_KEY = 'dp:friends:players'

// OpenDota's mmr_estimate is unreliable at Immortal+; for the known squad we
// hardcode the real current MMR so the summary stays meaningful.
// 223168818 — Властелин 3 (Ancient 3) ≈ 4200 MMR.
export const HARDCODED_MMR: Record<string, number> = {
  '314933827': 5970,
  '117905733': 6600,
  '471065417': 7500,
  '1532997110': 6500,
  '223168818': 4200,
}

export function getEffectiveMmr(
  accountId: string,
  fallback: number | null | undefined,
): number | null {
  const hard = HARDCODED_MMR[accountId]
  if (typeof hard === 'number') return hard
  return fallback ?? null
}

const DEFAULT_PLAYERS: SavedPlayer[] = [
  { accountId: '314933827', label: 'scion' },
  { accountId: '117905733', label: 'hope' },
  { accountId: '471065417', label: '.' },
  { accountId: '1532997110', label: 'Касамару' },
  { accountId: '223168818', label: 'iKsaGAM3R' },
]

export function loadSavedPlayers(): SavedPlayer[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw === null) return DEFAULT_PLAYERS
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (p): p is SavedPlayer =>
        !!p &&
        typeof p === 'object' &&
        typeof (p as SavedPlayer).accountId === 'string' &&
        typeof (p as SavedPlayer).label === 'string',
    )
  } catch {
    return []
  }
}

export function saveSavedPlayers(players: SavedPlayer[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(players))
}
