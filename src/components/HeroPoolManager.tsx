import { useMemo, useState } from 'react'
import type { Hero } from '../types'
import { HeroIcon } from './HeroIcon'
import { useHeroPoolStore } from '../store/heroPoolStore'
import clsx from 'clsx'

const POSITIONS = [
  { pos: 1, label: 'Carry', short: '1' },
  { pos: 2, label: 'Mid', short: '2' },
  { pos: 3, label: 'Offlane', short: '3' },
  { pos: 4, label: 'Soft Sup', short: '4' },
  { pos: 5, label: 'Hard Sup', short: '5' },
]

const ATTR_GROUPS: {
  key: Hero['primary_attr']
  label: string
  color: string
}[] = [
  { key: 'str', label: 'STR', color: 'text-rose-300' },
  { key: 'agi', label: 'AGI', color: 'text-emerald-300' },
  { key: 'int', label: 'INT', color: 'text-sky-300' },
  { key: 'all', label: 'UNI', color: 'text-amber-300' },
]

interface Props {
  heroes: Hero[]
  byId: Record<number, Hero>
  onClose: () => void
}

export function HeroPoolManager({ heroes, byId, onClose }: Props) {
  const pool = useHeroPoolStore((s) => s.pool)
  const toggleHero = useHeroPoolStore((s) => s.toggleHero)
  const clearPos = useHeroPoolStore((s) => s.clearPos)
  const clearAll = useHeroPoolStore((s) => s.clearAll)

  const [activePos, setActivePos] = useState<number>(1)

  const activeHeroes = useMemo(() => new Set(pool[activePos] ?? []), [pool, activePos])

  const grouped = useMemo(() => {
    const map: Record<Hero['primary_attr'], Hero[]> = { str: [], agi: [], int: [], all: [] }
    for (const h of heroes) map[h.primary_attr]?.push(h)
    return map
  }, [heroes])

  // Count heroes per position
  const counts = useMemo(() => {
    const c: Record<number, number> = {}
    for (const p of POSITIONS) c[p.pos] = (pool[p.pos] ?? []).length
    return c
  }, [pool])

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-8 px-4">
      <div className="bg-panel border border-border rounded-xl w-full max-w-[1200px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="font-semibold">Мой пул героев</div>
            <span className="text-xs text-zinc-500">
              Выбери героев для каждой позиции — они будут подсвечены при драфте
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearAll}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1"
            >
              очистить всё
            </button>
            <button
              onClick={onClose}
              className="text-xs bg-zinc-700 hover:bg-zinc-600 rounded px-3 py-1.5"
            >
              Готово ✓
            </button>
          </div>
        </div>

        {/* Position tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {POSITIONS.map((p) => (
            <button
              key={p.pos}
              onClick={() => setActivePos(p.pos)}
              className={clsx(
                'px-4 py-2 rounded-t-lg text-sm font-medium transition relative',
                activePos === p.pos
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
              )}
            >
              {p.pos}. {p.label}
              {counts[p.pos] > 0 && (
                <span
                  className={clsx(
                    'ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                    activePos === p.pos
                      ? 'bg-amber-600 text-white'
                      : 'bg-zinc-700 text-zinc-400',
                  )}
                >
                  {counts[p.pos]}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => clearPos(activePos)}
            className="ml-auto text-xs text-zinc-600 hover:text-zinc-400 px-2 self-center"
          >
            очистить позицию
          </button>
        </div>

        {/* Selected heroes for this position */}
        <div className="px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-h-[48px]">
            {(pool[activePos] ?? []).length === 0 ? (
              <span className="text-xs text-zinc-600 italic">
                Нажми на героя чтобы добавить в пул позиции {activePos}
              </span>
            ) : (
              (pool[activePos] ?? []).map((hid) => {
                const hero = byId[hid]
                if (!hero) return null
                return (
                  <div
                    key={hid}
                    className="w-10 shrink-0 relative group cursor-pointer"
                    onClick={() => toggleHero(activePos, hid)}
                    title={`${hero.localized_name} — кликни чтобы убрать`}
                  >
                    <HeroIcon hero={hero} variant="portrait" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-bold text-rose-400">
                      ✕
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Hero grid */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-4 gap-6">
            {ATTR_GROUPS.map((g) => {
              const list = grouped[g.key]
              if (!list?.length) return <div key={g.key} />
              return (
                <div key={g.key} className="min-w-0">
                  <div
                    className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${g.color}`}
                  >
                    {g.label}
                  </div>
                  <div
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))' }}
                  >
                    {list.map((h) => {
                      const isInPool = activeHeroes.has(h.id)
                      return (
                        <div
                          key={h.id}
                          className={clsx(
                            'rounded transition-all cursor-pointer',
                            isInPool && 'ring-2 ring-amber-400 scale-[1.05]',
                          )}
                          onClick={() => toggleHero(activePos, h.id)}
                          title={h.localized_name}
                        >
                          <HeroIcon
                            hero={h}
                            variant="portrait"
                            selectable
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
