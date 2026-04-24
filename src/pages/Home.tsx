import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { customAlphabet } from 'nanoid'

const makeRoomId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

interface MenuCardProps {
  title: string
  description: string
  onClick: () => void
  accent?: 'emerald' | 'sky' | 'zinc'
}

function MenuCard({ title, description, onClick, accent = 'zinc' }: MenuCardProps) {
  const accentRing =
    accent === 'emerald'
      ? 'hover:border-emerald-500/60 hover:bg-emerald-500/5'
      : accent === 'sky'
        ? 'hover:border-sky-500/60 hover:bg-sky-500/5'
        : 'hover:border-zinc-500 hover:bg-zinc-800/40'
  return (
    <button
      onClick={onClick}
      className={`group w-full text-left bg-bg border border-border rounded-xl px-4 py-3 transition ${accentRing}`}
    >
      <div className="font-semibold text-zinc-100 group-hover:text-white">
        {title}
      </div>
      <div className="text-xs text-zinc-400 mt-0.5">{description}</div>
    </button>
  )
}

function Section({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
        {label}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

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
    <div className="min-h-screen flex items-center justify-center p-3 sm:p-6">
      <div className="bg-panel border border-border rounded-2xl p-4 sm:p-8 w-full max-w-xl space-y-5 sm:space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-1">Dota 2 · Captains Draft</h1>
          <p className="text-sm text-zinc-400">
            Драфт, анализ и тренировка контрпиков.
          </p>
        </div>

        <Section label="Анализ">
          <MenuCard
            title="Анализ матча"
            description="Загрузи матч по ID или ссылке — разбор драфта и ролей"
            onClick={() => navigate('/match')}
            accent="sky"
          />
          <MenuCard
            title="Матчи друзей"
            description="Календарь игр нескольких игроков — выбери матч для анализа"
            onClick={() => navigate('/friends')}
            accent="sky"
          />
          <MenuCard
            title="Sandbox"
            description="Тестовые драфты и сценарии"
            onClick={() => navigate('/sandbox')}
          />
        </Section>

        <Section label="Одиночные режимы">
          <MenuCard
            title="Solo Draft"
            description="Полный капитанский драфт — пикай за обе стороны"
            onClick={() => navigate('/solo')}
          />
          <MenuCard
            title="Quick Counterpick"
            description="Случайный герой — выбери контрпик, проверь винрейт"
            onClick={() => navigate('/quick-counter')}
          />
        </Section>

        <Section label="Мультиплеер">
          <button
            onClick={create}
            className="w-full bg-emerald-600 hover:bg-emerald-500 transition rounded-xl py-3 font-semibold"
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
        </Section>
      </div>
    </div>
  )
}
