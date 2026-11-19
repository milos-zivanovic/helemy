import type { ReactNode } from 'react'

// A titled white box, the building block of the app's pages. `action`: something for the right of
// the title, e.g. a link to the full list. `className`: e.g. a grid column span.
export function Card({
  title,
  action,
  className = '',
  children,
}: {
  title: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`surface p-4 sm:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
