import io
import re
from dataclasses import dataclass
from pathlib import Path

from openpyxl.utils.cell import coordinate_to_tuple
from PIL import Image, UnidentifiedImageError


MAX_CATALOG_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_CATALOG_IMAGE_FORMATS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "GIF": ".gif",
    "WEBP": ".webp",
}


@dataclass(frozen=True)
class EmbeddedCatalogImage:
    row_number: int
    content: bytes
    extension: str

    def filename_for(self, product_reference):
        raw_reference = str(product_reference).strip()
        safe_reference = re.sub(r"[^A-Za-z0-9._-]+", "-", raw_reference)
        safe_reference = safe_reference.strip("-._")[:100]
        safe_reference = safe_reference or f"fila-{self.row_number}"
        return f"catalogo-{safe_reference}{self.extension}"


class CatalogImageValidationError(Exception):
    def __init__(self, *, row_number, message):
        self.row_number = row_number
        self.message = message
        super().__init__(message)

    def as_catalog_error(self):
        return {
            "row": self.row_number,
            "errors": [self.message],
        }


def _image_position(image):
    anchor = getattr(image, "anchor", None)
    if isinstance(anchor, str):
        return coordinate_to_tuple(anchor)

    marker = getattr(anchor, "_from", None)
    if marker is None:
        return None

    return marker.row + 1, marker.col + 1


def _validated_image(raw_content, *, row_number):
    if not raw_content:
        raise CatalogImageValidationError(
            row_number=row_number,
            message="La imagen está vacía.",
        )

    if len(raw_content) > MAX_CATALOG_IMAGE_BYTES:
        raise CatalogImageValidationError(
            row_number=row_number,
            message="La imagen no puede pesar más de 5 MB.",
        )

    try:
        with Image.open(io.BytesIO(raw_content)) as image:
            image.verify()
            image_format = (image.format or "").upper()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise CatalogImageValidationError(
            row_number=row_number,
            message="El archivo pegado no es una imagen válida.",
        ) from exc

    extension = ALLOWED_CATALOG_IMAGE_FORMATS.get(image_format)
    if extension is None:
        allowed = "JPG, PNG, GIF o WebP"
        raise CatalogImageValidationError(
            row_number=row_number,
            message=f"El formato de imagen no es válido. Use {allowed}.",
        )

    return EmbeddedCatalogImage(
        row_number=row_number,
        content=raw_content,
        extension=extension,
    )


def find_image_column(fieldnames):
    aliases = {"imagen", "image", "foto"}
    for position, fieldname in enumerate(fieldnames, start=1):
        normalized = str(fieldname or "").strip().casefold()
        if normalized in aliases:
            return position
    return None


def extract_embedded_catalog_images(worksheet, fieldnames):
    """Return validated images keyed by their one-based Excel row number."""

    image_column = find_image_column(fieldnames)
    if image_column is None:
        return {}

    images_by_row = {}
    for image in getattr(worksheet, "_images", ()):  # openpyxl worksheet images
        position = _image_position(image)
        if position is None:
            continue

        row_number, column_number = position
        if row_number < 2 or column_number != image_column:
            continue

        if row_number in images_by_row:
            raise CatalogImageValidationError(
                row_number=row_number,
                message="Solo puede colocar una imagen por producto.",
            )

        try:
            raw_content = image._data()
        except Exception as exc:
            raise CatalogImageValidationError(
                row_number=row_number,
                message="No se pudo leer la imagen pegada en esta fila.",
            ) from exc

        images_by_row[row_number] = _validated_image(
            raw_content,
            row_number=row_number,
        )

    return images_by_row


def image_reference_for_row(row):
    return (
        row.get("barcode")
        or row.get("internal_reference")
        or Path(row.get("name") or "producto").stem
    )
