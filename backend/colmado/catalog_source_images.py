import io
import mimetypes
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

import requests
from django.core.files.base import ContentFile
from openpyxl import load_workbook
from PIL import Image, UnidentifiedImageError


ALLOWED_IMAGE_HOSTS = frozenset({"gruporamos.vtexassets.com"})
MAX_IMAGE_BYTES = 5 * 1024 * 1024
REQUEST_TIMEOUT = (5, 20)
SUPPORTED_IMAGE_FORMATS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
}


class CatalogSourceImageError(Exception):
    """Raised when one source image cannot be safely read or downloaded."""


@dataclass(frozen=True)
class CatalogImageRow:
    row_number: int
    internal_reference: str
    barcode: str
    image_url: str


def _clean_cell(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def normalize_barcode(value):
    barcode = _clean_cell(value)
    return barcode if barcode.isdigit() else ""


def validate_source_image_url(value):
    image_url = _clean_cell(value)
    if not image_url:
        raise CatalogSourceImageError("La fila no contiene una URL de imagen.")

    parsed = urlsplit(image_url)
    if parsed.scheme.lower() != "https":
        raise CatalogSourceImageError("La imagen debe utilizar HTTPS.")
    if parsed.username or parsed.password or parsed.port:
        raise CatalogSourceImageError("La URL de imagen no es segura.")

    hostname = (parsed.hostname or "").lower().rstrip(".")
    if hostname not in ALLOWED_IMAGE_HOSTS:
        raise CatalogSourceImageError(
            f"El dominio de imagen no está permitido: {hostname or 'vacío'}."
        )
    return image_url


def iter_catalog_image_rows(workbook_path):
    """Yield barcode/reference and source-image URL from the Productos sheet."""

    workbook = load_workbook(
        filename=Path(workbook_path),
        read_only=True,
        data_only=True,
    )
    try:
        if "Productos" not in workbook.sheetnames:
            raise CatalogSourceImageError(
                "El Excel debe contener una hoja llamada Productos."
            )

        worksheet = workbook["Productos"]
        rows = worksheet.iter_rows(values_only=True)
        headers = next(rows, None)
        if headers is None:
            raise CatalogSourceImageError("La hoja Productos está vacía.")

        header_positions = {
            _clean_cell(header).lower(): position
            for position, header in enumerate(headers)
        }
        required_headers = {
            "referencia_interna",
            "codigo_barra",
            "imagen_url_origen",
        }
        missing_headers = required_headers.difference(header_positions)
        if missing_headers:
            missing = ", ".join(sorted(missing_headers))
            raise CatalogSourceImageError(
                f"Faltan columnas requeridas en el Excel: {missing}."
            )

        reference_position = header_positions["referencia_interna"]
        barcode_position = header_positions["codigo_barra"]
        image_position = header_positions["imagen_url_origen"]

        for row_number, row in enumerate(rows, start=2):
            image_url = _clean_cell(row[image_position])
            if not image_url:
                continue

            internal_reference = _clean_cell(row[reference_position])
            barcode = normalize_barcode(row[barcode_position])
            if not barcode and not internal_reference:
                continue

            yield CatalogImageRow(
                row_number=row_number,
                internal_reference=internal_reference,
                barcode=barcode,
                image_url=image_url,
            )
    finally:
        workbook.close()


def download_source_image(image_url, *, session=None):
    """Download and verify one image without following untrusted redirects."""

    safe_url = validate_source_image_url(image_url)
    http = session or requests
    try:
        response = http.get(
            safe_url,
            timeout=REQUEST_TIMEOUT,
            stream=True,
            allow_redirects=False,
            headers={
                "Accept": "image/avif,image/webp,image/png,image/jpeg",
                "User-Agent": "PuntaCanaDiscovery-Colmado/1.0",
            },
        )
    except requests.RequestException as exc:
        raise CatalogSourceImageError("No se pudo conectar con la imagen.") from exc

    try:
        if response.status_code != 200:
            raise CatalogSourceImageError(
                f"El servidor de imágenes respondió {response.status_code}."
            )

        content_type = response.headers.get("Content-Type", "").split(";", 1)[0]
        if not content_type.lower().startswith("image/"):
            raise CatalogSourceImageError("La URL no devolvió una imagen.")

        declared_length = response.headers.get("Content-Length")
        if declared_length:
            try:
                if int(declared_length) > MAX_IMAGE_BYTES:
                    raise CatalogSourceImageError("La imagen supera el límite de 5 MB.")
            except ValueError:
                pass

        content = bytearray()
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            content.extend(chunk)
            if len(content) > MAX_IMAGE_BYTES:
                raise CatalogSourceImageError("La imagen supera el límite de 5 MB.")
    finally:
        response.close()

    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
        with Image.open(io.BytesIO(content)) as image:
            image_format = image.format
    except (UnidentifiedImageError, OSError) as exc:
        raise CatalogSourceImageError("El archivo descargado no es una imagen válida.") from exc

    extension = SUPPORTED_IMAGE_FORMATS.get(image_format)
    if extension is None:
        guessed_extension = mimetypes.guess_extension(content_type)
        raise CatalogSourceImageError(
            f"Formato de imagen no permitido: {guessed_extension or image_format}."
        )
    return bytes(content), extension


def save_product_source_image(product, image_url, *, session=None):
    """Save one verified source image without replacing an existing image."""

    if product.image:
        return False

    content, extension = download_source_image(image_url, session=session)
    identifier = product.barcode or str(product.internal_reference)
    filename = f"{identifier}{extension}"
    product.image.save(filename, ContentFile(content), save=True)
    return True
