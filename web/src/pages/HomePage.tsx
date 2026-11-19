import { useTranslation } from 'react-i18next'

import { useMe } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Card } from '../components/Card'
import { ProgressBar } from '../components/ProgressBar'
import { StatTile } from '../components/StatTile'
import { TextLink } from '../components/TextLink'
import { useAccounts, useActiveBudgets, usePeriodTotals } from '../finances/hooks'
import { useTrainingStats } from '../fitness/hooks'
import { useActiveHousehold, useInvitations } from '../household/hooks'
import { useFormatters } from '../i18n/format'
import { currentMonth, monthRange, today } from '../lib/dates'
import { useWeek } from '../nutrition/hooks'

// Start page: a summary of every section (finances, trainings, nutrition) and what needs the
// user's attention. Each card links to the page with the details.
export function HomePage() {
  const { t } = useTranslation()
  // Same query key as in AppLayout, so this reads the cached profile: no second request.
  const { data: me } = useMe()
  const household = useActiveHousehold()
  const invitations = useInvitations()
  if (!me) return null // AppLayout renders pages only after the profile has loaded

  const pending = invitations.data?.received.length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t('home.greeting', { name: me.first_name || me.email })}
      </h1>
      {pending > 0 && (
        <Alert tone="info">
          {t('home.pendingInvitations', { n: pending })}{' '}
          <TextLink to="/household">{t('home.viewInvitations')}</TextLink>
        </Alert>
      )}
      {/* One column on a phone; from a laptop up finances take two thirds, the rest goes beside */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <FinancesSummary />
        <div className="flex flex-col gap-6">
          <BudgetsAttention />
          {household && <HouseholdSummary household={household} />}
        </div>
      </div>
      {/* Two columns from tablet width up, one under the other on a phone */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <FitnessSummary />
        <NutritionSummary userId={me.id} />
      </div>
    </div>
  )
}

// The active household: name, the user's role and how many members it has.
function HouseholdSummary({
  household,
}: {
  household: NonNullable<ReturnType<typeof useActiveHousehold>>
}) {
  const { t } = useTranslation()
  return (
    <Card title={t('nav.household')}>
      <p className="text-sm font-medium">{household.name}</p>
      <p className="mt-1 text-sm text-slate-500">
        {household.user_role ? t(`household.roles.${household.user_role}`) : '—'} ·{' '}
        {t('home.members', { n: household.member_count })}
      </p>
      <TextLink to="/household" className="mt-3 inline-block text-sm">
        {t('home.openHousehold')}
      </TextLink>
    </Card>
  )
}

// How much money there is now (all accounts together, then each open one) and this month so far.
function FinancesSummary() {
  const { t } = useTranslation()
  const { formatMoney, formatMonth } = useFormatters()
  const accounts = useAccounts()
  const month = currentMonth()
  const { start, end } = monthRange(month)
  const totals = usePeriodTotals(start, end)
  if (!accounts.data) return null

  const total = accounts.data.reduce((sum, account) => sum + Number(account.balance), 0)
  const open = accounts.data.filter((account) => account.is_active)

  return (
    <Card title={t('nav.finances')} className="lg:col-span-2">
      <div className="flex flex-col gap-5">
        {/* The headline number on the logo's gradient: the one place it's this loud */}
        <div className="bg-brand-gradient shadow-brand-500/20 rounded-2xl p-5 text-white shadow-lg sm:p-6">
          <p className="text-sm text-white/80">{t('finances.accounts.total')}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
            {formatMoney(total)}
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {open.map((account) => (
              <li key={account.id} className="flex justify-between gap-3">
                <span className="truncate text-white/80">{account.name}</span>
                <span className="font-medium tabular-nums">{formatMoney(account.balance)}</span>
              </li>
            ))}
          </ul>
        </div>

        {totals.data && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-slate-600 capitalize">{formatMonth(month)}</h3>
            <dl className="grid grid-cols-3 gap-3">
              <StatTile
                label={t('finances.totals.income')}
                tone="text-green-700"
                value={formatMoney(totals.data.total_incomes)}
              />
              <StatTile
                label={t('finances.totals.expense')}
                tone="text-red-700"
                value={formatMoney(totals.data.total_expenses)}
              />
              <StatTile
                label={t('finances.totals.balance')}
                value={formatMoney(totals.data.total)}
              />
            </dl>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {/* The transactions of this month: the main screen with the month as its period */}
          <TextLink to={`/finances/transactions?start=${start}&end=${end}`}>
            {t('home.openTransactions')}
          </TextLink>
          <TextLink to="/finances/transactions/new">{t('finances.transactions.new')}</TextLink>
          <TextLink to="/finances/reports">{t('home.openReports')}</TextLink>
        </div>
      </div>
    </Card>
  )
}

// Only the budgets that need attention (80 % or more spent); nothing when all is well.
function BudgetsAttention() {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const budgets = useActiveBudgets()
  const attention = (budgets.data?.results ?? []).filter(
    (budget) => Number(budget.percentage) >= 80,
  )
  if (attention.length === 0) return null

  return (
    <Card title={t('home.budgetsAttention')}>
      <ul className="flex flex-col gap-3">
        {attention.map((budget) => (
          <li key={budget.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{budget.category.name}</span>
              <span className="text-slate-600">
                {t('finances.budgets.spentOf', {
                  spent: formatMoney(budget.spent),
                  amount: formatMoney(budget.amount),
                })}{' '}
                · {Math.round(Number(budget.percentage))} %
              </span>
            </div>
            <ProgressBar percentage={Number(budget.percentage)} label={budget.category.name} />
          </li>
        ))}
      </ul>
      <TextLink to="/finances/budgets" className="mt-3 inline-block text-sm">
        {t('home.openBudgets')}
      </TextLink>
    </Card>
  )
}

// The last training and how many there were this month.
function FitnessSummary() {
  const { t } = useTranslation()
  const { formatDay } = useFormatters()
  const stats = useTrainingStats(monthRange(currentMonth()).start)

  return (
    <Card title={t('nav.fitness')}>
      {stats.data && (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-1 gap-3">
            <StatTile label={t('home.trainingsThisMonth')} value={String(stats.data.countSince)} />
          </dl>
          {stats.data.last ? (
            <p className="text-sm">
              <span className="text-slate-500">{t('home.lastTraining')}: </span>
              <TextLink to={`/fitness/trainings/${stats.data.last.id}`} className="capitalize">
                {formatDay(stats.data.last.date)}
              </TextLink>
              {stats.data.last.name && ` · ${stats.data.last.name}`}
              <span className="block text-xs text-slate-500">
                {t('fitness.trainings.summary', {
                  exercises: stats.data.last.items_count,
                  sets: stats.data.last.total_sets,
                })}
              </span>
            </p>
          ) : (
            <p className="text-sm text-slate-600">{t('fitness.trainings.empty')}</p>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <TextLink to="/fitness/trainings/new">{t('fitness.trainings.start')}</TextLink>
        <TextLink to="/fitness/trainings">{t('home.openTrainings')}</TextLink>
      </div>
    </Card>
  )
}

// Today's calories and macros of the logged-in member (the diary is personal).
function NutritionSummary({ userId }: { userId: number }) {
  const { t } = useTranslation()
  const day = today()
  const week = useWeek(day)
  const mine = week.data
    ?.find((item) => item.date === day)
    ?.by_user.find((member) => member.user_id === userId)

  return (
    <Card title={t('nav.nutrition')}>
      <h3 className="mb-2 text-sm font-medium text-slate-600">{t('nutrition.diary.today')}</h3>
      <dl className="grid grid-cols-2 gap-3">
        <StatTile label={t('nutrition.fields.calories')} value={`${mine?.calories ?? 0} kcal`} />
        <StatTile label={t('nutrition.fields.protein')} value={`${mine?.protein ?? 0} g`} />
        <StatTile label={t('nutrition.fields.carbs')} value={`${mine?.carbs ?? 0} g`} />
        <StatTile label={t('nutrition.fields.fat')} value={`${mine?.fat ?? 0} g`} />
      </dl>
      <TextLink to="/nutrition/diary" className="mt-3 inline-block text-sm">
        {t('home.openDiary')}
      </TextLink>
    </Card>
  )
}
