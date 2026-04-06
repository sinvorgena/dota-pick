import { CM_SEQUENCE, type DraftState, type Side } from '../types'
import type { Hero } from '../types'
import { HeroIcon } from './HeroIcon'
import clsx from 'clsx'

interface Props {
  draft: DraftState
  byId: Record<number, Hero>
  mySide: Side | null
}

export function DraftBoard({ draft, byId, mySide }: Props) {
  const action = CM_SEQUENCE[draft.step]
  const finished = draft.step >= CM_SEQUENCE.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        {finished ? (
          <span className="text-emerald-400 font-semibold">Драфт завершён</span>
        ) : (
          <>
            <span className="text-zinc-400 text-sm">Шаг {draft.step + 1}/22:</span>
            <span
              className={clsx(
                'px-3 py-1 rounded text-sm font-semibold',
                action.side === 'radiant' ? 'bg-emerald-700' : 'bg-rose-700',
              )}
            >
              {action.side === 'radiant' ? 'Radiant' : 'Dire'} —{' '}
              {action.kind === 'pick' ? 'PICK' : 'BAN'}
            </span>
            {mySide && action.side === mySide && (
              <span className="text-emerald-300 text-sm">твой ход</span>
            )}
            {mySide && action.side !== mySide && (
              <span className="text-zinc-500 text-sm">ход соперника</span>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SidePanel side="radiant" draft={draft} byId={byId} />
        <SidePanel side="dire" draft={draft} byId={byId} />
      </div>
    </div>
  )
}

function SidePanel({
  side,
  draft,
  byId,
}: {
  side: Side
  draft: DraftState
  byId: Record<number, Hero>
}) {
  const picks = draft.picks[side]
  const bans = draft.bans[side]
  return (
    <div
      className={clsx(
        'rounded-xl p-3 border',
        side === 'radiant' ? 'border-emerald-800 bg-emerald-950/30' : 'border-rose-800 bg-rose-950/30',
      )}
    >
      <div className="text-sm font-semibold mb-2">
        {side === 'radiant' ? 'Radiant' : 'Dire'} · {picks.length}/5 picks
      </div>
      <div className="flex flex-wrap gap-1 min-h-[56px]">
        {picks.map((id) => byId[id] && <HeroIcon key={id} hero={byId[id]} size="md" />)}
        {Array.from({ length: 5 - picks.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="w-20 h-12 rounded border border-dashed border-zinc-700"
          />
        ))}
      </div>
      <div className="text-xs text-zinc-400 mt-3 mb-1">Bans</div>
      <div className="flex flex-wrap gap-1">
        {bans.map((id) => byId[id] && <HeroIcon key={id} hero={byId[id]} size="sm" banned />)}
      </div>
    </div>
  )
}
