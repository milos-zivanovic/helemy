"""Uploaded images: checked and re-encoded with Pillow before they're stored."""

from io import BytesIO
from uuid import uuid4

from django.core.files.base import ContentFile
from django.utils.translation import gettext as _
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
# Far more than any photo; refuses "decompression bombs" (a tiny file that unpacks to huge pixels).
MAX_PIXELS = 50_000_000


class ImageError(ValueError):
    """An upload that isn't an acceptable image; the message is shown to the client."""


def square_webp(upload, size):
    """
    The upload as a `size`x`size` WebP (a ContentFile with a random name): rotated as the camera
    meant (EXIF), centre-cropped to a square if it isn't one, scaled. Re-encoding also drops the
    original's metadata (GPS location and such) and anything that isn't image data.
    """
    if upload.size > MAX_UPLOAD_BYTES:
        raise ImageError(
            _("The image is too large (at most %(mb)s MB).") % {"mb": MAX_UPLOAD_BYTES // 2**20}
        )
    try:
        with Image.open(upload) as image:
            if image.format not in ALLOWED_FORMATS:
                raise ImageError(_("Upload a JPEG, PNG or WebP image."))
            if image.width * image.height > MAX_PIXELS:
                raise ImageError(_("The image has too many pixels."))
            image = ImageOps.exif_transpose(image).convert("RGBA")  # WebP keeps transparency
            image = ImageOps.fit(image, (size, size), Image.Resampling.LANCZOS)
            buffer = BytesIO()
            image.save(buffer, "WEBP", quality=85)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise ImageError(_("Upload a JPEG, PNG or WebP image.")) from exc
    return ContentFile(buffer.getvalue(), name=f"{uuid4().hex}.webp")


def replace_image(instance, field, upload, size):
    """
    Store `upload` (square_webp; raises ImageError) in the ImageField `field` of `instance` and delete
    the previous file, so replaced images don't pile up in the bucket.
    """
    picture = square_webp(upload, size)
    image = getattr(instance, field)
    old = image.name if image else None
    image.save(picture.name, picture, save=False)  # writes the file to the storage
    instance.save(update_fields=[field])
    if old:
        image.storage.delete(old)


def remove_image(instance, field):
    """Empty the ImageField `field` of `instance` and delete its file."""
    image = getattr(instance, field)
    if image:
        image.delete(save=False)  # removes the file from the storage
        setattr(instance, field, None)
        instance.save(update_fields=[field])


def absolute_url(image, request):
    """
    The full URL of an ImageField's file, or None: already absolute with R2 (MEDIA_CUSTOM_DOMAIN), a
    path (/media/...) on this API's host in development, made absolute so the web app (another
    origin) can load it.
    """
    if not image:
        return None
    return request.build_absolute_uri(image.url) if request else image.url
