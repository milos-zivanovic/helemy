import type { TFunction } from 'i18next'
import { z } from 'zod'

// Weight in kg: empty (bodyweight, e.g. pull-ups) or 0-9999.99 with up to two decimals; "82,5" works.
// The API gets a decimal string or null.
export const weightField = (t: TFunction) =>
  z
    .string()
    .trim()
    .transform((value) => value.replace(',', '.'))
    .pipe(z.string().regex(/^(\d{1,4}(\.\d{1,2})?)?$/, t('fitness.validation.weight')))
    .transform((value) => (value === '' ? null : Number(value).toFixed(2)))

export const repsField = (t: TFunction) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, t('fitness.validation.reps'))
    .transform(Number)
    .refine((value) => value >= 1, t('fitness.validation.reps'))

export const setSchema = (t: TFunction) => z.object({ weight: weightField(t), reps: repsField(t) })
export type SetFormValues = z.input<ReturnType<typeof setSchema>>

/** A set of an exercise that may not be in the training yet (the "add exercise" form). */
export const newExerciseSetSchema = (t: TFunction) =>
  setSchema(t).extend({
    exercise_id: z.string().min(1, t('validation.required')).transform(Number),
  })
export type NewExerciseSetFormValues = z.input<ReturnType<typeof newExerciseSetSchema>>

export const trainingSchema = (t: TFunction) =>
  z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('validation.required')),
    name: z
      .string()
      .trim()
      .max(100, t('validation.maxLength', { max: 100 })),
    notes: z.string().trim(),
    // Checkboxes registered under one name give an array of the checked values (strings).
    muscle_group_ids: z.array(z.string()).transform((ids) => ids.map(Number)),
  })
export type TrainingFormValues = z.input<ReturnType<typeof trainingSchema>>

export const exerciseSchema = (t: TFunction) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t('validation.required'))
      .max(100, t('validation.maxLength', { max: 100 })),
    // '' = no muscle group (null for the API)
    muscle_group_id: z.string().transform((value) => (value === '' ? null : Number(value))),
    description: z.string().trim(),
  })
export type ExerciseFormValues = z.input<ReturnType<typeof exerciseSchema>>
