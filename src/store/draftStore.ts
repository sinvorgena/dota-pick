import { create } from 'zustand'
import type { DraftPhase, DraftState, LaneAssignment, Side } from '../types'
import { CM_SEQUENCE } from '../types'

const initialDraft: DraftState = {
  phase: 'lobby',
  picks: { radiant: [], dire: [] },
  bans: { radiant: [], dire: [] },
  step: 0,
  assignments: { radiant: {}, dire: {} },
}

interface Store {
  /** local user's side */
  mySide: Side | null
  /** opponent connected */
  opponentReady: boolean

  draft: DraftState

  setMySide: (s: Side | null) => void
  setOpponentReady: (b: boolean) => void
  setPhase: (p: DraftPhase) => void
  applyDraft: (next: DraftState) => void
  reset: () => void

  // local actions
  pickHero: (heroId: number) => void // applies action for current step
  assignLane: (side: Side, heroId: number, a: LaneAssignment | undefined) => void
  finishAssigning: () => void
  loadDraft: (next: DraftState) => void
}

export const useDraftStore = create<Store>((set, get) => ({
  mySide: null,
  opponentReady: false,
  draft: initialDraft,

  setMySide: (s) => set({ mySide: s }),
  setOpponentReady: (b) => set({ opponentReady: b }),
  setPhase: (p) => set((st) => ({ draft: { ...st.draft, phase: p } })),
  applyDraft: (next) => set({ draft: next }),
  reset: () => set({ draft: initialDraft, opponentReady: false }),

  pickHero: (heroId) => {
    const { draft } = get()
    if (draft.phase !== 'drafting') return
    const action = CM_SEQUENCE[draft.step]
    if (!action) return
    // prevent dupes
    const all = [
      ...draft.picks.radiant,
      ...draft.picks.dire,
      ...draft.bans.radiant,
      ...draft.bans.dire,
    ]
    if (all.includes(heroId)) return

    const next: DraftState = {
      ...draft,
      picks: {
        radiant: [...draft.picks.radiant],
        dire: [...draft.picks.dire],
      },
      bans: {
        radiant: [...draft.bans.radiant],
        dire: [...draft.bans.dire],
      },
      step: draft.step + 1,
    }
    if (action.kind === 'pick') next.picks[action.side].push(heroId)
    else next.bans[action.side].push(heroId)

    if (next.step >= CM_SEQUENCE.length) {
      next.phase = 'assigning'
    }
    set({ draft: next })
  },

  assignLane: (side, heroId, a) => {
    const { draft } = get()
    const sideAssign = { ...draft.assignments[side] }
    if (a) sideAssign[heroId] = a
    else delete sideAssign[heroId]
    set({
      draft: {
        ...draft,
        assignments: { ...draft.assignments, [side]: sideAssign },
      },
    })
  },

  finishAssigning: () => {
    const { draft } = get()
    set({ draft: { ...draft, phase: 'verdict' } })
  },

  loadDraft: (next) => set({ draft: next }),
}))
