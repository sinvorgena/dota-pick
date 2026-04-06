import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useDraftStore } from '../store/draftStore'
import { useHeroes } from '../hooks/useHeroes'
import { MOCK_DRAFTS, buildMockDraftState } from '../lib/mockDrafts'
import { DraftBoard } from '../components/DraftBoard'
import { LaneAssign } from '../components/LaneAssign'
import { Verdict } from '../components/Verdict'

export default function Sandbox() {
  const { byId, isLoading } = useHeroes()
  const draft = useDraftStore((s) => s.draft)
  const loadDraft = useDraftStore((s) => s.loadDraft)
  const setPhase = useDraftStore((s) => s.setPhase)
  const reset = useDraftStore((s) => s.reset)

  // start clean when entering sandbox
  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (isLoading) {
    return <div className="p-6 text-zinc-400">Загрузка героев...</div>
  }

  return (
    <div className="min-h-screen p-4 max-w-7xl mx-auto space-y-4">
      <header className="flex items-center justify-between bg-panel border border-border rounded-xl px-4 py-3">
        <div>
          <Link to="/" className="text-xs text-zinc-500 hover:text-zinc-200">
            ← на главную
          </Link>
          <div className="font-semibold">Sandbox · тестовые драфты</div>
        </div>
        <button
          onClick={reset}
          className="text-xs bg-zinc-800 hover:bg-zinc-700 rounded px-3 py-1.5"
        >
          сброс
        </button>
      </header>

      <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold">Загрузить готовый драфт</div>
        <div className="grid sm:grid-cols-3 gap-2">
          {MOCK_DRAFTS.map((m, i) => (
            <button
              key={i}
              onClick={() => loadDraft(buildMockDraftState(m))}
              className="text-left bg-bg hover:bg-zinc-800 border border-border rounded p-3"
            >
              <div className="font-semibold text-sm">{m.name}</div>
              <div className="text-xs text-zinc-400 mt-1">{m.description}</div>
            </button>
          ))}
        </div>
      </div>

      {draft.phase !== 'lobby' && (
        <>
          <DraftBoard draft={draft} byId={byId} mySide={null} />

          <div className="bg-panel border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Распределение по лайнам</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setPhase('assigning')}
                  className="text-xs bg-zinc-700 hover:bg-zinc-600 rounded px-3 py-1.5"
                >
                  редактировать
                </button>
                <button
                  onClick={() => setPhase('verdict')}
                  className="text-xs bg-emerald-700 hover:bg-emerald-600 rounded px-3 py-1.5"
                >
                  показать вердикт
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <LaneAssign
                side="radiant"
                picks={draft.picks.radiant}
                byId={byId}
                assignments={draft.assignments.radiant}
                editable={draft.phase === 'assigning'}
              />
              <LaneAssign
                side="dire"
                picks={draft.picks.dire}
                byId={byId}
                assignments={draft.assignments.dire}
                editable={draft.phase === 'assigning'}
              />
            </div>
          </div>

          {draft.phase === 'verdict' && <Verdict byId={byId} />}
        </>
      )}
    </div>
  )
}
