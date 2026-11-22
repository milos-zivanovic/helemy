import type { TFunction } from 'i18next'
import { z } from 'zod'

// Client-side validation for the auth forms, the role a Django Form's fields and clean() play. It only
// gives instant feedback; the API still validates everything (password strength, unique email, ...)
// and its 400 errors are shown on the same fields (see api/errors.ts).
//
// The schemas are functions of t so the messages come out in the current language. Field names match
// the API's (first_name, new_password), so API errors map onto the fields without renaming.

// Django's MinimumLengthValidator default; the other password rules are checked only by the API.
const PASSWORD_MIN_LENGTH = 8

export const loginSchema = (t: TFunction) =>
  z.object({
    email: z.email(t('validation.email')),
    password: z.string().min(1, t('validation.required')),
  })

export const registerSchema = (t: TFunction) =>
  z
    .object({
      email: z.email(t('validation.email')),
      first_name: z.string().trim(),
      last_name: z.string().trim(),
      password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, t('validation.passwordMin', { min: PASSWORD_MIN_LENGTH })),
      password_confirm: z.string(),
    })
    // Like Form.clean(): a check across two fields, reported on one of them.
    .refine((values) => values.password === values.password_confirm, {
      message: t('validation.passwordMismatch'),
      path: ['password_confirm'],
    })

export const forgotPasswordSchema = (t: TFunction) =>
  z.object({
    email: z.email(t('validation.email')),
  })

export const resetPasswordSchema = (t: TFunction) =>
  z
    .object({
      new_password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, t('validation.passwordMin', { min: PASSWORD_MIN_LENGTH })),
      password_confirm: z.string(),
    })
    .refine((values) => values.new_password === values.password_confirm, {
      message: t('validation.passwordMismatch'),
      path: ['password_confirm'],
    })

export const changePasswordSchema = (t: TFunction) =>
  z
    .object({
      old_password: z.string().min(1, t('validation.required')),
      new_password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, t('validation.passwordMin', { min: PASSWORD_MIN_LENGTH })),
      password_confirm: z.string(),
    })
    .refine((values) => values.new_password === values.password_confirm, {
      message: t('validation.passwordMismatch'),
      path: ['password_confirm'],
    })

// The profile form (PATCH /api/auth/me/). Names are optional and limited like Django's User model;
// the choices are checked by the API, the select boxes only offer valid ones anyway.
export const profileSchema = (t: TFunction) =>
  z.object({
    first_name: z
      .string()
      .trim()
      .max(150, t('validation.maxLength', { max: 150 })),
    last_name: z
      .string()
      .trim()
      .max(150, t('validation.maxLength', { max: 150 })),
    currency: z.enum(['RSD', 'EUR', 'USD', 'CHF', 'GBP', 'BAM', 'HUF']),
    timezone: z.string().min(1, t('validation.required')),
    language: z.enum(['en', 'sr-latn']),
    weight_unit: z.enum(['kg', 'lb']),
  })
