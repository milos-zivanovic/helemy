import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'

import { errorMessage } from '../api/errors'
import { Alert } from '../components/Alert'
import { Card } from '../components/Card'
import { ConfirmButton } from '../components/ConfirmButton'
import { TextLink } from '../components/TextLink'
import { useDeleteTransfer, useTransfer, useUpdateTransfer } from '../finances/hooks'
import { TransferForm } from '../finances/TransferForm'
import { TRANSACTIONS_LIST, useBackToList } from '../finances/useBackToList'
import { today } from '../lib/dates'

// A new transfer is made in the transaction form (the "Transfer" type); this page edits one.

/** /finances/transfers/:id — `id` is either of the transfer's two transactions. */
export function EditTransferPage() {
  const { t } = useTranslation()
  const id = Number(useParams().id)
  const transfer = useTransfer(id)
  const update = useUpdateTransfer(id)
  const remove = useDeleteTransfer(id)
  const backToList = useBackToList()

  if (transfer.isPending) return <p className="text-sm text-slate-600">{t('common.loading')}</p>
  if (transfer.isError) {
    return (
      <Alert tone="error">
        {errorMessage(transfer.error, t)}{' '}
        <TextLink to={TRANSACTIONS_LIST}>{t('finances.transactions.backToList')}</TextLink>
      </Alert>
    )
  }

  const data = transfer.data
  return (
    <Card title={t('finances.transfers.edit')}>
      {remove.error && (
        <div className="mb-4">
          <Alert tone="error">{errorMessage(remove.error, t)}</Alert>
        </div>
      )}
      <TransferForm
        currentAccounts={[data.from_account, data.to_account]}
        defaultValues={{
          from_account_id: String(data.from_account.id),
          to_account_id: String(data.to_account.id),
          amount: data.amount,
          date: data.date ?? today(),
          description: data.description ?? '',
        }}
        onSubmit={async (values) => {
          await update.mutateAsync(values)
          backToList(values.date)
        }}
      >
        <ConfirmButton
          variant="danger"
          question={t('finances.transfers.deleteConfirm')}
          disabled={remove.isPending}
          onConfirm={() => remove.mutate(undefined, { onSuccess: () => backToList(data.date) })}
        >
          {t('common.delete')}
        </ConfirmButton>
      </TransferForm>
    </Card>
  )
}
