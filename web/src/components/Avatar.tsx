// A round badge with the user's initials on the brand gradient ("Demo Korisnik" → "DK"); the email's
// first letter when no name was entered.
export function Avatar({
  firstName,
  lastName,
  email,
  className = 'size-9 text-sm',
}: {
  firstName?: string
  lastName?: string
  email: string
  className?: string
}) {
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
