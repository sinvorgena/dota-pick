import { CM_SEQUENCE, type DraftState, type Side } from '../types'
import { formatTime, type TimerState } from '../hooks/useTimer'
import clsx from 'clsx'

interface Props {
  draft: DraftState
  mySide: Side | null
  timer?: TimerState | null
}

export function DraftStatusBar({ draft, mySide, timer }: Props) {
  const action = CM_SEQUENCE[draft.step]
  const finished = draft.step >= CM_SEQUENCE.length

  if (finished) {
    return (
      <div className="bg-panel border border-border rounded-xl py-5">
        <h1 className="text-center text-3xl font-bold tracking-wide text-emerald-300">
          Draft Complete
        </h1>
      </div>
    )
  }

  if (!action) {
    return (
      <div className="bg-panel border border-border rounded-xl py-5 text-center text-zinc-500">
        Подготовка драфта…
      </div>
    )
  }

  const isMyTurn = mySide && action.side === mySide

  return (
    <div className="bg-panel border border-border rounded-xl py-3 px-6 grid grid-cols-3 items-center">
      {/* left: radiant reserve + progress */}
      <div className="space-y-1">
        <div className="text-zinc-400 text-sm">
          Шаг{' '}
          <span className="text-zinc-100 font-semibold">{draft.step + 1}</span> /{' '}
          {CM_SEQUENCE.length}
        </div>
        {timer && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-emerald-400">
              R: {formatTime(timer.radiantReserve)}
            </span>
            <span className="text-rose-400">
              D: {formatTime(timer.direReserve)}
            </span>
          </div>
        )}
      </div>

      {/* center: title + bonus timer */}
      <div className="text-center">
        <div
          className={clsx(
            'text-2xl font-bold tracking-wide uppercase',
            action.side === 'radiant' ? 'text-emerald-300' : 'text-rose-300',
          )}
        >
          {action.side === 'radiant' ? 'Radiant' : 'Dire'} ·{' '}
          {action.kind === 'pick' ? 'Pick' : 'Ban'}
        </div>
        <div className="flex items-center justify-center gap-2 mt-1">
          {mySide && (
            <span className="text-xs">
              {isMyTurn ? (
                <span className="text-amber-300">твой ход</span>
              ) : (
                <span className="text-zinc-500">ход соперника</span>
              )}
            </span>
          )}
          {timer && timer.running && (
            <span
              className={clsx(
                'text-sm font-mono font-bold',
                timer.bonus > 5
                  ? 'text-zinc-200'
                  : timer.bonus > 0
                    ? 'text-amber-400'
                    : 'text-rose-400',
              )}
            >
              {formatTime(timer.bonus > 0 ? timer.bonus : (action.side === 'radiant' ? timer.radiantReserve : timer.direReserve))}
            </span>
          )}
        </div>
      </div>

      {/* right: phase counts */}
      <div className="text-right text-xs text-zinc-500">
        <div>
          <span className="text-emerald-400">{draft.picks.radiant.length}</span>
          <span className="mx-1">vs</span>
          <span className="text-rose-400">{draft.picks.dire.length}</span> picks
        </div>
        <div>
          <span className="text-emerald-400">{draft.bans.radiant.length}</span>
          <span className="mx-1">vs</span>
          <span className="text-rose-400">{draft.bans.dire.length}</span> bans
        </div>
      </div>
    </div>
  )
}
