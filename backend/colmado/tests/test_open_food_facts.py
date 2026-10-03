import tempfile
from unittest.mock import MagicMock, patch

import requests
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings

from colmado.integrations.open_food_facts import (
    MAX_IMAGE_SIZE_BYTES,
    InvalidProductImageError,
    OpenFoodFactsError,
    ProductImageNotFoundError,
    ProductNotFoundError,
    download_master_product_image,
    get_product_by_barcode,
    normalize_barcode,
)
from colmado.models import MasterProduct


REQUESTS_GET_PATH = (
    "colmado.integrations.open_food_facts.requests.get"
)


def build_json_response(payload):
    response = MagicMock()
    response.json.return_value = payload
    response.raise_for_status.return_value = None
    return response


def build_image_response(
    *,
    content=b"fake-image-content",
    content_type="image/jpeg",
    content_length=None,
):
    response = MagicMock()

    response.headers = {
        "Content-Type": content_type,
    }

    if content_length is not None:
        response.headers["Content-Length"] = str(content_length)

    response.iter_content.return_value = [content]
    response.raise_for_status.return_value = None

    return response


class OpenFoodFactsValidationTests(SimpleTestCase):
    def test_accepts_supported_numeric_barcodes(self):
        self.assertEqual(
            normalize_barcode("5449000000996"),
            "5449000000996",
        )
        self.assertEqual(
            normalize_barcode(" 12345678 "),
            "12345678",
        )

    def test_rejects_non_numeric_barcode(self):
        with self.assertRaisesMessage(
            ValueError,
            "solamente números",
        ):
            normalize_barcode("ABC12345")

    def test_rejects_barcode_with_invalid_length(self):
        with self.assertRaisesMessage(
            ValueError,
            "8, 12, 13 o 14 dígitos",
        ):
            normalize_barcode("12345")


class OpenFoodFactsLookupTests(SimpleTestCase):
    @patch(REQUESTS_GET_PATH)
    def test_returns_simple_product_information(self, requests_get):
        requests_get.return_value = build_json_response(
            {
                "status": 1,
                "product": {
                    "product_name_es": "Coca-Cola Original",
                    "brands": "Coca-Cola",
                    "quantity": "330 ml",
                    "image_front_url": (
                        "https://images.openfoodfacts.org/"
                        "images/products/544/900/000/0996/"
                        "front_es.400.jpg"
                    ),
                },
            }
        )

        result = get_product_by_barcode("5449000000996")

        self.assertEqual(
            result,
            {
                "barcode": "5449000000996",
                "name": "Coca-Cola Original",
                "brand": "Coca-Cola",
                "presentation": "330 ml",
                "image_url": (
                    "https://images.openfoodfacts.org/"
                    "images/products/544/900/000/0996/"
                    "front_es.400.jpg"
                ),
            },
        )

        requests_get.assert_called_once()

        request_kwargs = requests_get.call_args.kwargs

        self.assertEqual(
            request_kwargs["timeout"],
            15,
        )
        self.assertIn(
            "User-Agent",
            request_kwargs["headers"],
        )

    @patch(REQUESTS_GET_PATH)
    def test_uses_general_name_when_spanish_name_is_missing(
        self,
        requests_get,
    ):
        requests_get.return_value = build_json_response(
            {
                "status": 1,
                "product": {
                    "product_name": "Orange Juice",
                    "brands": "Example",
                    "quantity": "1 L",
                    "image_front_url": (
                        "https://images.openfoodfacts.org/"
                        "images/example.jpg"
                    ),
                },
            }
        )

        result = get_product_by_barcode("12345678")

        self.assertEqual(
            result["name"],
            "Orange Juice",
        )

    @patch(REQUESTS_GET_PATH)
    def test_raises_controlled_error_when_product_is_missing(
        self,
        requests_get,
    ):
        requests_get.return_value = build_json_response(
            {
                "status": 0,
                "status_verbose": "product not found",
            }
        )

        with self.assertRaises(ProductNotFoundError):
            get_product_by_barcode("12345678")

    @patch(REQUESTS_GET_PATH)
    def test_raises_controlled_error_when_image_is_missing(
        self,
        requests_get,
    ):
        requests_get.return_value = build_json_response(
            {
                "status": 1,
                "product": {
                    "product_name": "Producto sin foto",
                },
            }
        )

        with self.assertRaises(ProductImageNotFoundError):
            get_product_by_barcode("12345678")

    @patch(REQUESTS_GET_PATH)
    def test_rejects_image_from_unapproved_server(
        self,
        requests_get,
    ):
        requests_get.return_value = build_json_response(
            {
                "status": 1,
                "product": {
                    "product_name": "Producto inseguro",
                    "image_front_url": (
                        "https://example.com/product.jpg"
                    ),
                },
            }
        )

        with self.assertRaisesMessage(
            InvalidProductImageError,
            "servidor no permitido",
        ):
            get_product_by_barcode("12345678")

    @patch(REQUESTS_GET_PATH)
    def test_hides_connection_failure_behind_controlled_error(
        self,
        requests_get,
    ):
        requests_get.side_effect = requests.Timeout(
            "Provider timeout with internal details"
        )

        with self.assertRaisesMessage(
            OpenFoodFactsError,
            "No se pudo consultar Open Food Facts",
        ):
            get_product_by_barcode("12345678")


class MasterProductImageDownloadTests(TestCase):
    def setUp(self):
        self.temporary_media = tempfile.TemporaryDirectory()

        self.settings_override = override_settings(
            MEDIA_ROOT=self.temporary_media.name,
        )
        self.settings_override.enable()

        self.product = MasterProduct.objects.create(
            barcode="5449000000996",
            name="Coca-Cola Original",
            brand="Coca-Cola",
            presentation="330 ml",
            category="Refrescos",
            unit=MasterProduct.UNIT,
            sale_mode=MasterProduct.BY_UNIT,
            units_per_case=24,
        )

    def tearDown(self):
        self.settings_override.disable()
        self.temporary_media.cleanup()

    @patch(REQUESTS_GET_PATH)
    def test_downloads_and_saves_master_product_image(
        self,
        requests_get,
    ):
        product_response = build_json_response(
            {
                "status": 1,
                "product": {
                    "product_name_es": "Coca-Cola Original",
                    "brands": "Coca-Cola",
                    "quantity": "330 ml",
                    "image_front_url": (
                        "https://images.openfoodfacts.org/"
                        "images/products/544/900/000/0996/"
                        "front_es.400.jpg"
                    ),
                },
            }
        )

        image_response = build_image_response(
            content=b"automatic-product-image",
            content_type="image/jpeg",
        )

        requests_get.side_effect = [
            product_response,
            image_response,
        ]

        downloaded = download_master_product_image(
            self.product,
        )

        self.assertTrue(downloaded)

        self.product.refresh_from_db()

        self.assertTrue(self.product.image)
        self.assertTrue(
            self.product.image.name.startswith(
                "colmado/products/5449000000996"
            )
        )
        self.assertTrue(
            self.product.image.name.endswith(".jpg")
        )

        with self.product.image.open("rb") as saved_image:
            self.assertEqual(
                saved_image.read(),
                b"automatic-product-image",
            )

        self.assertEqual(
            requests_get.call_count,
            2,
        )

    @patch(REQUESTS_GET_PATH)
    def test_does_not_download_when_product_already_has_image(
        self,
        requests_get,
    ):
        self.product.image = SimpleUploadedFile(
            "existing.jpg",
            b"existing-image",
            content_type="image/jpeg",
        )
        self.product.save(
            update_fields=(
                "image",
                "updated_at",
            )
        )

        downloaded = download_master_product_image(
            self.product,
        )

        self.assertFalse(downloaded)
        requests_get.assert_not_called()

    def test_rejects_product_without_barcode(self):
        loose_product = MasterProduct.objects.create(
            barcode=None,
            name="Plátano",
            brand="",
            presentation="Unidad",
            category="Víveres",
            unit=MasterProduct.UNIT,
            sale_mode=MasterProduct.BY_UNIT,
            units_per_case=1,
        )

        with self.assertRaisesMessage(
            ProductNotFoundError,
            "no tiene código de barra",
        ):
            download_master_product_image(
                loose_product,
            )

    @patch(REQUESTS_GET_PATH)
    def test_rejects_non_image_download(
        self,
        requests_get,
    ):
        product_response = build_json_response(
            {
                "status": 1,
                "product": {
                    "product_name": "Producto",
                    "image_front_url": (
                        "https://images.openfoodfacts.org/"
                        "images/product-file"
                    ),
                },
            }
        )

        invalid_image_response = build_image_response(
            content=b"<html>not an image</html>",
            content_type="text/html",
        )

        requests_get.side_effect = [
            product_response,
            invalid_image_response,
        ]

        with self.assertRaisesMessage(
            InvalidProductImageError,
            "no es una imagen permitida",
        ):
            download_master_product_image(
                self.product,
            )

        self.product.refresh_from_db()

        self.assertFalse(self.product.image)

    @patch(REQUESTS_GET_PATH)
    def test_rejects_image_larger_than_allowed_limit(
        self,
        requests_get,
    ):
        product_response = build_json_response(
            {
                "status": 1,
                "product": {
                    "product_name": "Producto",
                    "image_front_url": (
                        "https://images.openfoodfacts.org/"
                        "images/large-product.jpg"
                    ),
                },
            }
        )

        large_image_response = build_image_response(
            content=b"",
            content_type="image/jpeg",
            content_length=MAX_IMAGE_SIZE_BYTES + 1,
        )

        requests_get.side_effect = [
            product_response,
            large_image_response,
        ]

        with self.assertRaisesMessage(
            InvalidProductImageError,
            "tamaño máximo",
        ):
            download_master_product_image(
                self.product,
            )

        self.product.refresh_from_db()

        self.assertFalse(self.product.image)