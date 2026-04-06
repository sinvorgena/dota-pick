import { useEffect, useMemo, useRef, useState } from 'react'
import type { DraftState, Hero } from '../types'
import { HeroIcon } from './HeroIcon'

interface Props {
  heroes: Hero[]
  draft: DraftState
  canAct: boolean
  onPick: (heroId: number) => void
}

const ATTR_ICON =
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/icons'

const ATTR_GROUPS: {
  key: Hero['primary_attr']
  label: string
  color: string
  icon: string
}[] = [
  { key: 'str', label: 'Strength', color: 'text-rose-300', icon: `${ATTR_ICON}/hero_strength.png` },
  { key: 'agi', label: 'Agility', color: 'text-emerald-300', icon: `${ATTR_ICON}/hero_agility.png` },
  { key: 'int', label: 'Intelligence', color: 'text-sky-300', icon: `${ATTR_ICON}/hero_intelligence.png` },
  { key: 'all', label: 'Universal', color: 'text-amber-300', icon: `${ATTR_ICON}/hero_universal.png` },
]

export function HeroPool({ heroes, draft, canAct, onPick }: Props) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // global "/" hotkey to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      if (e.key === '/' && tgt?.tagName !== 'INPUT' && tgt?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setQ('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const taken = useMemo(() => {
    const s = new Set<number>()
    draft.picks.radiant.forEach((id) => s.add(id))
    draft.picks.dire.forEach((id) => s.add(id))
    draft.bans.radiant.forEach((id) => s.add(id))
    draft.bans.dire.forEach((id) => s.add(id))
    return s
  }, [draft])

  const grouped = useMemo(() => {
    const map: Record<Hero['primary_attr'], Hero[]> = { str: [], agi: [], int: [], all: [] }
    for (const h of heroes) map[h.primary_attr]?.push(h)
    return map
  }, [heroes])

  const ql = q.trim().toLowerCase()
  const matches = (h: Hero) => !ql || h.localized_name.toLowerCase().includes(ql)

  const handlePick = (id: number) => {
    onPick(id)
    setQ('')
  }

  return (
    <div className="space-y-3">
      <div className="bg-panel rounded-xl border border-border p-2.5 flex items-center gap-3">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск героя… (нажми / для фокуса, Esc — сбросить)"
          className="flex-1 bg-bg border border-border rounded px-3 py-2 text-sm outline-none focus:border-zinc-500"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="text-xs text-zinc-500 hover:text-zinc-200 px-2"
          >
            очистить
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {ATTR_GROUPS.map((g) => {
          const list = grouped[g.key]
          if (!list?.length) return null
          return (
            <div
              key={g.key}
              className="bg-panel border border-border rounded-xl p-3"
            >
              <div className="flex items-center gap-2 mb-2.5">
                <img
                  src={g.icon}
                  alt={g.label}
                  className="w-6 h-6"
                  loading="lazy"
                />
                <div className={`text-sm font-bold uppercase tracking-wider ${g.color}`}>
                  {g.label}
                </div>
                <div className="text-xs text-zinc-600 ml-auto">{list.length}</div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">
                {list.map((h) => {
                  const isTaken = taken.has(h.id)
                  const isMatch = matches(h)
                  const dim = isTaken || (ql.length > 0 && !isMatch)
                  return (
                    <HeroIcon
                      key={h.id}
                      hero={h}
                      dim={dim}
                      selectable={canAct && !isTaken && isMatch}
                      onClick={
                        canAct && !isTaken && isMatch ? () => handlePick(h.id) : undefined
                      }
                      title={`${h.localized_name} · power ${h.lanePower}`}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
