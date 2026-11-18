import { useLocation, useNavigate } from 'react-router'

import { monthRange } from '../lib/dates'

export const TRANSACTIONS_LIST = '/finances/transactions'

// The list passes its URL (?start=...&type=...) in the link's state, so saving, deleting or
// cancelling returns to the same filtered list; opened directly, a form falls back to the list of
// the entry's month.
type BackState = { back?: string } | null

export function useBackToList() {
  const navigate = useNavigate()
  const back = (useLocation().state as BackState)?.back
  return (date?: string) => {
    const month = date ? monthRange(date.slice(0, 7)) : null
    void navigate(
      back ??
        (month ? `${TRANSACTIONS_LIST}?start=${month.start}&end=${month.end}` : TRANSACTIONS_LIST),
    )
  }
}
