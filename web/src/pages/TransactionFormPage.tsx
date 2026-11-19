import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { Card } from '../components/Card'
import { ConfirmButton } from '../components/ConfirmButton'
import { TextLink } from '../components/TextLink'
import {
  type TransactionInput,
  useAccounts,
  useCreateTransaction,
  useCreateTransfer,
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
} from '../finances/hooks'
import { type Carry, type Kind } from '../finances/KindToggle'
import { TransactionForm } from '../finances/TransactionForm'
import { TransferForm } from '../finances/TransferForm'
import { TRANSACTIONS_LIST, useBackToList } from '../finances/useBackToList'
import { today } from '../lib/dates'

/**
 * /finances/transactions/new (?type=transfer opens it on the transfer).
 *
 * Expense, income or transfer: the type toggle swaps two forms. Which one is shown is page
 * state (useState), and the `key` makes React build the chosen form from scratch, so its
 * defaultValues (read only on the first render, like a Django form's `initial`) take the carried
 * amount, date and description.
 */
export function NewTransactionPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const createTransaction = useCreateTransaction()
  const createTransfer = useCreateTransfer()
  const backToList = useBackToList()
  // The form's default account (the first active one) must be known before the form is created.
  const accounts = useAccounts()
  // A function as the initial value: computed once, on the first render.
  const [entry, setEntry] = useState<{ kind: Kind; carry: Carry }>(() => ({
    kind: searchParams.get('type') === 'transfer' ? 'transfer' : 'expense',
    carry: { amount: '', date: today(), description: '' },
  }))

  if (accounts.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (accounts.isError) return <Alert tone="error">{errorMessage(accounts.error, t)}</Alert>
  const firstActive = accounts.data.find((account) => account.is_active)
  if (!firstActive) {
    return (
      <Alert tone="info">
        {t('finances.accounts.noneActive')}{' '}
        <TextLink to="/finances/accounts/new">{t('finances.accounts.new')}</TextLink>
      </Alert>
    )
  }

  const switchTo = (kind: Kind, carry: Carry) => setEntry({ kind, carry })

  return (
    <Card
      className="max-w-2xl"
      title={t(entry.kind === 'transfer' ? 'finances.transfers.new' : 'finances.transactions.new')}
    >
      {entry.kind === 'transfer' ? (
        <TransferForm
          key="transfer"
          onSwitch={switchTo}
          defaultValues={{
            from_account_id: String(firstActive.id),
            to_account_id: '',
            ...entry.carry,
          }}
          onSubmit={async (values) => {
            await createTransfer.mutateAsync(values)
            backToList(values.date)
          }}
        />
      ) : (
        <TransactionForm
          key="transaction"
          withSuggestions
          onTransfer={(carry) => switchTo('transfer', carry)}
          submitLabel={t('common.save')}
          onSubmit={async (values: TransactionInput) => {
            await createTransaction.mutateAsync(values)
            backToList(values.date)
          }}
          defaultValues={{
            transaction_type: entry.kind,
            title: '',
            category_id: '',
            account_id: String(firstActive.id),
            is_fixed: false,
            ...entry.carry,
          }}
        />
      )}
    </Card>
  )
}

/** /finances/transactions/:id */
export function EditTransactionPage() {
  const { t } = useTranslation()
  const location = useLocation()
  // useParams: the URL's dynamic parts, like the kwargs a Django view gets from <int:id>.
  const id = Number(useParams().id)
  const transaction = useTransaction(id)
  const update = useUpdateTransaction(id)
  const remove = useDeleteTransaction(id)
  const backToList = useBackToList()

  if (transaction.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (transaction.isError) {
    return (
      <Alert tone="error">
        {errorMessage(transaction.error, t)}{' '}
        <TextLink to={TRANSACTIONS_LIST}>{t('finances.transactions.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = transaction.data
  // Half of a transfer: it's edited as a whole, on the transfer page (same id works there).
  // <Navigate> is a redirect rendered as a component; `replace` keeps this URL out of history.
  if (data.transfer) {
    return <Navigate to={`/finances/transfers/${id}`} replace state={location.state} />
  }

  const onSubmit = async (values: TransactionInput) => {
    await update.mutateAsync(values)
    backToList(values.date)
  }

  return (
    <Card className="max-w-2xl" title={t('finances.transactions.edit')}>
      {remove.error && (
        <div className="mb-4">
          <Alert tone="error">{errorMessage(remove.error, t)}</Alert>
        </div>
      )}
      <TransactionForm
        submitLabel={t('common.save')}
        onSubmit={onSubmit}
        currentCategory={data.category}
        currentAccount={data.account}
        defaultValues={{
          transaction_type: data.transaction_type ?? 'expense',
          title: data.title,
          amount: data.amount,
          date: data.date ?? today(),
          category_id: String(data.category.id),
          account_id: String(data.account.id),
          description: data.description ?? '',
          is_fixed: data.is_fixed ?? false,
        }}
      >
        <ConfirmButton
          variant="danger"
          question={t('finances.transactions.deleteConfirm')}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => backToList(data.date) })}
        >
          {t('common.delete')}
        </ConfirmButton>
      </TransactionForm>
    </Card>
  )
}
