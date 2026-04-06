import type { Hero, Lane, LaneAssignment, Role, Side } from '../types'
import { HeroIcon } from './HeroIcon'
import { useDraftStore } from '../store/draftStore'

const LANES: { value: Lane; label: string }[] = [
  { value: 'safe', label: 'Safe' },
  { value: 'mid', label: 'Mid' },
  { value: 'off', label: 'Off' },
]
const ROLES: { value: Role; label: string }[] = [
  { value: 'core', label: 'Core' },
  { value: 'support', label: 'Sup' },
]

export function LaneAssign({
  side,
  picks,
  byId,
  assignments,
  editable,
}: {
  side: Side
  picks: number[]
  byId: Record<number, Hero>
  assignments: Record<number, LaneAssignment | undefined>
  editable: boolean
}) {
  const setAssign = useDraftStore((s) => s.assignLane)

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">
        {side === 'radiant' ? 'Radiant' : 'Dire'}
      </div>
      <div className="space-y-2">
        {picks.map((id) => {
          const hero = byId[id]
          if (!hero) return null
          const a = assignments[id]
          return (
            <div key={id} className="flex items-center gap-3 bg-bg/60 border border-border rounded px-2 py-1.5">
              <HeroIcon hero={hero} size="sm" />
              <span className="text-sm flex-1 truncate">{hero.localized_name}</span>
              <select
                disabled={!editable}
                value={a?.lane ?? ''}
                onChange={(e) =>
                  setAssign(side, id, {
                    lane: e.target.value as Lane,
                    role: a?.role ?? 'core',
                  })
                }
                className="bg-panel border border-border rounded px-2 py-1 text-xs"
              >
                <option value="">— лайн —</option>
                {LANES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <select
                disabled={!editable}
                value={a?.role ?? ''}
                onChange={(e) =>
                  setAssign(side, id, {
                    lane: a?.lane ?? 'safe',
                    role: e.target.value as Role,
                  })
                }
                className="bg-panel border border-border rounded px-2 py-1 text-xs"
              >
                <option value="">— роль —</option>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
