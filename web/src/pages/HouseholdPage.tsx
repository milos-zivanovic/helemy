import { useTranslation } from 'react-i18next'

import { HouseholdDetails } from '../household/HouseholdDetails'
import { useActiveHousehold } from '../household/hooks'
import { Invitations } from '../household/Invitations'
import { Members } from '../household/Members'
import { ReceivedInvitations } from '../household/ReceivedInvitations'

// /household: the page is only a composition of sections; each one loads and changes its own data.
export function HouseholdPage() {
  const { t } = useTranslation()
  const household = useActiveHousehold()
  if (!household) return null // AppLayout renders pages only after the profile (with it) has loaded

  // key={household.id}: when the household changes (invitation accepted, left), React throws the old
  // sections away and mounts fresh ones, so no state (open forms, old errors) carries over.
  return (
    <div key={household.id} className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('household.title')}</h1>
      <ReceivedInvitations />
      {/* From a laptop up: the household and its members on the left, invitations on the right */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <HouseholdDetails household={household} />
          <Members household={household} />
        </div>
        {household.user_role === 'owner' && <Invitations household={household} />}
      </div>
    </div>
  )
}
