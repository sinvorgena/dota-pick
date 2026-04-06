import { useQueries, useQuery } from '@tanstack/react-query'
import { fetchHeroMatchups, findSampleMatches, type HeroMatchup } from '../api/matchups'

export function useHeroMatchups(heroIds: number[]) {
  const queries = useQueries({
    queries: heroIds.map((id) => ({
      queryKey: ['matchups', id],
      queryFn: () => fetchHeroMatchups(id),
      staleTime: 1000 * 60 * 60 * 6, // 6h
      enabled: id > 0,
    })),
  })
  const isLoading = queries.some((q) => q.isLoading)
  const error = queries.find((q) => q.error)?.error as Error | undefined

  // map<heroId, HeroMatchup[]>
  const data: Record<number, HeroMatchup[]> = {}
  heroIds.forEach((id, i) => {
    const d = queries[i].data
    if (d) data[id] = d
  })

  return { data, isLoading, error }
}

export function useSampleMatches(radiantIds: number[], direIds: number[]) {
  const key = ['samples', radiantIds.slice().sort().join(','), direIds.slice().sort().join(',')]
  return useQuery({
    queryKey: key,
    queryFn: () => findSampleMatches(radiantIds, direIds, 5),
    staleTime: 1000 * 60 * 30,
    enabled: radiantIds.length > 0 || direIds.length > 0,
    retry: 1,
  })
}
