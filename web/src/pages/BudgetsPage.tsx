import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'

import { errorMessage } from '../api/errors'
import type { components } from '../api/schema'
import { Alert } from '../components/Alert'
import { Button, LinkButton } from '../components/Button'
import { ProgressBar } from '../components/ProgressBar'
import { progressTone } from '../components/progressTone'
import { Icon } from '../components/Icon'
import { useActiveBudgets, useBudgetsOfYear } from '../finances/hooks'
import { useFormatters } from '../i18n/format'
import { today } from '../lib/dates'

type Budget = components['schemas']['Budget']

// /finances/budgets: the budgets running today (with an overall total), then every budget of a year.
export function BudgetsPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const thisYear = Number(today().slice(0, 4))
  const year = Number(searchParams.get('year')) || thisYear
  const page = Number(searchParams.get('page')) || 1

  const setYearPage = (nextYear: number, nextPage = 1) =>
    setSearchParams({ year: String(nextYear), page: String(nextPage) })

  return (
    <div className="flex flex-col gap-6">
      <LinkButton to="/finances/budgets/new" className="self-start">
        <Icon name="plus" className="size-4" />
        {t('finances.budgets.new')}
      </LinkButton>
      <ActiveBudgets />

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{t('finances.budgets.byYear')}</h2>
          <Button
            variant="secondary"
            aria-label={t('finances.budgets.previousYear')}
            onClick={() => setYearPage(year - 1)}
          >
            ‹
          </Button>
          <span className="font-medium">{year}</span>
          <Button
            variant="secondary"
            aria-label={t('finances.budgets.nextYear')}
            onClick={() => setYearPage(year + 1)}
          >
            ›
          </Button>
        </div>
        <YearBudgets year={year} page={page} onPage={(next) => setYearPage(year, next)} />
      </section>
    </div>
  )
}

function ActiveBudgets() {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const budgets = useActiveBudgets()

  if (budgets.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (budgets.isError) return <Alert tone="error">{errorMessage(budgets.error, t)}</Alert>

  const { results, total_amount, total_spent, percentage } = budgets.data

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('finances.budgets.active')}</h2>
      {results.length === 0 ? (
        <p className="surface p-8 text-center text-sm text-slate-500">
          {t('finances.budgets.noneActive')}
        </p>
      ) : (
        <>
          <div className="surface flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{t('finances.budgets.total')}</span>
              <span>
                {t('finances.budgets.spentOf', {
                  spent: formatMoney(total_spent),
                  amount: formatMoney(total_amount),
                })}{' '}
                ·{' '}
                <span className={`font-medium ${progressTone(Number(percentage)).text}`}>
                  {Math.round(Number(percentage))} %
                </span>
              </span>
            </div>
            <ProgressBar percentage={Number(percentage)} label={t('finances.budgets.total')} />
          </div>
          <BudgetList budgets={results} />
        </>
      )}
    </section>
  )
}

function YearBudgets({
  year,
  page,
  onPage,
}: {
  year: number
  page: number
  onPage: (page: number) => void
}) {
  const { t } = useTranslation()
  const budgets = useBudgetsOfYear(year, page)

  if (budgets.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (budgets.isError) return <Alert tone="error">{errorMessage(budgets.error, t)}</Alert>

  const { results, total_pages } = budgets.data
  if (results.length === 0) {
    return (
      <p className="surface p-8 text-center text-sm text-slate-500">
        {t('finances.budgets.noneInYear', { year })}
      </p>
    )
  }

  return (
    <div className={`flex flex-col gap-3 ${budgets.isPlaceholderData ? 'opacity-60' : ''}`}>
      <BudgetList budgets={results} />
      {total_pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            {t('common.previous')}
          </Button>
          <span className="text-sm text-slate-600">
            {t('common.pageOf', { page, pages: total_pages })}
          </span>
          <Button
            variant="secondary"
            disabled={page >= total_pages}
            onClick={() => onPage(page + 1)}
          >
            {t('common.next')}
          </Button>
        </div>
      )}
    </div>
  )
}

function BudgetList({ budgets }: { budgets: Budget[] }) {
  const { t } = useTranslation()
  const { formatMoney, formatShortDate } = useFormatters()

  return (
    <ul className="surface divide-y divide-slate-100 overflow-hidden">
      {budgets.map((budget) => {
        const percentage = Number(budget.percentage)
        const left = Number(budget.amount) - Number(budget.spent)
        return (
          <li key={budget.id}>
            <Link
              to={`/finances/budgets/${budget.id}`}
              className="flex flex-col gap-2 px-4 py-3 hover:bg-slate-50"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {budget.category.category_group_name} / {budget.category.name}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {formatShortDate(budget.start_date)} – {formatShortDate(budget.end_date)}
                    {budget.description && ` · ${budget.description}`}
                  </span>
                </span>
                <span className="text-sm">
                  {t('finances.budgets.spentOf', {
                    spent: formatMoney(budget.spent),
                    amount: formatMoney(budget.amount),
                  })}
                </span>
              </div>
              <ProgressBar percentage={percentage} label={budget.category.name} />
              <span className={`text-xs ${left < 0 ? 'text-red-700' : 'text-slate-500'}`}>
                {left < 0
                  ? t('finances.budgets.over', { amount: formatMoney(-left) })
                  : t('finances.budgets.left', { amount: formatMoney(left) })}{' '}
                ·{' '}
                <span className={`font-medium ${progressTone(percentage).text}`}>
                  {Math.round(percentage)} %
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
