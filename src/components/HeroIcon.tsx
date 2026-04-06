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
  md: 'aspect-[16/9] w-full',
  lg: 'w-28 h-16',
}

export function HeroIcon({ hero, size = 'md', dim, banned, onClick, selectable, title }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? hero.localized_name}
      className={clsx(
        'relative rounded-md overflow-hidden border block group',
        sizes[size],
        'border-zinc-800',
        selectable &&
          'hover:border-amber-400 hover:scale-[1.08] hover:z-10 transition-transform duration-100 cursor-pointer shadow',
        dim && 'opacity-25 grayscale',
        !onClick && 'cursor-default',
      )}
    >
      <img
        src={heroImg(hero.shortName)}
        alt={hero.localized_name}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      {/* hover label */}
      {size !== 'sm' && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1 py-0.5 text-[9px] font-semibold text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
          {hero.localized_name}
        </div>
      )}
      {banned && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <div className="w-full h-[2px] bg-rose-500 rotate-[-15deg]" />
        </div>
      )}
    </button>
  )
}
