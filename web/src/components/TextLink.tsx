import { Link, type LinkProps } from 'react-router'

// <Link> changes the page inside the app (no full reload, state and cache stay), unlike a plain <a href>.
export function TextLink({ className = '', ...props }: LinkProps) {
  return <Link className={`font-medium text-slate-900 underline ${className}`} {...props} />
}
