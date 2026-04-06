import type { Hero } from '../types'
import { heroImg } from '../types'
import clsx from 'clsx'

interface Props {
  hero: Hero
  size?: 'sm' | 'md' | 'lg'
  dim?: boolean
  banned?: boolean
  onClick?: () => void
  selectable?: boolean
  title?: string
}

const sizes = {
  sm: 'w-12 h-7',
  md: 'w-20 h-12',
  lg: 'w-28 h-16',
}

export function HeroIcon({ hero, size = 'md', dim, banned, onClick, selectable, title }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? hero.localized_name}
      className={clsx(
        'relative rounded overflow-hidden border border-border block',
        sizes[size],
        selectable && 'hover:border-zinc-300 hover:scale-105 transition',
        dim && 'opacity-30 grayscale',
        !onClick && 'cursor-default',
      )}
    >
      <img
        src={heroImg(hero.shortName)}
        alt={hero.localized_name}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      {banned && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <div className="w-full h-[2px] bg-rose-500 rotate-[-15deg]" />
        </div>
      )}
    </button>
  )
}
