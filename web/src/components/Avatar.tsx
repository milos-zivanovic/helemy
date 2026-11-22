import { useState } from 'react'

// The user's profile picture (`src`, the API's avatar_url) or, without one, a round badge with the
// initials on the brand gradient ("Demo Korisnik" → "DK"); the email's first letter when no name was
// entered. A picture that fails to load (e.g. a missing file) falls back to the initials too.
export function Avatar({
  firstName,
  lastName,
  email,
  src,
  className = 'size-9 text-sm',
}: {
  firstName?: string
  lastName?: string
  email: string
  src?: string | null
  className?: string
}) {
  // The address that failed, not a true/false flag: a new picture (another src) is tried again
  // without having to reset anything.
  const [failed, setFailed] = useState<string | null>(null)
  if (src && src !== failed) {
    // alt="": decoration, the name is always written next to it
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(src)}
        className={`shrink-0 rounded-full bg-slate-100 object-cover ${className}`}
      />
    )
  }
  const initials = `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}` || email.charAt(0)
  return (
    <span
      aria-hidden="true"
      className={`bg-brand-gradient inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white uppercase ${className}`}
    >
      {initials}
    </span>
  )
}
