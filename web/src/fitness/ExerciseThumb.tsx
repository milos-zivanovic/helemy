import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../components/Icon'

// An exercise's picture as a small square (training page). Clicking it opens the picture large;
// without a picture, a dumbbell placeholder of the same size keeps the names aligned.
export function ExerciseThumb({
  name,
  src,
  className = 'size-14',
}: {
  name: string
  src?: string | null
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  // Escape closes the large picture, like any dialog. The listener exists only while it's open.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!src) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 ${className}`}
      >
        <Icon name="dumbbell" className="size-1/2" />
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('fitness.exercises.openImage', { name })}
        className={`focus-visible:ring-brand-300 shrink-0 overflow-hidden rounded-lg bg-slate-100 focus-visible:ring-2 focus-visible:outline-none ${className}`}
      >
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      </button>
      {open && (
        // Click anywhere (the picture too) to close
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-slate-900/80 p-4"
        >
          <figure className="flex max-h-full flex-col items-center gap-3">
            <img
              src={src}
              alt={name}
              className="max-h-[80vh] w-full max-w-lg rounded-2xl bg-white object-contain"
            />
            <figcaption className="text-sm font-medium text-white">{name}</figcaption>
          </figure>
        </div>
      )}
    </>
  )
}
