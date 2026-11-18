import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useSearchParams } from 'react-router'

import { errorMessage } from '../api/errors'
import type { components } from '../api/schema'
import { Alert } from '../components/Alert'
import { Button, LinkButton } from '../components/Button'
import { SelectField } from '../components/SelectField'
import { StatTile } from '../components/StatTile'
import { TextField } from '../components/TextField'
import { CategoryOptions } from '../finances/CategoryOptions'
import {
  type TransactionFilters,
  useAccounts,
  useCategories,
  useTransactions,
} from '../finances/hooks'
import { useActiveHousehold } from '../household/hooks'
import { useFormatters } from '../i18n/format'
import { currentMonth, isMonth, monthRange, shiftMonth } from '../lib/dates'
import { useDebouncedValue } from '../lib/useDebouncedValue'

type Transaction = components['schemas']['Transaction']

// /finances/transactions. The filters live in the URL (?month=2026-11&type=expense&page=2), like
// GET parameters of a Django list view: a reload, a bookmark or the back button keeps them, and the
// page is just a function of its URL.
export function TransactionsPage() {
  const { t } = useTranslation()
  const { formatMonth, formatMoney } = useFormatters()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const month = isMonth(searchParams.get('month')) ? searchParams.get('month')! : currentMonth()
  const type = searchParams.get('type')
  const category = searchParams.get('category')
  const account = searchParams.get('account')
  const page = Number(searchParams.get('page')) || 1

  /** Change some URL parameters; any filter change goes back to page 1. */
  const updateParams = (changes: Record<string, string | null>) => {
    setSearchParams((params) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value)
        else params.delete(key)
      }
      if (!('page' in changes)) params.delete('page')
      return params
    })
  }

  // The search box keeps its own state while typing and writes to the URL only after a pause.
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const debouncedSearch = useDebouncedValue(search.trim())
  useEffect(() => {
    if (debouncedSearch !== (searchParams.get('q') ?? '')) updateParams({ q: debouncedSearch })
    // Only the debounced text should trigger this; the other values are read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const { start, end } = monthRange(month)
  const filters: TransactionFilters = {
    start_date: start,
    end_date: end,
    page,
    ...(type === 'income' || type === 'expense' ? { transaction_type: type } : {}),
    ...(category ? { category: Number(category) } : {}),
    ...(account ? { account: Number(account) } : {}),
    ...(searchParams.get('q') ? { search: searchParams.get('q')! } : {}),
  }
  const transactions = useTransactions(filters)
  const categories = useCategories()
  const accounts = useAccounts()

  const backState = { back: location.pathname + location.search }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            aria-label={t('finances.transactions.previousMonth')}
            onClick={() => updateParams({ month: shiftMonth(month, -1) })}
          >
            ‹
          </Button>
          <span className="min-w-36 text-center font-medium capitalize">{formatMonth(month)}</span>
          <Button
            variant="secondary"
            aria-label={t('finances.transactions.nextMonth')}
            onClick={() => updateParams({ month: shiftMonth(month, 1) })}
          >
            ›
          </Button>
        </div>
        <LinkButton to="/finances/transactions/new" state={backState}>
          {t('finances.transactions.new')}
        </LinkButton>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <SelectField
          label={t('finances.fields.type')}
          value={type ?? ''}
          onChange={(event) => updateParams({ type: event.target.value })}
        >
          <option value="">{t('finances.filters.allTypes')}</option>
          <option value="expense">{t('finances.types.expense')}</option>
          <option value="income">{t('finances.types.income')}</option>
        </SelectField>
        <SelectField
          label={t('finances.fields.category')}
          value={category ?? ''}
          onChange={(event) => updateParams({ category: event.target.value })}
        >
          <option value="">{t('finances.filters.allCategories')}</option>
          <CategoryOptions categories={categories.data ?? []} />
        </SelectField>
        <SelectField
          label={t('finances.fields.account')}
          value={account ?? ''}
          onChange={(event) => updateParams({ account: event.target.value })}
        >
          <option value="">{t('finances.filters.allAccounts')}</option>
          {(accounts.data ?? []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label={t('finances.filters.search')}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {transactions.isError && <Alert tone="error">{errorMessage(transactions.error, t)}</Alert>}

      {transactions.data && (
        <>
          <dl className="grid grid-cols-3 gap-3">
            <StatTile
              label={t('finances.totals.income')}
              tone="text-green-700"
              value={formatMoney(transactions.data.total_incomes)}
            />
            <StatTile
              label={t('finances.totals.expense')}
              tone="text-red-700"
              value={formatMoney(transactions.data.total_expenses)}
            />
            <StatTile
              label={t('finances.totals.balance')}
              tone="text-slate-900"
              value={formatMoney(transactions.data.total)}
            />
          </dl>

          {/* isPlaceholderData: still showing the previous month while the new one loads */}
          <div className={transactions.isPlaceholderData ? 'opacity-60' : ''}>
            {transactions.data.results.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
                {t('finances.transactions.empty')}
              </p>
            ) : (
              <TransactionList
                transactions={transactions.data.results}
                backState={backState}
                showAccount={(accounts.data?.length ?? 0) > 1}
              />
            )}
          </div>

          {transactions.data.total_pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => updateParams({ page: String(page - 1) })}
              >
                {t('common.previous')}
              </Button>
              <span className="text-sm text-slate-600">
                {t('common.pageOf', { page, pages: transactions.data.total_pages })}
              </span>
              <Button
                variant="secondary"
                disabled={page >= transactions.data.total_pages}
                onClick={() => updateParams({ page: String(page + 1) })}
              >
                {t('common.next')}
              </Button>
            </div>
          )}
        </>
      )}

      {transactions.isPending && <p className="text-sm text-slate-600">{t('common.loading')}</p>}
    </div>
  )
}

// Rows grouped under a heading per day (the API returns them newest first).
function TransactionList({
  transactions,
  backState,
  showAccount,
}: {
  transactions: Transaction[]
  backState: { back: string }
  showAccount: boolean // the account name matters only when there's more than one
}) {
  const { formatDay, formatMoney } = useFormatters()
  const household = useActiveHousehold()
  const showUser = (household?.member_count ?? 1) > 1 // who entered it matters only when sharing

  const days: [string, Transaction[]][] = []
  for (const transaction of transactions) {
    const day = transaction.date ?? ''
    if (days.at(-1)?.[0] === day) days.at(-1)![1].push(transaction)
    else days.push([day, [transaction]])
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map(([day, items]) => (
        <section key={day}>
          <h3 className="mb-1 px-1 text-xs font-medium text-slate-500 capitalize">
            {formatDay(day)}
          </h3>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {items.map((transaction) => (
              <li key={transaction.id}>
                <Link
                  to={`/finances/transactions/${transaction.id}`}
                  state={backState}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{transaction.title}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {transaction.category.category_group_name} / {transaction.category.name}
                      {showAccount && ` · ${transaction.account.name}`}
                      {showUser && ` · ${transaction.user.full_name || transaction.user.email}`}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-sm font-semibold ${
                      transaction.transaction_type === 'income'
                        ? 'text-green-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {transaction.type_sign}
                    {formatMoney(transaction.amount)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
