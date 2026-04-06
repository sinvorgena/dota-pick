import { useMemo, useState } from 'react'
import type { DraftState, Hero } from '../types'
import { HeroIcon } from './HeroIcon'

interface Props {
  heroes: Hero[]
  draft: DraftState
  canAct: boolean
  onPick: (heroId: number) => void
}

export function HeroPool({ heroes, draft, canAct, onPick }: Props) {
  const [q, setQ] = useState('')

  const taken = useMemo(() => {
    const s = new Set<number>()
    draft.picks.radiant.forEach((id) => s.add(id))
    draft.picks.dire.forEach((id) => s.add(id))
    draft.bans.radiant.forEach((id) => s.add(id))
    draft.bans.dire.forEach((id) => s.add(id))
    return s
  }, [draft])

  const filtered = useMemo(() => {
    const ql = q.toLowerCase()
    return heroes.filter((h) => h.localized_name.toLowerCase().includes(ql))
  }, [heroes, q])

  return (
    <div className="bg-panel rounded-xl border border-border p-3 space-y-3">
      <div className="flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск героя..."
          className="flex-1 bg-bg border border-border rounded px-3 py-1.5 text-sm outline-none"
        />
        <span className="text-xs text-zinc-500">{filtered.length} героев</span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5">
        {filtered.map((h) => {
          const isTaken = taken.has(h.id)
          return (
            <HeroIcon
              key={h.id}
              hero={h}
              dim={isTaken}
              selectable={canAct && !isTaken}
              onClick={canAct && !isTaken ? () => onPick(h.id) : undefined}
              title={`${h.localized_name} · power ${h.lanePower}`}
            />
          )
        })}
      </div>
    </div>
  )
}
