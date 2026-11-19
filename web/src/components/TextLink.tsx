import { Link, type LinkProps } from 'react-router'

// <Link> changes the page inside the app (no full reload, state and cache stay), unlike a plain <a href>.
export function TextLink({ className = '', ...props }: LinkProps) {
  return (
    <Link
      className={`text-brand-600 hover:text-brand-700 font-medium underline-offset-4 hover:underline ${className}`}
      {...props}
    />
  )
}
