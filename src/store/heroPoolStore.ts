import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Hero pool — preferred heroes per position (1-5).
 * Persisted in localStorage so the player keeps their preferences across sessions.
 */

export type PositionPool = Record<number, number[]> // pos (1-5) -> hero ids

interface HeroPoolStore {
  /** pos -> hero id[] */
  pool: PositionPool
  /** Add hero to a position pool */
  addHero: (pos: number, heroId: number) => void
  /** Remove hero from a position pool */
  removeHero: (pos: number, heroId: number) => void
  /** Toggle hero in a position pool */
  toggleHero: (pos: number, heroId: number) => void
  /** Clear all heroes from a position */
  clearPos: (pos: number) => void
  /** Clear everything */
  clearAll: () => void
  /** Get all hero ids across all positions (flattened, unique) */
  allHeroIds: () => Set<number>
  /** Get positions for a specific hero */
  positionsFor: (heroId: number) => number[]
}

export const useHeroPoolStore = create<HeroPoolStore>()(
  persist(
    (set, get) => ({
      pool: { 1: [], 2: [], 3: [], 4: [], 5: [] },

      addHero: (pos, heroId) =>
        set((st) => {
          const list = st.pool[pos] ?? []
          if (list.includes(heroId)) return st
          return { pool: { ...st.pool, [pos]: [...list, heroId] } }
        }),

      removeHero: (pos, heroId) =>
        set((st) => {
          const list = st.pool[pos] ?? []
          return { pool: { ...st.pool, [pos]: list.filter((id) => id !== heroId) } }
        }),

      toggleHero: (pos, heroId) => {
        const list = get().pool[pos] ?? []
        if (list.includes(heroId)) {
          get().removeHero(pos, heroId)
        } else {
          get().addHero(pos, heroId)
        }
      },

      clearPos: (pos) =>
        set((st) => ({ pool: { ...st.pool, [pos]: [] } })),

      clearAll: () =>
        set({ pool: { 1: [], 2: [], 3: [], 4: [], 5: [] } }),

      allHeroIds: () => {
        const pool = get().pool
        const s = new Set<number>()
        for (const ids of Object.values(pool)) {
          for (const id of ids) s.add(id)
        }
        return s
      },

      positionsFor: (heroId) => {
        const pool = get().pool
        const result: number[] = []
        for (const [pos, ids] of Object.entries(pool)) {
          if (ids.includes(heroId)) result.push(Number(pos))
        }
        return result
      },
    }),
    {
      name: 'dota-hero-pool',
    },
  ),
)
