import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { customAlphabet } from 'nanoid'

// lowercase letters + digits only — no `_-`, so the resulting peer id
// (`<prefix>-<id>`) always passes the public PeerJS broker's validation
// regex `^[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+)*$`.
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
            Драфт 1×1 с другом. Создайте комнату и пошарьте ссылку.
          </p>
        </div>

        <button
          onClick={create}
          className="w-full bg-emerald-600 hover:bg-emerald-500 transition rounded-lg py-3 font-semibold"
        >
          Создать комнату
        </button>

        <div className="text-center text-zinc-500 text-xs">или</div>

        <div className="space-y-2">
          <input
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            placeholder="ID комнаты"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 outline-none focus:border-zinc-500"
          />
          <button
            onClick={join}
            className="w-full bg-zinc-700 hover:bg-zinc-600 transition rounded-lg py-3 font-semibold"
          >
            Войти в комнату
          </button>
        </div>

        <div className="border-t border-border pt-4">
          <button
            onClick={() => navigate('/sandbox')}
            className="w-full text-sm text-zinc-400 hover:text-zinc-200"
          >
            Sandbox · тестовые драфты без соперника →
          </button>
        </div>
      </div>
    </div>
  )
}
