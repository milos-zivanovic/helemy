import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { api } from '../api/client'
import { API_URL } from '../config'

// Phase 0 smoke check: calls a protected endpoint without a token. A 401 proves the API is up,
// CORS lets the browser read the response, and the typed client builds the right URL.
export function ApiStatus() {
  const { t } = useTranslation()
  const {
    data: status,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['api-status'],
    queryFn: async () => {
      const { response } = await api.GET('/api/fitness/muscle-groups/')
      return response.status
    },
    retry: false,
  })

  let message: string
  let tone: string
  if (isPending) {
    message = t('apiStatus.checking')
    tone = 'border-slate-200 bg-slate-50 text-slate-700'
  } else if (isError) {
    // fetch() itself failed: server down, wrong URL or the response was blocked by CORS
    message = t('apiStatus.unreachable', { url: API_URL })
    tone = 'border-red-200 bg-red-50 text-red-800'
  } else if (status === 401) {
    message = t('apiStatus.ok')
    tone = 'border-green-200 bg-green-50 text-green-800'
  } else {
    message = t('apiStatus.unexpected', { status })
    tone = 'border-amber-200 bg-amber-50 text-amber-800'
  }

  return (
    <section className={`rounded-lg border p-4 ${tone}`}>
      <h2 className="font-medium">{t('apiStatus.title')}</h2>
      <p className="mt-1 text-sm">{message}</p>
    </section>
  )
}
