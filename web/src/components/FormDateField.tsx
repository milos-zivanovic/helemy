import { type Control, type FieldValues, type Path, useController } from 'react-hook-form'

import { DateField } from './DateField'

/**
 * DateField inside a React Hook Form form. register() works only for plain inputs that RHF reads
 * itself; DateField keeps its own text, so it's connected with useController instead: RHF hands
 * over the value and the onChange / onBlur to call, plus the field's error. Like a custom widget
 * in a Django form that still gets the bound value and the field's errors.
 */
// T: the form's values as typed; Out: after the schema's transforms (what handleSubmit gets). Both
// come from the `control` passed in, so a form with transforms (string → number) fits too.
export function FormDateField<T extends FieldValues, Out = T>({
  control,
  name,
  label,
}: {
  control: Control<T, unknown, Out>
  name: Path<T>
  label: string
}) {
  const { field, fieldState } = useController({ control, name })
  return (
    <DateField
      label={label}
      name={field.name}
      value={field.value ?? ''}
      onChange={field.onChange}
      onBlur={field.onBlur}
      error={fieldState.error?.message}
      passInvalid
    />
  )
}
