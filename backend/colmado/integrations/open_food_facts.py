import logging
from pathlib import Path
from urllib.parse import urlparse

import requests
from django.core.files.base import ContentFile

from colmado.models import MasterProduct


logger = logging.getLogger(__name__)


OPEN_FOOD_FACTS_API_URL = (
    "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
)

OPEN_FOOD_FACTS_IMAGE_HOST = "images.openfoodfacts.org"

OPEN_FOOD_FACTS_USER_AGENT = (
    "MiColmado/1.0 "
    "(https://app.puntacanadiscovery.com; "
    "contacto@puntacanadiscovery.com)"
)

REQUEST_TIMEOUT_SECONDS = 15
MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class OpenFoodFactsError(Exception):
    """Base exception for controlled Open Food Facts failures."""


class ProductNotFoundError(OpenFoodFactsError):
    """The barcode does not exist in Open Food Facts."""


class ProductImageNotFoundError(OpenFoodFactsError):
    """The product exists but has no usable front image."""


class InvalidProductImageError(OpenFoodFactsError):
    """The remote image is invalid, unsafe or too large."""


def normalize_barcode(barcode):
    """
    Return a safe numeric barcode.

    MasterProduct accepts GTIN/EAN/UPC codes with 8, 12, 13 or 14 digits.
    """

    normalized = str(barcode or "").strip()

    if not normalized.isdigit():
        raise ValueError(
            "El código de barra debe contener solamente números."
        )

    if len(normalized) not in (8, 12, 13, 14):
        raise ValueError(
            "El código de barra debe tener 8, 12, 13 o 14 dígitos."
        )

    return normalized


def _request_headers():
    return {
        "User-Agent": OPEN_FOOD_FACTS_USER_AGENT,
        "Accept": "application/json",
    }


def _select_front_image(product_data):
    """
    Prefer the Spanish front image and then use the general front image.
    """

    candidates = (
        product_data.get("image_front_url"),
        product_data.get("image_front_es_url"),
        product_data.get("image_url"),
        product_data.get("image_front_small_url"),
    )

    for candidate in candidates:
        if candidate:
            return candidate

    raise ProductImageNotFoundError(
        "El producto existe, pero no tiene una fotografía frontal."
    )


def _validate_image_url(image_url):
    parsed_url = urlparse(image_url)

    if parsed_url.scheme != "https":
        raise InvalidProductImageError(
            "La fotografía del producto no utiliza una conexión segura."
        )

    if parsed_url.hostname != OPEN_FOOD_FACTS_IMAGE_HOST:
        raise InvalidProductImageError(
            "La fotografía proviene de un servidor no permitido."
        )

    return image_url


def get_product_by_barcode(barcode):
    """
    Find one product and return only the information needed by Mi Colmado.
    """

    normalized_barcode = normalize_barcode(barcode)

    try:
        response = requests.get(
            OPEN_FOOD_FACTS_API_URL.format(
                barcode=normalized_barcode,
            ),
            headers=_request_headers(),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except (
        requests.RequestException,
        ValueError,
    ) as exc:
        raise OpenFoodFactsError(
            "No se pudo consultar Open Food Facts."
        ) from exc

    if payload.get("status") != 1:
        raise ProductNotFoundError(
            "El producto no fue encontrado en Open Food Facts."
        )

    product_data = payload.get("product") or {}
    image_url = _validate_image_url(
        _select_front_image(product_data)
    )

    return {
        "barcode": normalized_barcode,
        "name": (
            product_data.get("product_name_es")
            or product_data.get("product_name")
            or ""
        ).strip(),
        "brand": (product_data.get("brands") or "").strip(),
        "presentation": (
            product_data.get("quantity") or ""
        ).strip(),
        "image_url": image_url,
    }


def _download_image(image_url):
    """
    Download and validate a product image without keeping it in memory
    indefinitely or accepting arbitrary file types.
    """

    _validate_image_url(image_url)

    try:
        response = requests.get(
            image_url,
            headers={
                "User-Agent": OPEN_FOOD_FACTS_USER_AGENT,
                "Accept": "image/jpeg,image/png,image/webp",
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
            stream=True,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise OpenFoodFactsError(
            "No se pudo descargar la fotografía del producto."
        ) from exc

    content_type = (
        response.headers
        .get("Content-Type", "")
        .split(";")[0]
        .strip()
        .lower()
    )

    extension = ALLOWED_IMAGE_CONTENT_TYPES.get(content_type)

    if extension is None:
        response.close()
        raise InvalidProductImageError(
            "El archivo descargado no es una imagen permitida."
        )

    content_length = response.headers.get("Content-Length")

    if content_length:
        try:
            declared_size = int(content_length)
        except (TypeError, ValueError):
            declared_size = 0

        if declared_size > MAX_IMAGE_SIZE_BYTES:
            response.close()
            raise InvalidProductImageError(
                "La fotografía supera el tamaño máximo permitido."
            )

    image_content = bytearray()

    try:
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue

            image_content.extend(chunk)

            if len(image_content) > MAX_IMAGE_SIZE_BYTES:
                raise InvalidProductImageError(
                    "La fotografía supera el tamaño máximo permitido."
                )
    finally:
        response.close()

    if not image_content:
        raise InvalidProductImageError(
            "La fotografía descargada está vacía."
        )

    return bytes(image_content), extension


def download_master_product_image(
    product,
    *,
    replace=False,
):
    """
    Download and attach the Open Food Facts image to one MasterProduct.

    Returns:
        True: the image was downloaded and saved.
        False: the product already had an image and replace=False.
    """

    if not isinstance(product, MasterProduct):
        raise TypeError(
            "product debe ser una instancia de MasterProduct."
        )

    if product.image and not replace:
        return False

    if not product.barcode:
        raise ProductNotFoundError(
            "El producto no tiene código de barra."
        )

    product_data = get_product_by_barcode(product.barcode)

    image_content, extension = _download_image(
        product_data["image_url"]
    )

    filename = (
        f"{product.barcode}"
        f"{extension}"
    )

    if replace and product.image:
        product.image.delete(save=False)

    product.image.save(
        Path(filename).name,
        ContentFile(image_content),
        save=False,
    )

    product.save(
        update_fields=(
            "image",
            "updated_at",
        )
    )

    logger.info(
        "Fotografía automática guardada para MasterProduct %s.",
        product.pk,
    )

    return True