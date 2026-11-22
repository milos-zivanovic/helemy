import type { Area } from 'react-easy-crop'

/**
 * Cut `area` (in the image's own pixels, from react-easy-crop) out of the image at `src` and return it
 * as a `size`×`size` JPEG. Done in the browser with a <canvas>: the upload is then small (tens of kB
 * instead of a phone's 5–10 MB photo). The API still checks and re-encodes it.
 */
export async function cropToBlob(src: string, area: Area, size = 512): Promise<Blob> {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D is not available')
  context.fillStyle = '#ffffff' // JPEG has no transparency: transparent parts become white, not black
  context.fillRect(0, 0, size, size)
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image'))),
      'image/jpeg',
      0.9,
    ),
  )
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the image'))
    image.src = src
  })
}
