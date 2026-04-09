import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { customAlphabet } from 'nanoid'

const makeRoomId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

export default function Home() {
  const navigate = useNavigate()
  const [joinId, setJoinId] = useState('')

  const create = () => {
    const id = makeRoomId()
    navigate(`/room/${id}?host=1`)
  }

  const join = () => {
    const id = joinId.trim()
    if (!id) return
    navigate(`/room/${id}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-panel border border-border rounded-2xl p-8 w-full max-w-md space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">Dota 2 · Captains Draft</h1>
          <p className="text-sm text-zinc-400">
            Драфт, анализ и тренировка контрпиков.
          </p>
        </div>

        {/* Multiplayer */}
        <div className="space-y-2">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">
            Мультиплеер
          </div>
          <button
            onClick={create}
            className="w-full bg-emerald-600 hover:bg-emerald-500 transition rounded-lg py-3 font-semibold"
          >
            Создать комнату
          </button>
          <div className="flex gap-2">
            <input
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && join()}
              placeholder="ID комнаты"
              className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 outline-none focus:border-zinc-500"
            />
            <button
              onClick={join}
              className="bg-zinc-700 hover:bg-zinc-600 transition rounded-lg px-4 py-2 font-semibold text-sm"
            >
              Войти
            </button>
          </div>
        </div>

        {/* Solo modes */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">
            Одиночные режимы
          </div>
          <button
            onClick={() => navigate('/solo')}
            className="w-full bg-zinc-700 hover:bg-zinc-600 transition rounded-lg py-3 font-semibold text-left px-4"
          >
            <div>Solo Draft</div>
            <div className="text-xs text-zinc-400 font-normal">
              Полный капитанский драфт — пикай за обе стороны
            </div>
          </button>
          <button
            onClick={() => navigate('/quick-counter')}
            className="w-full bg-zinc-700 hover:bg-zinc-600 transition rounded-lg py-3 font-semibold text-left px-4"
          >
            <div>Quick Counterpick</div>
            <div className="text-xs text-zinc-400 font-normal">
              Случайный герой — выбери контрпик, проверь винрейт
            </div>
          </button>
        </div>

        {/* Tools */}
        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">
            Инструменты
          </div>
          <button
            onClick={() => navigate('/match')}
            className="w-full text-sm text-zinc-400 hover:text-zinc-200 text-left py-2"
          >
            Анализ матча · загрузи матч по ID и разбери драфт →
          </button>
          <button
            onClick={() => navigate('/sandbox')}
            className="w-full text-sm text-zinc-400 hover:text-zinc-200 text-left py-2"
          >
            Sandbox · тестовые драфты →
          </button>
        </div>
      </div>
    </div>
  )
}
