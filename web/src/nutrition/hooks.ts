import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../api/client'
import { unwrap } from '../api/errors'
import type { components } from '../api/schema'
import { useMe } from '../auth/useAuth'

// Every nutrition key starts with 'nutrition'; a write invalidates the whole prefix (a new entry
// changes the day's list, the day's totals and the week).
const NUTRITION = 'nutrition'

export type Food = components['schemas']['Food']
export type FoodInput = components['schemas']['FoodCreateRequest']
export type Consumption = components['schemas']['Consumption']
export type ConsumptionInput = components['schemas']['ConsumptionCreateRequest']
export type DaySummary = components['schemas']['WeeklyNutritionSummary']

function useInvalidateNutrition() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: [NUTRITION] })
}

// --- foods ------------------------------------------------------------------------------------

/** Foods of the household, optionally only those whose name contains `search`. */
export function useFoods(search = '', pageSize = 100) {
  const query = { page_size: pageSize, ...(search ? { search } : {}) }
  return useQuery({
    queryKey: [NUTRITION, 'foods', query],
    queryFn: async () =>
      unwrap(await api.GET('/api/nutrition/foods/', { params: { query } })).results,
    placeholderData: keepPreviousData,
  })
}

export function useFood(id: number) {
  return useQuery({
    queryKey: [NUTRITION, 'food', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/nutrition/foods/{id}/', { params: { path: { id } } })),
  })
}

export function useCreateFood() {
  const invalidate = useInvalidateNutrition()
  return useMutation({
    mutationFn: async (body: FoodInput) =>
      unwrap(await api.POST('/api/nutrition/foods/', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateFood(id: number) {
  const invalidate = useInvalidateNutrition()
  return useMutation({
    mutationFn: async (body: FoodInput) =>
      unwrap(await api.PATCH('/api/nutrition/foods/{id}/', { params: { path: { id } }, body })),
    onSuccess: invalidate,
  })
}

export function useDeleteFood(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/api/nutrition/foods/{id}/', { params: { path: { id } } })),
    // Don't refetch now: the open edit page would ask for the deleted food (404).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [NUTRITION], refetchType: 'none' }),
  })
}

// --- diary ------------------------------------------------------------------------------------

/**
 * The logged-in member's entries of one day. Entries are visible to the whole household in the
 * API (`?user=` filters), but the diary is personal, so it always asks for the own ones.
 */
export function useDayEntries(date: string) {
  const { data: me } = useMe()
  const query = { date, user: me?.id, page_size: 100 }
  return useQuery({
    queryKey: [NUTRITION, 'entries', query],
    queryFn: async () =>
      unwrap(await api.GET('/api/nutrition/consumptions/', { params: { query } })).results,
    enabled: me !== undefined,
    placeholderData: keepPreviousData,
  })
}

/** Monday-Sunday of the week with `date`: totals per day for the whole household and per member. */
export function useWeek(date: string) {
  return useQuery({
    queryKey: [NUTRITION, 'week', date],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/nutrition/consumptions/weekly-summary/', {
          params: { query: { date } },
        }),
      ),
    placeholderData: keepPreviousData,
  })
}

export function useCreateEntry() {
  const invalidate = useInvalidateNutrition()
  return useMutation({
    mutationFn: async (body: ConsumptionInput) =>
      unwrap(await api.POST('/api/nutrition/consumptions/', { body })),
    onSuccess: invalidate,
  })
}

// Take the id when called: one diary page has many entries, one hook instance serves them all.
export function useUpdateEntry() {
  const invalidate = useInvalidateNutrition()
  return useMutation({
    mutationFn: async ({ id, quantity_grams }: { id: number; quantity_grams: number }) =>
      unwrap(
        await api.PATCH('/api/nutrition/consumptions/{id}/', {
          params: { path: { id } },
          body: { quantity_grams },
        }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteEntry() {
  const invalidate = useInvalidateNutrition()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(await api.DELETE('/api/nutrition/consumptions/{id}/', { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}
