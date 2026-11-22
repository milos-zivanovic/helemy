/** A multipart/form-data body with one file (e.g. the cropped JPEG of an image upload). */
export function fileFormData(field: string, blob: Blob): FormData {
  const form = new FormData()
  form.append(field, blob, `${field}.jpg`)
  return form
}
