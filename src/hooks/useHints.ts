import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchHeroMatchups, type HeroMatchup } from '../api/matchups'
import type { DraftState, Side } from '../types'
import { CM_SEQUENCE } from '../types'

export interface HeroHint {
  /** hero id */
  id: number
  /** Suggested score: for picks = avg WR vs enemy picks; for bans = avg WR vs our picks */
  score: number
  /** Number of matchup pairs used */
  pairs: number
}

export type HintMap = Map<number, HeroHint>

/**
 * Compute pick/ban suggestions for the current draft step.
 *
 * - **Pick** (our turn to pick): for each available hero, compute average WR
 *   against all enemy picks. High score = good pick for us.
 * - **Ban** (our turn to ban): for each available hero, compute average WR
 *   against our picks. High score = dangerous hero = should ban.
 *
 * Position filter: if provided, only consider matchups against heroes likely
 * playing the given position (simplified: we use all enemy/our picks).
 */
export function useHints(draft: DraftState, mySide: Side | null) {
  const [hints, setHints] = useState<HintMap>(new Map())
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(false)

  const action = CM_SEQUENCE[draft.step]
  const isBan = action?.kind === 'ban'
  const actionSide = action?.side ?? null

  // Determine which heroes to evaluate against
  const targetIds = useMemo(() => {
    if (!mySide || !action) return []
    if (isBan) {
      // Banning: evaluate how dangerous each hero is against OUR picks
      return [...draft.picks[mySide]]
    } else {
      // Picking: evaluate how well each hero does against ENEMY picks
      const enemy = mySide === 'radiant' ? 'dire' : 'radiant'
      return [...draft.picks[enemy]]
    }
  }, [mySide, action, isBan, draft.picks])

  // All taken hero ids
  const taken = useMemo(() => {
    const s = new Set<number>()
    draft.picks.radiant.forEach((id) => s.add(id))
    draft.picks.dire.forEach((id) => s.add(id))
    draft.bans.radiant.forEach((id) => s.add(id))
    draft.bans.dire.forEach((id) => s.add(id))
    return s
  }, [draft])

  const compute = useCallback(async () => {
    if (targetIds.length === 0) {
      // No enemy/our picks yet — can't compute meaningful hints
      setHints(new Map())
      setLoading(false)
      return
    }

    setLoading(true)

    // Load matchups for all target heroes
    const allMatchups: Record<number, HeroMatchup[]> = {}
    await Promise.all(
      targetIds.map(async (hid) => {
        try {
          allMatchups[hid] = await fetchHeroMatchups(hid)
        } catch {
          allMatchups[hid] = []
        }
      }),
    )

    // Build a score for every hero not yet taken
    // For each candidate hero, look at its matchup against each target hero.
    // matchups[targetId] contains { hero_id, wins, games_played } where
    // wins = target hero's wins. So candidate's WR = 1 - wins/games.
    const result = new Map<number, HeroHint>()

    // Collect all candidate hero ids from any matchup list
    const candidateScores: Record<number, { totalWr: number; totalGames: number; pairs: number }> = {}

    for (const targetId of targetIds) {
      const matchups = allMatchups[targetId] ?? []
      for (const m of matchups) {
        if (taken.has(m.hero_id)) continue
        if (m.games_played === 0) continue
        if (!candidateScores[m.hero_id]) {
          candidateScores[m.hero_id] = { totalWr: 0, totalGames: 0, pairs: 0 }
        }
        const candidateWr = 1 - m.wins / m.games_played
        candidateScores[m.hero_id].totalWr += candidateWr * m.games_played
        candidateScores[m.hero_id].totalGames += m.games_played
        candidateScores[m.hero_id].pairs += 1
      }
    }

    for (const [idStr, data] of Object.entries(candidateScores)) {
      const id = Number(idStr)
      const avgWr = data.totalGames > 0 ? data.totalWr / data.totalGames : 0.5
      result.set(id, {
        id,
        score: isBan ? avgWr : avgWr, // For ban: high = dangerous; for pick: high = good
        pairs: data.pairs,
      })
    }

    setHints(result)
    setLoading(false)
  }, [targetIds, taken, isBan])

  // Recompute when toggled on or draft changes
  useEffect(() => {
    if (active && draft.phase === 'drafting') {
      compute()
    } else {
      setHints(new Map())
    }
  }, [active, draft.step, draft.phase, compute])

  const toggle = useCallback(() => {
    setActive((a) => !a)
  }, [])

  return { hints, hintLoading: loading, hintActive: active, toggleHint: toggle, isBan }
}
