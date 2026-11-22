import { type ChangeEvent, type ReactNode, useEffect, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { useTranslation } from 'react-i18next'

import { errorMessage } from '../api/errors'
import { cropToBlob } from '../lib/cropImage'
import { Alert } from './Alert'
import { Button } from './Button'
import { ConfirmButton } from './ConfirmButton'

// Only to keep a phone from loading something absurd into memory: the upload itself is the small
// cropped JPEG, not this file.
const MAX_SOURCE_BYTES = 30 * 1024 * 1024
const ACCEPT = 'image/jpeg,image/png,image/webp'

type Labels = { upload: string; change: string; remove: string; removeConfirm: string }

/**
 * A square picture (profile picture, exercise image): choose a photo, pick the square in a crop
 * dialog, upload it; or remove the current one. `preview` is the current picture, `upload` and
 * `remove` call the API and throw on failure (the error is shown here).
 */
export function ImageEditor({
  preview,
  hasImage,
  upload,
  remove,
  labels,
  round = false,
}: {
  preview: ReactNode
  hasImage: boolean
  upload: (blob: Blob) => Promise<unknown>
  remove: () => Promise<unknown>
  labels: Labels
  round?: boolean
}) {
  const { t } = useTranslation()
  // The chosen file as an object URL (blob:…), the address <img> and the cropper read it from.
  const [source, setSource] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // An object URL holds the file in memory until it's revoked: free it when the dialog closes.
  // The function returned from useEffect is its cleanup, run before the next effect and on unmount.
  useEffect(() => {
    if (!source) return
    return () => URL.revokeObjectURL(source)
  }, [source])

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // choosing the same file again fires `change` again
    if (!file) return
    setError(null)
    if (!ACCEPT.split(',').includes(file.type)) setError(t('image.wrongType'))
    else if (file.size > MAX_SOURCE_BYTES) setError(t('image.tooLarge'))
    else setSource(URL.createObjectURL(file))
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setSource(null)
    } catch (caught) {
      setError(errorMessage(caught, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-4">
        {preview}
        <div className="flex flex-wrap items-center gap-2">
          {/* A <label> for a hidden file input: clicking it opens the file picker */}
          <label className="focus-within:ring-brand-300 inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs focus-within:ring-2 hover:bg-slate-50">
            {hasImage ? labels.change : labels.upload}
            <input type="file" accept={ACCEPT} className="sr-only" onChange={choose} />
          </label>
          {hasImage && (
            <ConfirmButton
              question={labels.removeConfirm}
              disabled={busy}
              onConfirm={() => void run(remove)}
            >
              {labels.remove}
            </ConfirmButton>
          )}
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {source && (
        <CropDialog
          source={source}
          round={round}
          busy={busy}
          onCancel={() => setSource(null)}
          onSave={(area) => void run(async () => upload(await cropToBlob(source, area)))}
        />
      )}
    </div>
  )
}

function CropDialog({
  source,
  round,
  busy,
  onCancel,
  onSave,
}: {
  source: string
  round: boolean
  busy: boolean
  onCancel: () => void
  onSave: (area: Area) => void
}) {
  const { t } = useTranslation()
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  // The chosen square in the image's own pixels; react-easy-crop reports it after every move.
  const [area, setArea] = useState<Area | null>(null)

  return (
    // A full-screen overlay; aria-modal tells screen readers the rest of the page is inactive.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('image.cropTitle')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div className="surface flex w-full max-w-md flex-col gap-4 p-4 sm:p-6">
        <h2 className="text-base font-semibold">{t('image.cropTitle')}</h2>
        <div className="relative h-72 overflow-hidden rounded-xl bg-slate-900">
          <Cropper
            image={source}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape={round ? 'round' : 'rect'}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setArea(pixels)}
          />
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-600">
          {t('image.zoom')}
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="accent-brand-500 flex-1"
          />
        </label>
        <p className="text-xs text-slate-500">{t('image.cropHint')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button disabled={busy || !area} onClick={() => area && onSave(area)}>
            {busy ? t('common.sending') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
