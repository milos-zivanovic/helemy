import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { Button, LinkButton } from '../components/Button'
import { useTrainings } from '../fitness/hooks'
import { useActiveHousehold } from '../household/hooks'
import { useFormatters } from '../i18n/format'

// /fitness/trainings?page=2: trainings of the household, newest first.
export function TrainingsPage() {
  const { t } = useTranslation()
  const { formatDay, formatNumber } = useFormatters()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = Number(searchParams.get('page')) || 1
  const trainings = useTrainings(page)
  const household = useActiveHousehold()
  const showUser = (household?.member_count ?? 1) > 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <LinkButton to="/fitness/trainings/new">{t('fitness.trainings.new')}</LinkButton>
      </div>

      {trainings.isError && <Alert tone="error">{errorMessage(trainings.error, t)}</Alert>}
      {trainings.isPending && <p className="text-sm text-slate-600">{t('common.loading')}</p>}

      {trainings.data && trainings.data.results.length === 0 && (
        <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          {t('fitness.trainings.empty')}
        </p>
      )}

      {trainings.data && trainings.data.results.length > 0 && (
        <ul
          className={`divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white ${
            trainings.isPlaceholderData ? 'opacity-60' : ''
          }`}
        >
          {trainings.data.results.map((training) => (
            <li key={training.id}>
              <Link
                to={`/fitness/trainings/${training.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium capitalize">
                    {formatDay(training.date)}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {[
                      training.name,
                      training.muscle_groups.map((group) => group.name).join(', '),
                      showUser ? training.user.full_name || training.user.email : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-slate-600">
                  {t('fitness.trainings.summary', {
                    exercises: training.items_count,
                    sets: training.total_sets,
                  })}
                  {training.total_volume > 0 && (
                    <span className="block tabular-nums">
                      {formatNumber(training.total_volume)} kg
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {trainings.data && trainings.data.total_pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setSearchParams({ page: String(page - 1) })}
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm text-slate-600">
            {t('common.pageOf', { page, pages: trainings.data.total_pages })}
          </span>
          <Button
            variant="secondary"
            disabled={page >= trainings.data.total_pages}
            onClick={() => setSearchParams({ page: String(page + 1) })}
          >
            {t('common.next')}
          </Button>
        </div>
      )}
    </div>
  )
}
