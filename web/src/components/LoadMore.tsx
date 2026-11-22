import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from './Button'

// Infinite scroll for a list loaded page by page (useInfiniteQuery): the next page comes by itself
// when this button scrolls into view (an IntersectionObserver tells when an element becomes
// visible, no scroll events needed), or by clicking it. Rendered only while there is a next page.
export function LoadMore({
  loading,
  onLoad,
  shown,
  total,
}: {
  loading: boolean
  onLoad: () => void
  shown: number
  total: number
}) {
  const { t } = useTranslation()
  const button = useRef<HTMLButtonElement>(null)
  // The latest onLoad/loading for the observer, which is created once (a ref doesn't re-render).
  const latest = useRef({ onLoad, loading })
  useEffect(() => {
    latest.current = { onLoad, loading }
  })
  useEffect(() => {
    const element = button.current
    if (!element) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !latest.current.loading) latest.current.onLoad()
    })
    observer.observe(element)
    return () => observer.disconnect() // cleanup when the button goes away (last page loaded)
  }, [])

  return (
    <div className="flex flex-col items-center gap-1">
      <Button ref={button} variant="secondary" disabled={loading} onClick={onLoad}>
        {loading ? t('common.loading') : t('common.loadMore')}
      </Button>
      <span className="text-xs text-slate-500">{t('common.shownOf', { shown, total })}</span>
    </div>
  )
}
