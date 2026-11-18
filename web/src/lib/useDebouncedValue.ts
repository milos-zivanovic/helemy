import { useEffect, useState } from 'react'

/**
 * The value, but only after it stopped changing for `delay` ms. Typing "milk" then asks the API
 * once for "milk" instead of four times (m, mi, mil, milk).
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  // useEffect runs after a render, when `value` changed. Its return value is a cleanup that React
  // runs before the next effect: every keystroke cancels the previous timer and starts a new one.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
