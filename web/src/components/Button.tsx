import type { ComponentProps } from 'react'
import { Link, type LinkProps } from 'react-router'

import { type ButtonVariant, buttonClasses } from './buttonStyles'

type ButtonProps = ComponentProps<'button'> & { variant?: ButtonVariant }

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  // type="button" by default: inside a <form> a plain <button> would submit it.
  return <button type={type} className={buttonClasses(variant, className)} {...props} />
}

/** A link to another page that looks like a button ("New transaction"). */
export function LinkButton({
  variant = 'primary',
  className,
  ...props
}: LinkProps & { variant?: ButtonVariant }) {
  return <Link className={buttonClasses(variant, className)} {...props} />
}
