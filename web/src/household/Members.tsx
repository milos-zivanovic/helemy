import { useTranslation } from 'react-i18next'

import { errorMessage } from '../api/errors'
import type { Household } from '../api/types'
import { useMe } from '../auth/useAuth'
import { Alert } from '../components/Alert'
import { Card } from '../components/Card'
import { ConfirmButton } from '../components/ConfirmButton'
import { useLeaveHousehold, useMembers, useRemoveMember } from './hooks'

// Members of the active household. The owner can remove others; a member can leave.
export function Members({ household }: { household: Household }) {
  const { t } = useTranslation()
  const { data: me } = useMe()
  const members = useMembers(household.id)
  const remove = useRemoveMember(household.id)
  const leave = useLeaveHousehold(household.id)
  const isOwner = household.user_role === 'owner'
  const error = remove.error ?? leave.error

  let list
  if (members.isPending) {
    list = <p className="text-sm text-slate-600">{t('common.loading')}</p>
  } else if (members.isError) {
    list = <Alert tone="error">{errorMessage(members.error, t)}</Alert>
  } else {
    list = (
      <ul className="divide-y divide-slate-100">
        {members.data.map((member) => {
          const isHouseholdOwner = member.id === household.owner.id
          return (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {member.full_name || member.email}
                  {member.id === me?.id && (
                    <span className="ml-1 text-slate-500">({t('household.members.you')})</span>
                  )}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {member.email}
                  {isHouseholdOwner && ` · ${t('household.roles.owner')}`}
                </p>
              </div>
              {isOwner && !isHouseholdOwner && (
                <ConfirmButton
                  variant="danger"
                  question={t('household.members.removeConfirm', {
                    name: member.full_name || member.email,
                  })}
                  disabled={remove.isPending}
                  onConfirm={() => remove.mutate(member.id)}
                >
                  {t('household.members.remove')}
                </ConfirmButton>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <Card title={t('household.members.title')}>
      {error && (
        <div className="mb-4">
          <Alert tone="error">{errorMessage(error, t)}</Alert>
        </div>
      )}
      {list}
      {!isOwner && (
        <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">{t('household.members.leaveInfo')}</p>
          <ConfirmButton
            variant="danger"
            question={t('household.members.leaveConfirm')}
            disabled={leave.isPending}
            onConfirm={() => leave.mutate()}
          >
            {t('household.members.leave')}
          </ConfirmButton>
        </div>
      )}
    </Card>
  )
}
