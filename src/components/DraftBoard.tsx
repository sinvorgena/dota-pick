import { CM_SEQUENCE, type DraftState, type Side, heroImg } from '../types'
import type { Hero } from '../types'
import clsx from 'clsx'

interface Props {
  draft: DraftState
  byId: Record<number, Hero>
  mySide: Side | null
}

interface ResolvedSlot {
  index: number // 0-based action index
  side: Side
  kind: 'ban' | 'pick'
  heroId: number | null
  isCurrent: boolean
}

/** Walk CM_SEQUENCE and figure out which hero ended up in each slot. */
function resolveSlots(draft: DraftState): ResolvedSlot[] {
  const out: ResolvedSlot[] = []
  const cursors = {
    radiant: { pick: 0, ban: 0 },
    dire: { pick: 0, ban: 0 },
  }

  CM_SEQUENCE.forEach((action, i) => {
    const filled = i < draft.step
    let heroId: number | null = null
    if (filled) {
      const list =
        action.kind === 'pick'
          ? draft.picks[action.side]
          : draft.bans[action.side]
      heroId = list[cursors[action.side][action.kind]] ?? null
      cursors[action.side][action.kind]++
    }
    out.push({
      index: i,
      side: action.side,
      kind: action.kind,
      heroId,
      isCurrent: i === draft.step && draft.phase === 'drafting',
    })
  })
  return out
}

export function DraftBoard({ draft, byId, mySide }: Props) {
  const slots = resolveSlots(draft)
  const action = CM_SEQUENCE[draft.step]
  const finished = draft.step >= CM_SEQUENCE.length

  return (
    <div className="bg-panel border border-border rounded-xl p-4">
      <div className="flex items-center justify-center gap-3 mb-3">
        {finished ? (
          <span className="text-emerald-400 font-semibold">Драфт завершён</span>
        ) : (
          <>
            <span className="text-zinc-500 text-sm">
              Шаг {draft.step + 1}/{CM_SEQUENCE.length}
            </span>
            <span
              className={clsx(
                'px-3 py-1 rounded text-sm font-semibold',
                action.side === 'radiant' ? 'bg-emerald-700' : 'bg-rose-700',
              )}
            >
              {action.side === 'radiant' ? 'Radiant' : 'Dire'} ·{' '}
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

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
        {/* Headers */}
        <div className="text-emerald-400 font-bold text-center text-sm">
          Radiant
        </div>
        <div />
        <div className="text-rose-400 font-bold text-center text-sm">Dire</div>

        {slots.map((slot) => (
          <SlotRow key={slot.index} slot={slot} byId={byId} />
        ))}
      </div>
    </div>
  )
}

function SlotRow({
  slot,
  byId,
}: {
  slot: ResolvedSlot
  byId: Record<number, Hero>
}) {
  const cellClass =
    'h-14 rounded border relative overflow-hidden flex items-center justify-center'
  const empty = (
    <div
      className={clsx(
        cellClass,
        'border-dashed border-zinc-800 bg-zinc-900/30',
      )}
    />
  )

  const cell = (side: Side) => {
    if (slot.side !== side) return empty
    const hero = slot.heroId != null ? byId[slot.heroId] : null
    const isPick = slot.kind === 'pick'
    const isBan = slot.kind === 'ban'

    return (
      <div
        className={clsx(
          cellClass,
          slot.isCurrent && 'ring-2 ring-amber-400 animate-pulse',
          side === 'radiant' ? 'border-emerald-700/60' : 'border-rose-700/60',
          isPick && hero
            ? side === 'radiant'
              ? 'bg-emerald-900/40'
              : 'bg-rose-900/40'
            : '',
          !hero && (isBan
            ? side === 'radiant'
              ? 'bg-emerald-950/40'
              : 'bg-rose-950/40'
            : side === 'radiant'
              ? 'bg-emerald-950/20'
              : 'bg-rose-950/20'),
        )}
      >
        {hero && (
          <>
            <img
              src={heroImg(hero.shortName)}
              alt={hero.localized_name}
              className={clsx(
                'absolute inset-0 w-full h-full object-cover',
                isBan && 'opacity-40 grayscale',
              )}
            />
            {isBan && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-[2px] bg-rose-500 rotate-[-12deg]" />
              </div>
            )}
            <div className="absolute bottom-0.5 left-1 text-[10px] font-bold text-white drop-shadow z-10">
              {slot.index + 1}
            </div>
          </>
        )}
        {!hero && (
          <span className="text-xs font-semibold text-zinc-400">
            {slot.index + 1}
          </span>
        )}
      </div>
    )
  }

  return (
    <>
      {cell('radiant')}
      <div className="text-[10px] text-zinc-600 self-center px-1 uppercase tracking-wider">
        {slot.kind}
      </div>
      {cell('dire')}
    </>
  )
}
