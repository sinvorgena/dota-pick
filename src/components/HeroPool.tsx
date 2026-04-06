import { useEffect, useMemo, useState } from 'react'
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

  // Global keystroke search — like the Dota client.
  // Any printable key types into the floating search; Backspace deletes; Esc clears.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      const inField =
        tgt &&
        (tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.isContentEditable)
      if (inField) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'Escape') {
        if (q) {
          e.preventDefault()
          setQ('')
        }
        return
      }
      if (e.key === 'Backspace') {
        if (q) {
          e.preventDefault()
          setQ((s) => s.slice(0, -1))
        }
        return
      }
      // single printable char (letters, digits, space, hyphen, etc.)
      if (e.key.length === 1 && /[\p{L}\p{N} \-']/u.test(e.key)) {
        e.preventDefault()
        setQ((s) => s + e.key)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [q])

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
  const matches = (h: Hero) =>
    !ql || h.localized_name.toLowerCase().includes(ql)

  const handlePick = (id: number) => {
    onPick(id)
    setQ('')
  }

  return (
    <>
      <div className="p-2">
        <div className="grid grid-cols-4 gap-8">
          {ATTR_GROUPS.map((g) => {
            const list = grouped[g.key]
            if (!list?.length) return <div key={g.key} />
            return (
              <div key={g.key} className="min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <img src={g.icon} alt={g.label} className="w-4 h-4" loading="lazy" />
                  <div
                    className={`text-[11px] font-bold uppercase tracking-wider ${g.color}`}
                  >
                    {g.label}
                  </div>
                </div>
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))' }}
                >
                  {list.map((h) => {
                    const isTaken = taken.has(h.id)
                    const isMatch = matches(h)
                    const dim = isTaken || (ql.length > 0 && !isMatch)
                    return (
                      <HeroIcon
                        key={h.id}
                        hero={h}
                        variant="portrait"
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

      {/* Floating search indicator (Dota-style) */}
      {q && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-bg/95 backdrop-blur border border-amber-500/60 rounded-full px-5 py-2 shadow-2xl flex items-center gap-3">
          <span className="text-xs uppercase text-zinc-500 tracking-wider">Поиск</span>
          <span className="text-base font-semibold text-amber-300">{q}</span>
          <span className="text-[10px] text-zinc-600">Esc — сброс</span>
        </div>
      )}
    </>
  )
}
