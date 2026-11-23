import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFormatters } from '../i18n/format'
import { calendarWeeks, isDay, shiftDay, shiftDayByMonths, shiftMonth, today } from '../lib/dates'
import { Icon } from './Icon'

// Keys that move the highlighted day, like in the browser's own calendar.
const DAY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
}
const MONTH_STEPS: Record<string, number> = { PageUp: -1, PageDown: 1 }

/**
 * The app's own month calendar, shown under a DateField (the browser's calendar can't be resized
 * and starts the week on the browser's language). Weeks start on Monday. `value` is "YYYY-MM-DD"
 * or ''; `onSelect` gets the clicked day. Keyboard: arrows move by a day or a week, PageUp/PageDown
 * by a month, Enter picks, Escape closes (`onClose`).
 */
export function Calendar({
  value,
  label,
  onSelect,
  onClose,
}: {
  value: string
  label: string
  onSelect: (day: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { formatMonth, formatDay, weekdayNames } = useFormatters()
  const now = today()
  const initial = isDay(value) ? value : now
  // The highlighted day (keyboard focus) and the month on screen. Arrows move the day and the month
  // follows; the month buttons only page, the day stays.
  const [active, setActive] = useState(initial)
  const [month, setMonth] = useState(initial.slice(0, 7))
  const gridRef = useRef<HTMLDivElement>(null)

  // Keyboard focus follows the highlighted day. Runs on open too, so the calendar is ready for the
  // arrows (like Django admin's calendar, but you can type the date as well).
  useEffect(() => {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${active}"]`)?.focus()
  }, [active])

  function move(next: string) {
    setActive(next)
    setMonth(next.slice(0, 7))
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key in DAY_STEPS) {
      event.preventDefault()
      move(shiftDay(active, DAY_STEPS[event.key]))
    } else if (event.key in MONTH_STEPS) {
      event.preventDefault()
      move(shiftDayByMonths(active, MONTH_STEPS[event.key]))
    }
  }

  // Tab lands on one day only (the highlighted one, or the 1st when paging moved it off screen).
  const tabbable = active.slice(0, 7) === month ? active : `${month}-01`

  // On a phone the calendar sits in the middle of the screen over a dimmed page (under the field it
  // would stick out past the right edge when the field is on the right); from `sm` up it opens
  // under the field. `fixed` elements don't widen the page, absolute ones that stick out do.
  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-20 bg-slate-900/20 sm:hidden"
      />
      <div
        role="dialog"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="fixed top-1/2 left-1/2 z-30 w-80 -translate-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:absolute sm:top-full sm:left-0 sm:mt-1 sm:translate-none"
      >
        <div className="mb-2 flex items-center justify-between">
          <MonthButton
            icon="chevronLeft"
            label={t('date.previousMonth')}
            onClick={() => setMonth(shiftMonth(month, -1))}
          />
          <p className="text-base font-semibold text-slate-800 capitalize" aria-live="polite">
            {formatMonth(month)}
          </p>
          <MonthButton
            icon="chevronRight"
            label={t('date.nextMonth')}
            onClick={() => setMonth(shiftMonth(month, 1))}
          />
        </div>

        <div ref={gridRef} className="grid grid-cols-7 text-center">
          {weekdayNames().map((name) => (
            <span key={name} className="pb-1 text-sm font-medium text-slate-500 capitalize">
              {name}
            </span>
          ))}
          {calendarWeeks(month)
            .flat()
            .map((day) => {
              const selected = day === value
              const outside = day.slice(0, 7) !== month
              return (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  tabIndex={day === tabbable ? 0 : -1}
                  aria-label={formatDay(day)}
                  aria-pressed={selected}
                  aria-current={day === now ? 'date' : undefined}
                  onClick={() => onSelect(day)}
                  className={`focus-visible:ring-brand-300 mx-auto flex size-10 items-center justify-center rounded-full text-base tabular-nums focus-visible:ring-2 focus-visible:outline-none ${
                    selected
                      ? 'bg-brand-600 font-semibold text-white'
                      : `hover:bg-slate-100 ${outside ? 'text-slate-400' : 'text-slate-800'} ${
                          day === now ? 'ring-brand-400 font-semibold ring-1' : ''
                        }`
                  }`}
                >
                  {Number(day.slice(8))}
                </button>
              )
            })}
        </div>

        <div className="mt-2 flex justify-end border-t border-slate-100 pt-2">
          <button
            type="button"
            onClick={() => onSelect(now)}
            className="text-brand-700 hover:bg-brand-50 focus-visible:ring-brand-300 rounded-md px-2 py-1 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
          >
            {t('date.today')}
          </button>
        </div>
      </div>
    </>
  )
}

function MonthButton({
  icon,
  label,
  onClick,
}: {
  icon: 'chevronLeft' | 'chevronRight'
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="focus-visible:ring-brand-300 rounded-full p-2 text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:outline-none"
    >
      <Icon name={icon} className="size-5" />
    </button>
  )
}
