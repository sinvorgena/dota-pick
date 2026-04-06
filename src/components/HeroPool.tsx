import { useEffect, useMemo, useRef, useState } from 'react'
import type { DraftState, Hero } from '../types'
import { HeroIcon } from './HeroIcon'

interface Props {
  heroes: Hero[]
  draft: DraftState
  canAct: boolean
  onPick: (heroId: number) => void
}

const ATTR_GROUPS: { key: Hero['primary_attr']; label: string; color: string }[] = [
  { key: 'str', label: 'Strength', color: 'text-rose-400' },
  { key: 'agi', label: 'Agility', color: 'text-emerald-400' },
  { key: 'int', label: 'Intelligence', color: 'text-sky-400' },
  { key: 'all', label: 'Universal', color: 'text-amber-400' },
]

export function HeroPool({ heroes, draft, canAct, onPick }: Props) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // global "/" hotkey to focus search (like Dota client behavior)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
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
    const map: Record<Hero['primary_attr'], Hero[]> = {
      str: [],
      agi: [],
      int: [],
      all: [],
    }
    for (const h of heroes) map[h.primary_attr]?.push(h)
    return map
  }, [heroes])

  const ql = q.trim().toLowerCase()
  const matches = (h: Hero) => !ql || h.localized_name.toLowerCase().includes(ql)

  const handlePick = (id: number) => {
    onPick(id)
    setQ('') // reset search after pick (Dota-style)
  }

  return (
    <div className="bg-panel rounded-xl border border-border p-3 space-y-3">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск героя... (нажми / для фокуса)"
          className="flex-1 bg-bg border border-border rounded px-3 py-1.5 text-sm outline-none focus:border-zinc-500"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="text-xs text-zinc-500 hover:text-zinc-200"
          >
            очистить
          </button>
        )}
      </div>

      <div className="space-y-3">
        {ATTR_GROUPS.map((g) => {
          const list = grouped[g.key]
          if (!list?.length) return null
          return (
            <div key={g.key}>
              <div className={`text-xs font-bold uppercase tracking-wider mb-1.5 ${g.color}`}>
                {g.label}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
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
                        canAct && !isTaken && isMatch
                          ? () => handlePick(h.id)
                          : undefined
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
