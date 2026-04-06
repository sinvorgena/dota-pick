import { useQuery } from '@tanstack/react-query'
import { fetchHeroes } from '../api/heroes'
import type { Hero } from '../types'
import { useMemo } from 'react'

export function useHeroes() {
  const q = useQuery({
    queryKey: ['heroes'],
    queryFn: fetchHeroes,
    staleTime: 1000 * 60 * 60,
  })
  const byId = useMemo<Record<number, Hero>>(() => {
    const m: Record<number, Hero> = {}
    for (const h of q.data ?? []) m[h.id] = h
    return m
  }, [q.data])
  return { ...q, byId }
}
