import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { errorMessage } from '../api/errors'
import { useMe } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { LinkButton } from '../components/Button'
import { Icon } from '../components/Icon'
import { LoadMore } from '../components/LoadMore'
import { useTrainings } from '../fitness/hooks'
import { useActiveHousehold } from '../household/hooks'
import { useFormatters } from '../i18n/format'

// /fitness/trainings: trainings of the household, newest first, loaded 20 at a time while scrolling
// (infinite scroll, like the transactions). In a shared household the other members' trainings are
// greyed out, so your own stand out.
export function TrainingsPage() {
  const { t } = useTranslation()
  const { formatDay, formatVolume } = useFormatters()
  const trainings = useTrainings()
  // All pages loaded so far, as one list
  const items = trainings.data?.pages.flatMap((page) => page.results) ?? []
  const household = useActiveHousehold()
  const showUser = (household?.member_count ?? 1) > 1
  const { data: me } = useMe()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <LinkButton to="/fitness/trainings/new">
          <Icon name="plus" className="size-4" />
          {t('fitness.trainings.new')}
        </LinkButton>
      </div>

      {trainings.isError && <Alert tone="error">{errorMessage(trainings.error, t)}</Alert>}
      {trainings.isPending && <p className="text-sm text-slate-600">{t('common.loading')}</p>}

      {trainings.data && items.length === 0 && (
        <p className="surface p-8 text-center text-sm text-slate-500">
          {t('fitness.trainings.empty')}
        </p>
      )}

      {items.length > 0 && (
        <ul className="surface divide-y divide-slate-100 overflow-hidden">
          {items.map((training) => {
            // Someone else's training: grey text instead of black (only in a shared household).
            const others = showUser && me !== undefined && training.user.id !== me.id
            return (
              <li key={training.id}>
                <Link
                  to={`/fitness/trainings/${training.id}`}
                  className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 ${
                    others ? 'text-slate-400' : ''
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium capitalize">
                      {formatDay(training.date)}
                    </span>
                    <span
                      className={`block truncate text-xs ${others ? 'text-slate-400' : 'text-slate-500'}`}
                    >
                      {[
                        training.name,
                        training.muscle_groups.map((group) => group.name).join(', '),
                        showUser ? training.user.full_name || training.user.email : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-right text-xs ${others ? 'text-slate-400' : 'text-slate-600'}`}
                  >
                    {t('fitness.trainings.summary', {
                      exercises: training.items_count,
                      sets: training.total_sets,
                    })}
                    {training.total_volume > 0 && (
                      <span className="block tabular-nums">
                        {formatVolume(training.total_volume, training.volume_unit)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {trainings.data && trainings.hasNextPage && (
        <LoadMore
          loading={trainings.isFetchingNextPage}
          onLoad={() => void trainings.fetchNextPage()}
          shown={items.length}
          total={trainings.data.pages[0].count}
        />
      )}
    </div>
  )
}
