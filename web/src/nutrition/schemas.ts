import type { TFunction } from 'i18next'
import { z } from 'zod'

// Whole numbers, like the API's integer fields. `message` comes already translated: the typed t()
// only accepts keys it knows, so a key can't be passed around as a plain string.
const wholeNumber = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, message)
    .transform(Number)
    .refine((value) => value >= min && value <= max, message)

export const gramsField = (t: TFunction) => wholeNumber(1, 10000, t('nutrition.validation.grams'))

export const foodSchema = (t: TFunction) =>
  z.object({
    name: z
      .string()
      .trim()
      .min(1, t('validation.required'))
      .max(200, t('validation.maxLength', { max: 200 })),
    calories: wholeNumber(0, 900, t('nutrition.validation.calories')),
    protein: wholeNumber(0, 100, t('nutrition.validation.macro')),
    carbs: wholeNumber(0, 100, t('nutrition.validation.macro')),
    fat: wholeNumber(0, 100, t('nutrition.validation.macro')),
    description: z
      .string()
      .trim()
      .max(255, t('validation.maxLength', { max: 255 })),
  })
export type FoodFormValues = z.input<ReturnType<typeof foodSchema>>

export const entrySchema = (t: TFunction) =>
  z.object({
    // Set from code when a food is picked in the search box (not typed).
    food_id: z.string().min(1, t('nutrition.validation.pickFood')).transform(Number),
    quantity_grams: gramsField(t),
  })
export type EntryFormValues = z.input<ReturnType<typeof entrySchema>>
