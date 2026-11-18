import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { LinkButton } from '../components/Button'
import { Card } from '../components/Card'
import { ConfirmButton } from '../components/ConfirmButton'
import { TextLink } from '../components/TextLink'
import { AddExerciseForm } from '../fitness/AddExerciseForm'
import { useDeleteTraining, useTraining } from '../fitness/hooks'
import { TrainingItemCard } from '../fitness/TrainingItemCard'
import { useActiveHousehold } from '../household/hooks'
import { useFormatters } from '../i18n/format'

const LIST = '/fitness/trainings'

// /fitness/trainings/:id: the workout itself. Each exercise is a card with its sets; a set is added
// with one tap (prefilled with the previous set), and new exercises are added at the bottom.
export function TrainingPage() {
  const { t } = useTranslation()
  const { formatDay, formatNumber } = useFormatters()
  const id = Number(useParams().id)
  const training = useTraining(id)
  const remove = useDeleteTraining(id)
  const navigate = useNavigate()
  const household = useActiveHousehold()

  if (training.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (training.isError) {
    return (
      <Alert tone="error">
        {errorMessage(training.error, t)}{' '}
        <TextLink to={LIST}>{t('fitness.trainings.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = training.data
  const showUser = (household?.member_count ?? 1) > 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold capitalize">{formatDay(data.date)}</h2>
          <p className="text-sm text-slate-600">
            {[
              data.name,
              data.muscle_groups.map((group) => group.name).join(', '),
              showUser ? data.user.full_name || data.user.email : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="text-xs text-slate-500">
            {t('fitness.trainings.summary', { exercises: data.items_count, sets: data.total_sets })}
            {data.total_volume > 0 && ` · ${formatNumber(data.total_volume)} kg`}
          </p>
          {data.notes && <p className="mt-1 text-sm whitespace-pre-line">{data.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to={`/fitness/trainings/${id}/edit`} variant="secondary">
            {t('fitness.trainings.edit')}
          </LinkButton>
          <ConfirmButton
            variant="danger"
            question={t('fitness.trainings.deleteConfirm')}
            disabled={remove.isPending}
            onConfirm={() => remove.mutate(undefined, { onSuccess: () => void navigate(LIST) })}
          >
            {t('common.delete')}
          </ConfirmButton>
        </div>
      </div>
      {remove.error && <Alert tone="error">{errorMessage(remove.error, t)}</Alert>}

      {data.items.map((item) => (
        <TrainingItemCard key={item.id} item={item} training={data} />
      ))}

      <Card title={t('fitness.trainings.addExercise')}>
        <AddExerciseForm training={data} />
      </Card>

      <Link to={LIST} className="text-sm text-slate-600 hover:underline">
        ‹ {t('fitness.trainings.backToList')}
      </Link>
    </div>
  )
}
