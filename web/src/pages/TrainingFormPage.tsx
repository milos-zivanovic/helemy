import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { errorMessage, showMutationError } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'
import {
  type TrainingInput,
  useCreateTraining,
  useMuscleGroups,
  useTraining,
  useUpdateTraining,
} from '../fitness/hooks'
import { type TrainingFormValues, trainingSchema } from '../fitness/schemas'
import { today } from '../lib/dates'

/** /fitness/trainings/new: date, name and muscle groups first; the exercises come on the next page. */
export function NewTrainingPage() {
  const { t } = useTranslation()
  const create = useCreateTraining()
  const navigate = useNavigate()

  return (
    <Card title={t('fitness.trainings.new')}>
      <TrainingForm
        defaultValues={{ date: today(), name: '', notes: '', muscle_group_ids: [] }}
        submitLabel={t('fitness.trainings.start')}
        onSubmit={async (values) => {
          const training = await create.mutateAsync(values)
          // replace: Back from the training goes to the list, not to this form again.
          void navigate(`/fitness/trainings/${training.id}`, { replace: true })
        }}
      />
    </Card>
  )
}

/** /fitness/trainings/:id/edit */
export function EditTrainingPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const training = useTraining(id)
  const update = useUpdateTraining(id)
  const navigate = useNavigate()
  const detail = `/fitness/trainings/${id}`

  if (training.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (training.isError) {
    return (
      <Alert tone="error">
        {errorMessage(training.error, t)}{' '}
        <TextLink to="/fitness/trainings">{t('fitness.trainings.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = training.data
  return (
    <Card title={t('fitness.trainings.edit')}>
      <TrainingForm
        defaultValues={{
          date: data.date,
          name: data.name ?? '',
          notes: data.notes ?? '',
          muscle_group_ids: data.muscle_groups.map((group) => String(group.id)),
        }}
        submitLabel={t('common.save')}
        onSubmit={async (values) => {
          await update.mutateAsync(values)
          void navigate(detail)
        }}
      />
    </Card>
  )
}

function TrainingForm({
  defaultValues,
  submitLabel,
  onSubmit,
}: {
  defaultValues: TrainingFormValues
  submitLabel: string
  onSubmit: (values: TrainingInput) => Promise<void>
}) {
  const { t } = useTranslation()
  const muscleGroups = useMuscleGroups()
  const schema = useMemo(() => trainingSchema(t), [t])
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
      // "You already have a training on this date." comes back as a `date` error.
      showMutationError(setError, error, ['date', 'name', 'notes', 'muscle_group_ids'], t)
    }
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label={t('fitness.fields.date')}
          type="date"
          error={errors.date?.message}
          {...register('date')}
        />
        <TextField
          label={t('fitness.fields.trainingName')}
          error={errors.name?.message}
          {...register('name')}
        />
      </div>

      {/* Several checkboxes under one name: React Hook Form collects the checked values in an array */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">
          {t('fitness.fields.muscleGroups')}
        </legend>
        <div className="flex flex-wrap gap-2">
          {(muscleGroups.data ?? []).map((group) => (
            <label
              key={group.id}
              className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-300 px-3 py-1 text-sm has-checked:border-slate-900 has-checked:bg-slate-900 has-checked:text-white"
            >
              <input
                type="checkbox"
                value={String(group.id)}
                className="sr-only"
                {...register('muscle_group_ids')}
              />
              {group.name}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('fitness.trainings.muscleGroupsHint')}</p>
      </fieldset>

      <TextField
        label={t('fitness.fields.notes')}
        error={errors.notes?.message}
        {...register('notes')}
      />
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.sending') : submitLabel}
        </Button>
      </div>
    </form>
  )
}
