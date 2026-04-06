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
  past: DraftState[]
  future: DraftState[]

  setMySide: (s: Side | null) => void
  setOpponentReady: (b: boolean) => void
  setPhase: (p: DraftPhase) => void
  /** apply a remote draft state without recording history (replication) */
  applyDraft: (next: DraftState) => void
  reset: () => void

  // local actions (record history)
  pickHero: (heroId: number) => void
  assignLane: (side: Side, heroId: number, a: LaneAssignment | undefined) => void
  finishAssigning: () => void
  loadDraft: (next: DraftState) => void

  // history controls
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean
}

const HIST_LIMIT = 50

function pushHistory(past: DraftState[], current: DraftState): DraftState[] {
  const next = [...past, current]
  if (next.length > HIST_LIMIT) next.shift()
  return next
}

export const useDraftStore = create<Store>((set, get) => ({
  mySide: null,
  opponentReady: false,
  draft: initialDraft,
  past: [],
  future: [],

  setMySide: (s) => set({ mySide: s }),
  setOpponentReady: (b) => set({ opponentReady: b }),
  setPhase: (p) =>
    set((st) => ({
      past: pushHistory(st.past, st.draft),
      future: [],
      draft: { ...st.draft, phase: p },
    })),
  applyDraft: (next) => set({ draft: next }),
  reset: () =>
    set({ draft: initialDraft, past: [], future: [], opponentReady: false }),

  pickHero: (heroId) => {
    const { draft, past } = get()
    if (draft.phase !== 'drafting') return
    const action = CM_SEQUENCE[draft.step]
    if (!action) return
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
    set({
      draft: next,
      past: pushHistory(past, draft),
      future: [],
    })
  },

  assignLane: (side, heroId, a) => {
    const { draft, past } = get()
    const sideAssign = { ...draft.assignments[side] }
    if (a) sideAssign[heroId] = a
    else delete sideAssign[heroId]
    set({
      draft: {
        ...draft,
        assignments: { ...draft.assignments, [side]: sideAssign },
      },
      past: pushHistory(past, draft),
      future: [],
    })
  },

  finishAssigning: () => {
    const { draft, past } = get()
    set({
      draft: { ...draft, phase: 'verdict' },
      past: pushHistory(past, draft),
      future: [],
    })
  },

  loadDraft: (next) =>
    set((st) => ({
      draft: next,
      past: pushHistory(st.past, st.draft),
      future: [],
    })),

  undo: () => {
    const { past, draft, future } = get()
    if (past.length === 0) return
    const prev = past[past.length - 1]
    set({
      draft: prev,
      past: past.slice(0, -1),
      future: [draft, ...future],
    })
  },

  redo: () => {
    const { past, draft, future } = get()
    if (future.length === 0) return
    const next = future[0]
    set({
      draft: next,
      past: pushHistory(past, draft),
      future: future.slice(1),
    })
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}))
