import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDraftStore } from '../store/draftStore'
import { useHeroes } from '../hooks/useHeroes'
import { CM_SEQUENCE } from '../types'
import { useTimer } from '../hooks/useTimer'
import { DraftBoard } from '../components/DraftBoard'
import { DraftStatusBar } from '../components/DraftStatusBar'
import { HeroPool } from '../components/HeroPool'
import { LaneAssignBoard } from '../components/LaneAssign'
import { Verdict } from '../components/Verdict'

export default function Solo() {
  const { data: heroes, byId, isLoading } = useHeroes()

  const draft = useDraftStore((s) => s.draft)
  const past = useDraftStore((s) => s.past)
  const future = useDraftStore((s) => s.future)
  const setPhase = useDraftStore((s) => s.setPhase)
  const pickHero = useDraftStore((s) => s.pickHero)
  const finishAssigning = useDraftStore((s) => s.finishAssigning)
  const reset = useDraftStore((s) => s.reset)
  const undo = useDraftStore((s) => s.undo)
  const redo = useDraftStore((s) => s.redo)

  // start fresh and immediately begin drafting
  useEffect(() => {
    reset()
    useDraftStore.getState().setPhase('drafting')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      if (tgt?.tagName === 'INPUT' || tgt?.tagName === 'TEXTAREA') return
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const [timerEnabled, setTimerEnabled] = useState(false)

  const action = CM_SEQUENCE[draft.step]
  // In solo mode the player always can act during drafting
  const canAct = draft.phase === 'drafting' && !!action

  const { timer, startTimer, resetTimer } = useTimer(
    draft.step,
    draft.phase,
    action?.kind ?? null,
    action?.side ?? null,
    timerEnabled && draft.phase === 'drafting',
  )

  if (isLoading || !heroes) {
    return <div className="p-6 text-zinc-400">Загрузка героев...</div>
  }

  return (
    <div className="min-h-screen p-4 max-w-[1400px] mx-auto space-y-4">
      <header className="flex items-center justify-between bg-panel border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
          >
            ← на главную
          </Link>
          <div className="font-semibold">Solo Draft</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={past.length === 0}
            className="text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed rounded px-3 py-1.5"
            title="Cmd/Ctrl+Z"
          >
            ← undo
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            className="text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed rounded px-3 py-1.5"
            title="Cmd/Ctrl+Shift+Z"
          >
            redo →
          </button>
          <button
            onClick={() => {
              if (!timerEnabled) {
                setTimerEnabled(true)
                startTimer()
              } else {
                setTimerEnabled(false)
                resetTimer()
              }
            }}
            className={`text-xs rounded px-3 py-1.5 ${
              timerEnabled
                ? 'bg-amber-700 hover:bg-amber-600'
                : 'bg-zinc-700 hover:bg-zinc-600'
            }`}
          >
            {timerEnabled ? 'таймер ON' : 'таймер OFF'}
          </button>
          <button
            onClick={() => {
              reset()
              resetTimer()
              useDraftStore.getState().setPhase('drafting')
            }}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
          >
            сброс
          </button>
        </div>
      </header>

      {/* Drafting phase */}
      {draft.phase === 'drafting' && (
        <>
          <DraftStatusBar draft={draft} mySide={null} timer={timerEnabled ? timer : null} />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <HeroPool
              heroes={heroes}
              draft={draft}
              canAct={canAct}
              onPick={pickHero}
            />
            <DraftBoard draft={draft} byId={byId} />
          </div>
        </>
      )}

      {/* Assigning phase */}
      {draft.phase === 'assigning' && (
        <>
          <DraftStatusBar draft={draft} mySide={null} timer={timerEnabled ? timer : null} />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <div className="space-y-3">
              <div className="text-sm text-zinc-400">
                Перетащи героя в нужный слот (1 — Safe carry, 2 — Mid, 3 — Off
                core, 4 — Off sup, 5 — Safe sup). Чтобы убрать — перетащи
                обратно в нижний пул.
              </div>
              <LaneAssignBoard draft={draft} byId={byId} />
              <button
                onClick={finishAssigning}
                className="w-full bg-emerald-600 hover:bg-emerald-500 rounded-lg py-3 font-semibold"
              >
                Показать вердикт
              </button>
            </div>
            <DraftBoard draft={draft} byId={byId} />
          </div>
        </>
      )}

      {/* Verdict */}
      {draft.phase === 'verdict' && (
        <div className="space-y-4">
          <Verdict byId={byId} />
          <button
            onClick={() => setPhase('assigning')}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← вернуться к распределению
          </button>
        </div>
      )}
    </div>
  )
}
