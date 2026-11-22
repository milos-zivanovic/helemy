import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { errorMessage, showMutationError } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { ConfirmButton } from '../components/ConfirmButton'
import { TextField } from '../components/TextField'
import { useFormatters, type WeightUnit } from '../i18n/format'
import {
  type Training,
  type TrainingItem,
  type TrainingSet,
  useAppendSet,
  useDeleteSet,
  useDeleteTrainingItem,
  useExerciseHistory,
  useUpdateSet,
} from './hooks'
import { ExerciseThumb } from './ExerciseThumb'
import { type SetFormValues, setSchema } from './schemas'

/** The API's "82.50" as an input value: "82.5"; no weight → empty. */
const weightInput = (weight: string | null | undefined) =>
  weight === null || weight === undefined ? '' : String(Number(weight))

/** "80 kg × 8" (in the exercise's unit) or just "12" for a bodyweight set. */
function useSetLabel(unit: WeightUnit) {
  const { formatWeight } = useFormatters()
  return (set: { weight?: string | null; reps: number }) =>
    set.weight === null || set.weight === undefined
      ? String(set.reps)
      : `${formatWeight(set.weight, unit)} × ${set.reps}`
}

/** One exercise of a training: last time's sets, this training's sets, and adding the next one. */
export function TrainingItemCard({ item, training }: { item: TrainingItem; training: Training }) {
  const { t } = useTranslation()
  const { formatShortDate } = useFormatters()
  // Every weight of this card is in the exercise's unit: what the machine shows.
  const unit = item.exercise.weight_unit
  const setLabel = useSetLabel(unit)
  const removeItem = useDeleteTrainingItem()

  // The same member's previous training with this exercise: what to beat today.
  const history = useExerciseHistory(item.exercise.id, training.user.id)
  const previous = history.data?.filter((entry) => entry.date < training.date).at(-1)

  // Prefill the next set with the last one of today, or else the first one of last time.
  const lastSet = item.sets.at(-1) ?? previous?.sets[0]
  const nextDefaults: SetFormValues = {
    weight: weightInput(lastSet?.weight),
    reps: lastSet ? String(lastSet.reps) : '',
  }

  return (
    <section className="surface p-4">
      <div className="mb-2 flex items-center gap-3">
        <ExerciseThumb name={item.exercise.name} src={item.exercise.image_url} />
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <Link
            to={`/fitness/exercises/${item.exercise.id}`}
            className="font-semibold hover:underline"
          >
            {item.exercise.name}
          </Link>
          {previous && (
            <span className="text-xs text-slate-500">
              {t('fitness.trainings.lastTime', { date: formatShortDate(previous.date) })}{' '}
              {previous.sets.map(setLabel).join(', ')}
            </span>
          )}
        </div>
      </div>

      {item.sets.length > 0 && (
        <ol className="mb-3 divide-y divide-slate-100">
          {item.sets.map((set) => (
            <SetRow key={set.id} set={set} unit={unit} />
          ))}
        </ol>
      )}

      {/* key: a new set changes the key, React remounts the form, and it reads the new defaults */}
      <AddSetForm
        key={item.sets.length}
        trainingId={training.id}
        exerciseId={item.exercise.id}
        unit={unit}
        defaultValues={nextDefaults}
      />

      <div className="mt-3 flex justify-end">
        <ConfirmButton
          question={t('fitness.trainings.removeExerciseConfirm')}
          disabled={removeItem.isPending}
          onConfirm={() => removeItem.mutate(item.id)}
        >
          {t('fitness.trainings.removeExercise')}
        </ConfirmButton>
      </div>
      {removeItem.error && <Alert tone="error">{errorMessage(removeItem.error, t)}</Alert>}
    </section>
  )
}

// One set: shown as text, switches to a small form to correct it.
function SetRow({ set, unit }: { set: TrainingSet; unit: WeightUnit }) {
  const { t } = useTranslation()
  const setLabel = useSetLabel(unit)
  const [editing, setEditing] = useState(false)
  const remove = useDeleteSet()

  if (editing) {
    return (
      <li className="py-2">
        <EditSetForm set={set} unit={unit} onDone={() => setEditing(false)} />
      </li>
    )
  }

  return (
    <li className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span>
        <span className="mr-3 inline-block w-5 text-slate-500 tabular-nums">{set.set_number}.</span>
        {setLabel(set)}
      </span>
      <span className="flex gap-1">
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
          onClick={() => setEditing(true)}
        >
          {t('fitness.trainings.editSet')}
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
          disabled={remove.isPending}
          aria-label={t('fitness.trainings.deleteSet', { n: set.set_number })}
          onClick={() => remove.mutate(set.id)}
        >
          ✕
        </button>
      </span>
    </li>
  )
}

function EditSetForm({
  set,
  unit,
  onDone,
}: {
  set: TrainingSet
  unit: WeightUnit
  onDone: () => void
}) {
  const { t } = useTranslation()
  const update = useUpdateSet()
  return (
    <SetFields
      unit={unit}
      defaultValues={{ weight: weightInput(set.weight), reps: String(set.reps) }}
      submitLabel={t('common.save')}
      onCancel={onDone}
      onSubmit={async (values) => {
        await update.mutateAsync({ id: set.id, ...values })
        onDone()
      }}
    />
  )
}

function AddSetForm({
  trainingId,
  exerciseId,
  unit,
  defaultValues,
}: {
  trainingId: number
  exerciseId: number
  unit: WeightUnit
  defaultValues: SetFormValues
}) {
  const { t } = useTranslation()
  const append = useAppendSet(trainingId)
  return (
    <SetFields
      unit={unit}
      defaultValues={defaultValues}
      submitLabel={t('fitness.trainings.addSet')}
      onSubmit={async (values) => {
        await append.mutateAsync({ exercise_id: exerciseId, ...values })
      }}
    />
  )
}

// Weight + reps in one row, shared by "add set" and "edit set".
function SetFields({
  unit,
  defaultValues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  unit: WeightUnit
  defaultValues: SetFormValues
  submitLabel: string
  onSubmit: (values: { weight: string | null; reps: number }) => Promise<void>
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const { unitLabel } = useFormatters()
  const schema = useMemo(() => setSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues })

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch (error) {
      showMutationError(setError, error, ['weight', 'reps'], t)
    }
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
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
        {/* mt-6: line the buttons up with the inputs, below their labels */}
        <div className="mt-6 flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('common.sending') : submitLabel}
          </Button>
          {onCancel && (
            <Button variant="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
