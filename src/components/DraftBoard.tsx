import { CM_SEQUENCE, type DraftState, heroImg } from '../types'
import type { Hero } from '../types'
import clsx from 'clsx'

interface Props {
  draft: DraftState
  byId: Record<number, Hero>
}

interface ResolvedSlot {
  index: number
  side: 'radiant' | 'dire'
  kind: 'ban' | 'pick'
  heroId: number | null
  isCurrent: boolean
}

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

export function DraftBoard({ draft, byId }: Props) {
  const slots = resolveSlots(draft)

  return (
    <div className="bg-panel border border-border rounded-xl p-3">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="text-emerald-400 font-bold text-center text-sm tracking-wider">
          RADIANT
        </div>
        <div className="text-rose-400 font-bold text-center text-sm tracking-wider">
          DIRE
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {slots.map((slot) => (
          <SlotCell key={slot.index} slot={slot} byId={byId} />
        ))}
      </div>
    </div>
  )
}

function SlotCell({
  slot,
  byId,
}: {
  slot: ResolvedSlot
  byId: Record<number, Hero>
}) {
  const sideColor =
    slot.side === 'radiant'
      ? 'border-emerald-700/50 bg-emerald-950/30'
      : 'border-rose-700/50 bg-rose-950/30'

  const hero = slot.heroId != null ? byId[slot.heroId] : null
  const isBan = slot.kind === 'ban'

  return (
    <>
      <SideCell
        active={slot.side === 'radiant'}
        isCurrent={slot.isCurrent}
        sideColor={slot.side === 'radiant' ? sideColor : ''}
        index={slot.index}
        kind={slot.kind}
        hero={slot.side === 'radiant' ? hero : null}
        isBan={isBan}
      />
      <SideCell
        active={slot.side === 'dire'}
        isCurrent={slot.isCurrent}
        sideColor={slot.side === 'dire' ? sideColor : ''}
        index={slot.index}
        kind={slot.kind}
        hero={slot.side === 'dire' ? hero : null}
        isBan={isBan}
      />
    </>
  )
}

function SideCell({
  active,
  isCurrent,
  sideColor,
  index,
  kind,
  hero,
  isBan,
}: {
  active: boolean
  isCurrent: boolean
  sideColor: string
  index: number
  kind: 'ban' | 'pick'
  hero: Hero | null
  isBan: boolean
}) {
  if (!active) {
    return <div className="h-12 rounded-md border border-dashed border-zinc-800/50" />
  }
  return (
    <div
      className={clsx(
        'h-12 rounded-md border relative overflow-hidden',
        sideColor,
        isCurrent && 'ring-2 ring-amber-400 animate-pulse z-10',
      )}
    >
      {hero && (
        <img
          src={heroImg(hero.shortName)}
          alt={hero.localized_name}
          className={clsx(
            'absolute inset-0 w-full h-full object-cover',
            isBan && 'opacity-40 grayscale',
          )}
        />
      )}
      {hero && isBan && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full h-[2px] bg-rose-500 rotate-[-12deg]" />
        </div>
      )}
      <div className="absolute top-0.5 left-1 text-[10px] font-bold text-white drop-shadow z-10">
        {index + 1}
      </div>
      {!hero && (
        <div className="absolute bottom-0.5 right-1 text-[8px] uppercase text-zinc-500 tracking-wider">
          {kind}
        </div>
      )}
    </div>
  )
}
