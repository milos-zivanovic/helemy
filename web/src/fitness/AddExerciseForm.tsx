import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { showMutationError } from '../api/errors'
import { useMe } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'
import { useFormatters } from '../i18n/format'
import { type Training, useAppendSet, useExercises } from './hooks'
import { newExerciseSetSchema } from './schemas'

const EMPTY = { exercise_id: '', weight: '', reps: '' }

/**
 * Adds an exercise to the training together with its first set (the API has no "empty" exercise:
 * an exercise appears in a training with its first set). Offers only exercises of the training's
 * muscle groups (the API enforces it too) that aren't in the training yet.
 */
export function AddExerciseForm({ training }: { training: Training }) {
  const { t } = useTranslation()
  const exercises = useExercises(training.muscle_groups.map((group) => group.id))
  const append = useAppendSet(training.id)
  const schema = useMemo(() => newExerciseSetSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: EMPTY })
  const { unitLabel } = useFormatters()
  const { data: me } = useMe()
  // The weight is in the chosen exercise's unit; before one is chosen, the user's own.
  const exerciseId = useWatch({ control, name: 'exercise_id' })
  const chosen = exercises.data?.find((exercise) => String(exercise.id) === exerciseId)
  const unit = chosen?.weight_unit ?? me?.weight_unit ?? 'kg'

  const used = new Set(training.items.map((item) => item.exercise.id))
  const options = (exercises.data ?? []).filter((exercise) => !used.has(exercise.id))

  const submit = handleSubmit(async (values) => {
    try {
      await append.mutateAsync(values)
      reset(EMPTY) // ready for the next exercise
    } catch (error) {
      showMutationError(setError, error, ['exercise_id', 'weight', 'reps'], t)
    }
  })

  if (exercises.data && options.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        {t('fitness.trainings.noExercisesLeft')}{' '}
        <TextLink to="/fitness/exercises/new">{t('fitness.exercises.new')}</TextLink>
      </p>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <SelectField
        label={t('fitness.fields.exercise')}
        error={errors.exercise_id?.message}
        {...register('exercise_id')}
      >
        <option value="">{exercises.isPending ? t('common.loading') : t('common.choose')}</option>
        {options.map((exercise) => (
          <option key={exercise.id} value={exercise.id}>
            {exercise.muscle_group ? `${exercise.muscle_group.name}: ` : ''}
            {exercise.name}
          </option>
        ))}
      </SelectField>
      <div className="flex flex-wrap items-start gap-2">
        <div className="w-28">
          <TextField
            label={t('fitness.fields.weight', { unit: unitLabel(unit) })}
            inputMode="decimal"
            autoComplete="off"
            error={errors.weight?.message}
            {...register('weight')}
          />
        </div>
        <div className="w-24">
          <TextField
            label={t('fitness.fields.reps')}
            inputMode="numeric"
            autoComplete="off"
            error={errors.reps?.message}
            {...register('reps')}
          />
        </div>
        <div className="mt-6">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('common.sending') : t('fitness.trainings.addFirstSet')}
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500">{t('fitness.trainings.weightHint')}</p>
    </form>
  )
}
