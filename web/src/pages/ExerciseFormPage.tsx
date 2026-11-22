import { zodResolver } from '@hookform/resolvers/zod'
import { lazy, type ReactNode, Suspense, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'

import { ApiError, errorMessage, showMutationError } from '../api/errors'
import { useMe } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmButton } from '../components/ConfirmButton'
import { ImageEditor } from '../components/ImageEditor'
import { SelectField } from '../components/SelectField'
import { TextField } from '../components/TextField'
import { TextLink } from '../components/TextLink'
import { ExerciseThumb } from '../fitness/ExerciseThumb'
import {
  type ExerciseInput,
  useCreateExercise,
  useDeleteExercise,
  useExercise,
  useExerciseImage,
  useMuscleGroups,
  useUpdateExercise,
} from '../fitness/hooks'
import { type ExerciseFormValues, exerciseSchema } from '../fitness/schemas'
import { useFormatters, WEIGHT_UNITS } from '../i18n/format'

const LIST = '/fitness/exercises'

// React.lazy: the component's file (and Recharts with it) is downloaded the first time it renders.
// <Suspense> shows its fallback until then, like a placeholder in a template.
const ExerciseProgress = lazy(() => import('../fitness/ExerciseProgress'))

/** /fitness/exercises/new */
export function NewExercisePage() {
  const { t } = useTranslation()
  const create = useCreateExercise()
  const navigate = useNavigate()
  const { data: me } = useMe()

  return (
    <Card className="max-w-2xl" title={t('fitness.exercises.new')}>
      <ExerciseForm
        // A new exercise starts with the user's own unit; a machine in the other one changes it.
        defaultValues={{
          name: '',
          muscle_group_id: '',
          description: '',
          weight_unit: me?.weight_unit ?? 'kg',
        }}
        onSubmit={async (values) => {
          await create.mutateAsync(values)
          void navigate(LIST)
        }}
      />
    </Card>
  )
}

/** /fitness/exercises/:id: the exercise's progress and its form. */
export function EditExercisePage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const exercise = useExercise(id)
  const update = useUpdateExercise(id)
  const remove = useDeleteExercise(id)
  const image = useExerciseImage(id)
  const navigate = useNavigate()

  if (exercise.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (exercise.isError) {
    return (
      <Alert tone="error">
        {errorMessage(exercise.error, t)}{' '}
        <TextLink to={LIST}>{t('fitness.exercises.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = exercise.data
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<p className="text-sm text-slate-600">{t('common.loading')}</p>}>
        <ExerciseProgress exerciseId={id} unit={data.weight_unit ?? 'kg'} />
      </Suspense>
      <Card title={t('fitness.exercises.image')}>
        <ImageEditor
          hasImage={Boolean(data.image_url)}
          preview={<ExerciseThumb name={data.name} src={data.image_url} className="size-32" />}
          labels={{
            upload: t('fitness.exercises.imageUpload'),
            change: t('fitness.exercises.imageChange'),
            remove: t('fitness.exercises.imageRemove'),
            removeConfirm: t('fitness.exercises.imageRemoveConfirm'),
          }}
          upload={(blob) => image.upload.mutateAsync(blob)}
          remove={() => image.remove.mutateAsync()}
        />
      </Card>
      <Card title={t('fitness.exercises.edit')}>
        {remove.error && (
          <div className="mb-4">
            <Alert tone="error">
              {remove.error instanceof ApiError && remove.error.status === 400
                ? t('fitness.exercises.inUse')
                : errorMessage(remove.error, t)}
            </Alert>
          </div>
        )}
        <ExerciseForm
          defaultValues={{
            name: data.name,
            muscle_group_id: data.muscle_group ? String(data.muscle_group.id) : '',
            description: data.description ?? '',
            weight_unit: data.weight_unit ?? 'kg',
          }}
          hasSets={data.trainings_count > 0}
          onSubmit={async (values) => {
            await update.mutateAsync(values)
            void navigate(LIST)
          }}
        >
          <ConfirmButton
            variant="danger"
            question={t('fitness.exercises.deleteConfirm')}
            disabled={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate(LIST) })}
          >
            {t('common.delete')}
          </ConfirmButton>
        </ExerciseForm>
      </Card>
    </div>
  )
}

function ExerciseForm({
  defaultValues,
  hasSets = false,
  onSubmit,
  children,
}: {
  defaultValues: ExerciseFormValues
  hasSets?: boolean // already in trainings: a new unit converts its sets
  onSubmit: (values: ExerciseInput) => Promise<void>
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const { unitLabel } = useFormatters()
  const muscleGroups = useMuscleGroups()
  const schema = useMemo(() => exerciseSchema(t), [t])
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues })
  const unit = useWatch({ control, name: 'weight_unit' })
  const converts = hasSets && unit !== defaultValues.weight_unit

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch (error) {
      showMutationError(
        setError,
        error,
        ['name', 'muscle_group_id', 'description', 'weight_unit'],
        t,
      )
    }
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {errors.root?.server && <Alert tone="error">{errors.root.server.message}</Alert>}
      <TextField
        label={t('fitness.fields.name')}
        error={errors.name?.message}
        {...register('name')}
      />
      <SelectField
        label={t('fitness.fields.muscleGroup')}
        error={errors.muscle_group_id?.message}
        {...register('muscle_group_id')}
      >
        <option value="">{t('fitness.exercises.noMuscleGroup')}</option>
        {(muscleGroups.data ?? []).map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </SelectField>
      <div className="flex flex-col gap-1">
        <SelectField
          label={t('fitness.exercises.weightUnit')}
          error={errors.weight_unit?.message}
          {...register('weight_unit')}
        >
          {WEIGHT_UNITS.map((option) => (
            <option key={option} value={option}>
              {t(`units.${option}Name`)}
            </option>
          ))}
        </SelectField>
        {converts ? (
          <Alert tone="info">
            {t('fitness.exercises.weightUnitChange', { unit: unitLabel(unit) })}
          </Alert>
        ) : (
          <p className="text-xs text-slate-500">{t('fitness.exercises.weightUnitHint')}</p>
        )}
      </div>
      <TextField
        label={t('fitness.fields.description')}
        error={errors.description?.message}
        {...register('description')}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.sending') : t('common.save')}
        </Button>
        {children}
      </div>
    </form>
  )
}
