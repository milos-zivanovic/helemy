import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '../api/client'
import { unwrap } from '../api/errors'
import { fileFormData } from '../lib/formData'
import type { components } from '../api/schema'

// Same idea as the finances: every fitness key starts with 'fitness', and a write invalidates the
// whole prefix (a new set changes the training, its totals, the list and the exercise's history).
export const FITNESS = 'fitness'

export type MuscleGroup = components['schemas']['MuscleGroupDetail']
export type ExerciseListItem = components['schemas']['ExerciseList']
export type ExerciseInput = components['schemas']['ExerciseRequest']
export type Training = components['schemas']['Training']
export type TrainingItem = components['schemas']['TrainingItem']
export type TrainingSet = components['schemas']['TrainingSet']
export type TrainingInput = components['schemas']['PatchedTrainingUpdateRequest']
export type AppendSetInput = components['schemas']['AppendSetRequest']
export type SetInput = components['schemas']['PatchedTrainingSetRequest']
export type HistoryEntry = components['schemas']['ExerciseHistoryEntry']

function useInvalidateFitness() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: [FITNESS] })
}

// Deletes only mark as stale: the open page would otherwise refetch the deleted object (404).
function useMarkFitnessStale() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: [FITNESS], refetchType: 'none' })
}

// --- muscle groups and exercises --------------------------------------------------------------

/** The global muscle groups (8 by default, edited in the admin). */
export function useMuscleGroups() {
  return useQuery({
    queryKey: [FITNESS, 'muscle-groups'],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/fitness/muscle-groups/', { params: { query: { page_size: 100 } } }),
      ).results,
    staleTime: 30 * 60_000, // reference data, changes only in the admin
  })
}

/** All exercises of the household (one page of 100), optionally only of some muscle groups. */
export function useExercises(muscleGroupIds: number[] = []) {
  const query = muscleGroupIds.length
    ? { page_size: 100, muscle_group__in: muscleGroupIds }
    : { page_size: 100 }
  return useQuery({
    queryKey: [FITNESS, 'exercises', query],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/fitness/exercises/', {
          params: { query },
          // django-filter's `__in` wants one comma-separated value (?muscle_group__in=1,2). By
          // default openapi-fetch repeats the key (?muscle_group__in=1&muscle_group__in=2), and
          // Django then reads only the last one, so only the last muscle group's exercises came.
          querySerializer: { array: { style: 'form', explode: false } },
        }),
      ).results,
  })
}

export function useExercise(id: number) {
  return useQuery({
    queryKey: [FITNESS, 'exercise', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/fitness/exercises/{id}/', { params: { path: { id } } })),
  })
}

/** Every training with this exercise, oldest first (optionally only one member's). */
export function useExerciseHistory(id: number, userId?: number) {
  const query = userId ? { user: userId } : {}
  return useQuery({
    queryKey: [FITNESS, 'exercise-history', id, query],
    queryFn: async () =>
      unwrap(
        await api.GET('/api/fitness/exercises/{id}/history/', {
          params: { path: { id }, query },
        }),
      ),
  })
}

export function useCreateExercise() {
  const invalidate = useInvalidateFitness()
  return useMutation({
    mutationFn: async (body: ExerciseInput) =>
      unwrap(await api.POST('/api/fitness/exercises/', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateExercise(id: number) {
  const invalidate = useInvalidateFitness()
  return useMutation({
    mutationFn: async (body: ExerciseInput) =>
      unwrap(await api.PATCH('/api/fitness/exercises/{id}/', { params: { path: { id } }, body })),
    onSuccess: invalidate,
  })
}

/** Upload (the cropped square, as a Blob) or remove the exercise's picture. */
export function useExerciseImage(id: number) {
  const invalidate = useInvalidateFitness()
  const params = { path: { id } }
  const upload = useMutation({
    mutationFn: async (blob: Blob) =>
      unwrap(
        await api.PUT('/api/fitness/exercises/{id}/image/', {
          params,
          // The file is a string ("binary") in the schema; the real body is multipart/form-data.
          body: { image: '' },
          bodySerializer: () => fileFormData('image', blob),
        }),
      ),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/api/fitness/exercises/{id}/image/', { params })),
    onSuccess: invalidate,
  })
  return { upload, remove }
}

export function useDeleteExercise(id: number) {
  const markStale = useMarkFitnessStale()
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/api/fitness/exercises/{id}/', { params: { path: { id } } })),
    onSuccess: markStale,
  })
}

// --- trainings --------------------------------------------------------------------------------

/** Trainings, newest first, 20 at a time: each fetchNextPage() appends the next page. */
export function useTrainings() {
  return useInfiniteQuery({
    queryKey: [FITNESS, 'trainings', 'infinite'],
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.GET('/api/fitness/trainings/', {
          params: { query: { page: pageParam, page_size: 20 } },
        }),
      ),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.current_page < last.total_pages ? last.current_page + 1 : undefined,
  })
}

export function useTraining(id: number) {
  return useQuery({
    queryKey: [FITNESS, 'training', id],
    queryFn: async () =>
      unwrap(await api.GET('/api/fitness/trainings/{id}/', { params: { path: { id } } })),
  })
}

export function useCreateTraining() {
  const invalidate = useInvalidateFitness()
  return useMutation({
    mutationFn: async (body: TrainingInput) =>
      unwrap(await api.POST('/api/fitness/trainings/', { body })),
    onSuccess: invalidate,
  })
}

export function useUpdateTraining(id: number) {
  const invalidate = useInvalidateFitness()
  return useMutation({
    mutationFn: async (body: TrainingInput) =>
      unwrap(await api.PATCH('/api/fitness/trainings/{id}/', { params: { path: { id } }, body })),
    onSuccess: invalidate,
  })
}

export function useDeleteTraining(id: number) {
  const markStale = useMarkFitnessStale()
  return useMutation({
    mutationFn: async () =>
      unwrap(await api.DELETE('/api/fitness/trainings/{id}/', { params: { path: { id } } })),
    onSuccess: markStale,
  })
}

// --- sets and exercises inside a training -----------------------------------------------------

/** Next set of an exercise in a training (the API creates the exercise's item on its first set). */
export function useAppendSet(trainingId: number) {
  const invalidate = useInvalidateFitness()
  return useMutation({
    mutationFn: async (body: AppendSetInput) =>
      unwrap(
        await api.POST('/api/fitness/trainings/{id}/sets/', {
          params: { path: { id: trainingId } },
          body,
        }),
      ),
    onSuccess: invalidate,
  })
}

// These three take the id when called (mutate({ id, ... })), because one training page shows many
// sets and items: one hook instance serves all of them.
export function useUpdateSet() {
  const invalidate = useInvalidateFitness()
  return useMutation({
    mutationFn: async ({ id, ...body }: SetInput & { id: number }) =>
      unwrap(
        await api.PATCH('/api/fitness/training-sets/{id}/', { params: { path: { id } }, body }),
      ),
    onSuccess: invalidate,
  })
}

export function useDeleteSet() {
  const invalidate = useInvalidateFitness()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(await api.DELETE('/api/fitness/training-sets/{id}/', { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}

export function useDeleteTrainingItem() {
  const invalidate = useInvalidateFitness()
  return useMutation({
    mutationFn: async (id: number) =>
      unwrap(await api.DELETE('/api/fitness/training-items/{id}/', { params: { path: { id } } })),
    onSuccess: invalidate,
  })
}

/**
 * For the start page: the newest training and how many trainings there are since `fromDate`.
 * Two one-row pages: `count` of a paginated list is the number of all matching rows.
 */
export function useTrainingStats(fromDate: string) {
  return useQuery({
    queryKey: [FITNESS, 'trainings', 'stats', fromDate],
    queryFn: async () => {
      const [latest, since] = await Promise.all([
        api.GET('/api/fitness/trainings/', { params: { query: { page_size: 1 } } }),
        api.GET('/api/fitness/trainings/', {
          params: { query: { from_date: fromDate, page_size: 1 } },
        }),
      ])
      return { last: unwrap(latest).results[0] ?? null, countSince: unwrap(since).count }
    },
  })
}
