import type { Hero } from '../types'
import { heroImg, heroPortrait } from '../types'
import clsx from 'clsx'

interface Props {
  hero: Hero
  variant?: 'landscape' | 'portrait'
  dim?: boolean
  banned?: boolean
  onClick?: () => void
  selectable?: boolean
  title?: string
}

export function HeroIcon({
  hero,
  variant = 'landscape',
  dim,
  banned,
  onClick,
  selectable,
  title,
}: Props) {
  const src = variant === 'portrait' ? heroPortrait(hero.shortName) : heroImg(hero.shortName)
  const aspect = variant === 'portrait' ? 'aspect-[71/94]' : 'aspect-[16/9]'
  const isPortrait = variant === 'portrait'

  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? hero.localized_name}
      className={clsx(
        'relative w-full overflow-hidden block group',
        'transition-[opacity,filter,transform] duration-200 ease-out',
        aspect,
        !isPortrait && 'rounded-md border border-zinc-800',
        selectable &&
          (isPortrait
            ? 'hover:scale-[1.08] hover:z-10 cursor-pointer'
            : 'hover:border-amber-400 hover:scale-[1.08] hover:z-10 cursor-pointer shadow'),
        dim && 'opacity-25 grayscale',
        !onClick && 'cursor-default',
      )}
    >
      <img
        src={src}
        alt={hero.localized_name}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-1 py-0.5 text-[9px] font-semibold text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
        {hero.localized_name}
      </div>
      {banned && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <div className="w-full h-[2px] bg-rose-500 rotate-[-15deg]" />
        </div>
      )}
    </button>
  )
}
