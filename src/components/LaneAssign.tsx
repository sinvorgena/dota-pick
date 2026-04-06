import { useRef, useState } from 'react'
import type { DraftState, Hero, Lane, Role, Side } from '../types'
import { HeroIcon } from './HeroIcon'
import { useDraftStore } from '../store/draftStore'
import clsx from 'clsx'

const POSITIONS: {
  pos: number
  lane: Lane
  role: Role
  label: string
}[] = [
  { pos: 1, lane: 'safe', role: 'core', label: 'Safe · Carry' },
  { pos: 2, lane: 'mid', role: 'core', label: 'Mid' },
  { pos: 3, lane: 'off', role: 'core', label: 'Off · Core' },
  { pos: 4, lane: 'off', role: 'support', label: 'Off · Sup' },
  { pos: 5, lane: 'safe', role: 'support', label: 'Safe · Sup' },
]

const DND_MIME = 'application/x-dota-pick'

export function LaneAssignBoard({
  draft,
  byId,
}: {
  draft: DraftState
  byId: Record<number, Hero>
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <SideBoard
        side="radiant"
        picks={draft.picks.radiant}
        assignments={draft.assignments.radiant}
        byId={byId}
      />
      <SideBoard
        side="dire"
        picks={draft.picks.dire}
        assignments={draft.assignments.dire}
        byId={byId}
      />
    </div>
  )
}

function SideBoard({
  side,
  picks,
  assignments,
  byId,
}: {
  side: Side
  picks: number[]
  assignments: DraftState['assignments']['radiant']
  byId: Record<number, Hero>
}) {
  const setAssign = useDraftStore((s) => s.assignLane)

  const heroInSlot = (lane: Lane, role: Role): number | null => {
    for (const id of picks) {
      const a = assignments[id]
      if (a && a.lane === lane && a.role === role) return id
    }
    return null
  }

  const unassigned = picks.filter((id) => !assignments[id])

  const onSlotDrop =
    (lane: Lane, role: Role) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain')
      if (!raw) return
      const [srcSide, idStr] = raw.split(':')
      if (srcSide !== side) return
      const heroId = Number(idStr)
      if (!Number.isFinite(heroId)) return
      // evict current occupant of target slot if it's a different hero
      const occupant = heroInSlot(lane, role)
      if (occupant != null && occupant !== heroId) {
        setAssign(side, occupant, undefined)
      }
      setAssign(side, heroId, { lane, role })
    }

  const onPoolDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData('text/plain')
    if (!raw) return
    const [srcSide, idStr] = raw.split(':')
    if (srcSide !== side) return
    setAssign(side, Number(idStr), undefined)
  }

  const sideColor =
    side === 'radiant'
      ? 'text-emerald-400'
      : 'text-rose-400'
  const sideRing =
    side === 'radiant'
      ? 'border-emerald-700/40'
      : 'border-rose-700/40'

  return (
    <div className={clsx('bg-panel border rounded-xl p-3 space-y-3', sideRing)}>
      <div className={clsx('text-xs font-bold uppercase tracking-wider', sideColor)}>
        {side === 'radiant' ? 'Radiant' : 'Dire'}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {POSITIONS.map((p) => {
          const heroId = heroInSlot(p.lane, p.role)
          const hero = heroId != null ? byId[heroId] : null
          return (
            <div key={p.pos} className="space-y-1">
              <SlotCell
                side={side}
                pos={p.pos}
                hero={hero}
                onDrop={onSlotDrop(p.lane, p.role)}
                onHeroClick={
                  heroId != null
                    ? () => setAssign(side, heroId, undefined)
                    : undefined
                }
              />
              <div className="text-[9px] text-zinc-500 text-center uppercase tracking-wider">
                {p.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* unassigned pool */}
      <PoolDropZone onDrop={onPoolDrop}>
        {unassigned.length === 0 ? (
          <div className="text-[10px] text-zinc-600 italic w-full text-center py-3">
            все герои распределены
          </div>
        ) : (
          unassigned.map((id) => {
            const hero = byId[id]
            if (!hero) return null
            return <DraggableHero key={id} hero={hero} side={side} />
          })
        )}
      </PoolDropZone>
    </div>
  )
}

function SlotCell({
  side,
  pos,
  hero,
  onDrop,
  onHeroClick,
}: {
  side: Side
  pos: number
  hero: Hero | null
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onHeroClick?: () => void
}) {
  const sideBg =
    side === 'radiant' ? 'bg-emerald-950/20' : 'bg-rose-950/20'
  const overRing =
    side === 'radiant' ? 'ring-emerald-400' : 'ring-rose-400'
  const overBg =
    side === 'radiant' ? 'bg-emerald-500/20' : 'bg-rose-500/20'

  // Track drag-over with a counter ref to handle child enter/leave noise.
  const counter = useRef(0)
  const [isOver, setIsOver] = useState(false)

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    counter.current += 1
    if (counter.current > 0) setIsOver(true)
  }
  const handleDragLeave = () => {
    counter.current = Math.max(0, counter.current - 1)
    if (counter.current === 0) setIsOver(false)
  }
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    counter.current = 0
    setIsOver(false)
    onDrop(e)
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={handleDrop}
      className={clsx(
        'aspect-[71/94] rounded relative group transition-all duration-100',
        hero
          ? 'border border-zinc-700'
          : clsx('border-2 border-dashed border-zinc-700', sideBg),
        isOver && clsx('ring-2 ring-offset-1 ring-offset-bg scale-[1.05]', overRing, overBg),
      )}
    >
      {/* position number badge — always visible top-left */}
      <div className="absolute top-0.5 left-0.5 z-20 text-[10px] font-bold text-zinc-400 bg-black/60 rounded px-1 leading-tight pointer-events-none">
        {pos}
      </div>
      {hero && (
        <DraggableHero
          hero={hero}
          side={side}
          fill
          onClick={onHeroClick}
        />
      )}
    </div>
  )
}

function PoolDropZone({
  children,
  onDrop,
}: {
  children: React.ReactNode
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
}) {
  const counter = useRef(0)
  const [isOver, setIsOver] = useState(false)

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    counter.current += 1
    if (counter.current > 0) setIsOver(true)
  }
  const handleDragLeave = () => {
    counter.current = Math.max(0, counter.current - 1)
    if (counter.current === 0) setIsOver(false)
  }
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    counter.current = 0
    setIsOver(false)
    onDrop(e)
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={handleDrop}
      className={clsx(
        'min-h-[72px] border border-dashed rounded-lg p-2 flex flex-wrap gap-2 items-center transition-all duration-100',
        isOver
          ? 'bg-amber-500/10 border-amber-400'
          : 'bg-bg/40 border-zinc-800',
      )}
    >
      {children}
    </div>
  )
}

function DraggableHero({
  hero,
  side,
  fill,
  onClick,
}: {
  hero: Hero
  side: Side
  fill?: boolean
  onClick?: () => void
}) {
  const onDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    const payload = `${side}:${hero.id}`
    e.dataTransfer.setData(DND_MIME, payload)
    e.dataTransfer.setData('text/plain', payload)
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={clsx(
        'cursor-grab active:cursor-grabbing',
        fill ? 'absolute inset-0' : 'w-12',
      )}
      title={onClick ? `${hero.localized_name} · клик чтобы убрать` : hero.localized_name}
    >
      <HeroIcon hero={hero} variant="portrait" />
    </div>
  )
}
