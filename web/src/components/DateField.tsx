import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { fromDisplayDate, isDay, maskDisplayDate, toDisplayDate } from '../lib/dates'
import { Calendar } from './Calendar'
import { Icon } from './Icon'

/**
 * A date typed as dd/mm/yyyy, whatever the browser's language (an <input type="date"> shows the
 * browser's own format), plus a button that opens the app's calendar (Calendar: Monday first). `value` and `onChange`
 * use the API's "YYYY-MM-DD"; '' is no date. By default onChange fires only for a complete, existing
 * day or an emptied field (filters: half-typed text changes nothing). `passInvalid` (forms) also
 * passes half-typed or impossible text on as it is ("31/02"), so the form's validation rejects it
 * instead of quietly keeping the previous date. `error` is the form's message for the field.
 */
export function DateField({
  label,
  value,
  onChange,
  onBlur,
  error,
  passInvalid = false,
  name,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  passInvalid?: boolean
  name?: string
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const errorId = `${inputId}-error`
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  // What's in the box can be half typed ("05/1"), so it's state of its own, not just `value`.
  const [text, setText] = useState(displayed(value))
  const [touched, setTouched] = useState(false)

  // When `value` changes from outside (the calendar, the reset button, the URL) the text follows.
  // Comparing with the last seen value during render is React's pattern for "derived" state: no
  // useEffect, so there's no extra render showing the old text first.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setText(displayed(value))
    setTouched(false)
  }

  function type(input: string) {
    const masked = maskDisplayDate(input)
    setText(masked)
    if (masked === '') onChange('')
    else {
      const day = fromDisplayDate(masked)
      if (day) onChange(day)
      else if (passInvalid) onChange(masked)
    }
  }

  // A click or tap anywhere outside the field and its calendar closes the calendar. The listener
  // lives on the whole document only while it's open; the cleanup removes it (like a context
  // manager's __exit__).
  useEffect(() => {
    if (!open) return
    function closeOnOutside(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutside)
    return () => document.removeEventListener('pointerdown', closeOnOutside)
  }, [open])

  function close() {
    setOpen(false)
    buttonRef.current?.focus() // back where the keyboard user was
  }

  function pick(day: string) {
    onChange(day)
    close()
  }

  // Wrong only once the user has left the field with text that isn't a whole day. The form's own
  // message (e.g. "required") wins when there is one.
  const invalid = touched && text !== '' && fromDisplayDate(text) === null
  const message = error ?? (invalid ? t('date.invalid') : undefined)

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div ref={wrapperRef} className="relative flex">
        <input
          id={inputId}
          name={name}
          inputMode="numeric"
          autoComplete="off"
          placeholder={t('date.placeholder')}
          value={text}
          onChange={(event) => type(event.target.value)}
          onBlur={() => {
            setTouched(true)
            onBlur?.()
          }}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          className="focus:border-brand-400 focus:ring-brand-100 w-full min-w-0 rounded-l-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums shadow-xs transition outline-none focus:ring-3 aria-invalid:border-red-400"
        />
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-label={t('date.openCalendar', { label })}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="focus-visible:ring-brand-100 -ml-px rounded-r-lg border border-slate-200 bg-white px-2.5 text-slate-500 shadow-xs hover:bg-slate-50 hover:text-slate-700 focus-visible:ring-3 focus-visible:outline-none"
        >
          <Icon name="calendar" className="size-4" />
        </button>
        {open && <Calendar value={value} label={label} onSelect={pick} onClose={close} />}
      </div>
      {message && (
        <p id={errorId} className="text-sm text-red-700">
          {message}
        </p>
      )}
    </div>
  )
}

// A day as the field shows it; anything else (half-typed text passed on with passInvalid) as it is.
function displayed(value: string): string {
  return isDay(value) ? toDisplayDate(value) : value
}
