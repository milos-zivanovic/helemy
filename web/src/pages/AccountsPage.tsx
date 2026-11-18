import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { LinkButton } from '../components/Button'
import { type Account, useAccounts } from '../finances/hooks'
import { useFormatters } from '../i18n/format'

// /finances/accounts: where the money is (today's balance per account). The balances come from the
// API (opening balance + all transactions, transfers included), never summed here from a page of
// transactions. Transfers themselves are in the transaction list, under both accounts.
export function AccountsPage() {
  const { t } = useTranslation()
  const { formatMoney } = useFormatters()
  const accounts = useAccounts()

  if (accounts.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (accounts.isError) return <Alert tone="error">{errorMessage(accounts.error, t)}</Alert>

  const active = accounts.data.filter((account) => account.is_active)
  const archived = accounts.data.filter((account) => !account.is_active)
  // Archived accounts still count: money left in one is still money (usually it's 0).
  const total = accounts.data.reduce((sum, account) => sum + Number(account.balance), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{t('finances.accounts.total')}</p>
          {/* The one headline number of the page */}
          <p className={`text-3xl font-semibold ${total < 0 ? 'text-red-700' : ''}`}>
            {formatMoney(total)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton to="/finances/transactions/new?type=transfer" variant="secondary">
            {t('finances.transfers.new')}
          </LinkButton>
          <LinkButton to="/finances/accounts/new">{t('finances.accounts.new')}</LinkButton>
        </div>
      </div>

      <AccountList accounts={active} />
      {archived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-medium text-slate-500">
            {t('finances.accounts.archived')}
          </h2>
          <AccountList accounts={archived} />
        </section>
      )}
    </div>
  )
}

function AccountList({ accounts }: { accounts: Account[] }) {
  const { t } = useTranslation()
  const { formatMoney, formatDate } = useFormatters()
  if (accounts.length === 0) return null

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
      {accounts.map((account) => (
        <li key={account.id}>
          <Link
            to={`/finances/accounts/${account.id}`}
            className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 ${
              account.is_active ? '' : 'text-slate-500'
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{account.name}</span>
              <span className="block truncate text-xs text-slate-500">
                {t('finances.accounts.openedWith', {
                  amount: formatMoney(account.opening_balance ?? '0'),
                  date: formatDate(account.opening_date ?? ''),
                })}
              </span>
            </span>
            <span
              className={`shrink-0 text-sm font-semibold ${
                Number(account.balance) < 0 ? 'text-red-700' : ''
              }`}
            >
              {formatMoney(account.balance)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
