import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useDraftStore } from '../store/draftStore'
import { useHeroPoolStore } from '../store/heroPoolStore'
import { useRoom } from '../hooks/useRoom'
import { useHeroes } from '../hooks/useHeroes'
import { CM_SEQUENCE, type Side } from '../types'
import { useTimer } from '../hooks/useTimer'
import { useHints } from '../hooks/useHints'
import { DraftBoard } from '../components/DraftBoard'
import { DraftStatusBar } from '../components/DraftStatusBar'
import { HeroPool } from '../components/HeroPool'
import { HeroPoolManager } from '../components/HeroPoolManager'
import { LaneAssignBoard } from '../components/LaneAssign'
import { Verdict } from '../components/Verdict'

export default function Room() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const isHost = params.get('host') === '1'

  const { data: heroes, byId, isLoading } = useHeroes()

  // Reset store when entering a new room so stale side/opponent state
  // from a previous session doesn't leak (fixes missing side-picker bug).
  const reset = useDraftStore((s) => s.reset)
  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const { status, error, sendHello } = useRoom(id, isHost)

  const draft = useDraftStore((s) => s.draft)
  const past = useDraftStore((s) => s.past)
  const future = useDraftStore((s) => s.future)
  const mySide = useDraftStore((s) => s.mySide)
  const setMySide = useDraftStore((s) => s.setMySide)
  const opponentReady = useDraftStore((s) => s.opponentReady)
  const setPhase = useDraftStore((s) => s.setPhase)
  const pickHero = useDraftStore((s) => s.pickHero)
  const finishAssigning = useDraftStore((s) => s.finishAssigning)
  const undo = useDraftStore((s) => s.undo)
  const redo = useDraftStore((s) => s.redo)

  // copy share link
  const shareUrl = useMemo(() => `${window.location.origin}/room/${id}`, [id])
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // when both connected and side chosen, start drafting
  useEffect(() => {
    if (opponentReady && mySide && draft.phase === 'lobby') {
      setPhase('drafting')
    }
  }, [opponentReady, mySide, draft.phase, setPhase])

  // keyboard shortcuts: cmd/ctrl+Z undo, cmd/ctrl+shift+Z redo
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

  const chooseSide = (s: Side) => {
    setMySide(s)
    sendHello(s)
  }

  const action = CM_SEQUENCE[draft.step]
  const canAct =
    draft.phase === 'drafting' && !!action && !!mySide && action.side === mySide

  // Pro-match style timer — starts when both players connect and draft begins
  const { timer, startTimer } = useTimer(
    draft.step,
    draft.phase,
    action?.kind ?? null,
    action?.side ?? null,
    draft.phase === 'drafting',
  )

  // Start timer when drafting begins
  useEffect(() => {
    if (draft.phase === 'drafting' && !timer.running && opponentReady) {
      startTimer()
    }
  }, [draft.phase, timer.running, opponentReady, startTimer])

  // Hint system
  const { hints, hintActive, toggleHint, isBan, hintLoading } = useHints(draft, mySide)

  // Hero pool
  const heroPool = useHeroPoolStore((s) => s.pool)
  const [showPoolManager, setShowPoolManager] = useState(false)

  if (isLoading || !heroes) {
    return <div className="p-6 text-zinc-400">Загрузка героев...</div>
  }

  // Side picker is only shown to the host. Guest auto-receives the opposite
  // side via the 'hello' message in useRoom hook.
  const showSidePicker = !mySide && isHost

  return (
    <div className="min-h-screen p-4 max-w-[1400px] mx-auto space-y-4">
      <header className="flex items-center justify-between bg-panel border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
            title="на главную"
          >
            ← на главную
          </Link>
          <div>
            <div className="text-xs text-zinc-500">Комната</div>
            <div className="font-mono text-sm">{id}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-1 rounded ${
              status === 'connected'
                ? 'bg-emerald-800/50 text-emerald-300'
                : status === 'waiting'
                  ? 'bg-amber-800/50 text-amber-300'
                  : status === 'error'
                    ? 'bg-rose-800/50 text-rose-300'
                    : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {status}
            {error && `: ${error}`}
          </span>
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
            onClick={toggleHint}
            disabled={draft.phase !== 'drafting'}
            className={`text-xs rounded px-3 py-1.5 disabled:opacity-30 disabled:cursor-not-allowed ${
              hintActive
                ? 'bg-amber-700 hover:bg-amber-600 text-white'
                : 'bg-zinc-700 hover:bg-zinc-600'
            }`}
            title="Подсказка: показывает рекомендуемые пики/баны"
          >
            {hintLoading ? '...' : hintActive ? '💡 подсказка ON' : '💡 подсказка'}
          </button>
          <button
            onClick={() => setShowPoolManager(true)}
            className="text-xs bg-zinc-700 hover:bg-zinc-600 rounded px-3 py-1.5"
            title="Настроить пул героев по позициям"
          >
            🎯 пул
          </button>
          <button
            onClick={copy}
            className="text-xs bg-zinc-700 hover:bg-zinc-600 rounded px-3 py-1.5"
          >
            {copied ? 'скопировано ✓' : 'ссылка'}
          </button>
          <button
            onClick={reset}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
          >
            сброс
          </button>
        </div>
      </header>

      {/* Side picker — host only */}
      {showSidePicker && (
        <div className="bg-panel border border-border rounded-xl p-6 text-center space-y-4">
          <div className="text-lg font-semibold">Выбери сторону</div>
          {!opponentReady && (
            <div className="text-sm text-zinc-500">
              Жду подключения второго игрока (он автоматически встанет на другую
              сторону)
            </div>
          )}
          <div className="flex justify-center gap-3">
            <button
              onClick={() => chooseSide('radiant')}
              className="px-6 py-3 bg-emerald-700 hover:bg-emerald-600 rounded-lg font-semibold"
            >
              Radiant
            </button>
            <button
              onClick={() => chooseSide('dire')}
              className="px-6 py-3 bg-rose-700 hover:bg-rose-600 rounded-lg font-semibold"
            >
              Dire
            </button>
          </div>
        </div>
      )}

      {/* Guest waiting for host's side selection */}
      {!mySide && !isHost && (
        <div className="bg-panel border border-border rounded-xl p-6 text-center text-sm text-zinc-400">
          Жду пока хост выберет сторону...
        </div>
      )}

      {mySide && (
        <div className="bg-panel border border-border rounded-xl p-3 text-center text-sm">
          Ты играешь за{' '}
          <span
            className={
              mySide === 'radiant'
                ? 'text-emerald-400 font-semibold'
                : 'text-rose-400 font-semibold'
            }
          >
            {mySide === 'radiant' ? 'Radiant' : 'Dire'}
          </span>
          {!opponentReady && <span className="text-zinc-500"> · ждём соперника</span>}
        </div>
      )}

      {/* Drafting phase */}
      {(draft.phase === 'drafting' || draft.phase === 'lobby') && mySide && (
        <>
          <DraftStatusBar draft={draft} mySide={mySide} timer={timer} />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <div>
              {draft.phase === 'drafting' && (
                <HeroPool
                  heroes={heroes}
                  draft={draft}
                  canAct={canAct}
                  onPick={pickHero}
                  hints={hintActive ? hints : null}
                  isBan={isBan}
                  heroPool={heroPool}
                />
              )}
            </div>
            <DraftBoard draft={draft} byId={byId} />
          </div>
        </>
      )}

      {/* Assigning phase */}
      {draft.phase === 'assigning' && (
        <>
          <DraftStatusBar draft={draft} mySide={mySide} timer={timer} />
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

      {/* Hero pool manager modal */}
      {showPoolManager && (
        <HeroPoolManager
          heroes={heroes}
          byId={byId}
          onClose={() => setShowPoolManager(false)}
        />
      )}
    </div>
  )
}
