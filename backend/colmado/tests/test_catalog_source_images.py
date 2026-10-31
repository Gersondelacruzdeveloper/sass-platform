import io
import tempfile
from pathlib import Path
from unittest.mock import Mock

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from openpyxl import Workbook
from PIL import Image

from colmado.catalog_source_images import (
    CatalogSourceImageError,
    download_source_image,
    iter_catalog_image_rows,
    save_product_source_image,
    validate_source_image_url,
)
from colmado.models import MasterProduct


SAFE_IMAGE_URL = (
    "https://gruporamos.vtexassets.com/arquivos/ids/170142/"
    "producto.webp?v=123"
)


class FakeImageResponse:
    def __init__(
        self,
        content,
        *,
        status_code=200,
        content_type="image/png",
        content_length=None,
    ):
        self.content = content
        self.status_code = status_code
        self.headers = {
            "Content-Type": content_type,
        }
        if content_length is not None:
            self.headers["Content-Length"] = str(content_length)
        self.closed = False

    def iter_content(self, chunk_size):
        for position in range(0, len(self.content), chunk_size):
            yield self.content[position:position + chunk_size]

    def close(self):
        self.closed = True


def make_png_bytes():
    output = io.BytesIO()
    Image.new(
        "RGB",
        (4, 4),
        color=(20, 130, 80),
    ).save(output, format="PNG")
    return output.getvalue()


class CatalogSourceImageTests(TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(
            MEDIA_ROOT=self.temporary_directory.name,
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.temporary_directory.cleanup)

    def create_workbook(self, rows):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "Productos"
        worksheet.append(
            [
                "referencia_interna",
                "codigo_barra",
                "nombre",
                "imagen_url_origen",
            ]
        )
        for row in rows:
            worksheet.append(row)

        path = Path(self.temporary_directory.name) / "catalogo.xlsx"
        workbook.save(path)
        workbook.close()
        return path

    def create_product(self, *, barcode="8430094056027"):
        return MasterProduct.objects.create(
            barcode=barcode,
            name="Producto de prueba",
            brand="Marca",
            presentation="1 unidad",
            category="Pruebas",
        )

    def test_reads_source_image_url_from_excel(self):
        path = self.create_workbook(
            [
                [
                    "65fd724d-c072-4aa4-ab66-47a21af8368a",
                    "8430094056027",
                    "Producto con imagen",
                    SAFE_IMAGE_URL,
                ],
                [
                    "",
                    "8430094056028",
                    "Producto sin imagen",
                    "",
                ],
            ]
        )

        rows = list(iter_catalog_image_rows(path))

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].row_number, 2)
        self.assertEqual(rows[0].barcode, "8430094056027")
        self.assertEqual(rows[0].image_url, SAFE_IMAGE_URL)

    def test_rejects_non_https_image_url(self):
        with self.assertRaisesMessage(
            CatalogSourceImageError,
            "La imagen debe utilizar HTTPS.",
        ):
            validate_source_image_url(
                "http://gruporamos.vtexassets.com/producto.jpg"
            )

    def test_rejects_unapproved_image_domain(self):
        with self.assertRaisesMessage(
            CatalogSourceImageError,
            "El dominio de imagen no está permitido",
        ):
            validate_source_image_url(
                "https://example.com/producto.jpg"
            )

    def test_downloads_and_validates_real_image_bytes(self):
        image_bytes = make_png_bytes()
        response = FakeImageResponse(
            image_bytes,
            content_length=len(image_bytes),
        )
        session = Mock()
        session.get.return_value = response

        content, extension = download_source_image(
            SAFE_IMAGE_URL,
            session=session,
        )

        self.assertEqual(content, image_bytes)
        self.assertEqual(extension, ".png")
        self.assertTrue(response.closed)
        session.get.assert_called_once_with(
            SAFE_IMAGE_URL,
            timeout=(5, 20),
            stream=True,
            allow_redirects=False,
            headers={
                "Accept": "image/avif,image/webp,image/png,image/jpeg",
                "User-Agent": "PuntaCanaDiscovery-Colmado/1.0",
            },
        )

    def test_saves_a_permanent_copy_in_master_product_image(self):
        product = self.create_product()
        image_bytes = make_png_bytes()
        session = Mock()
        session.get.return_value = FakeImageResponse(image_bytes)

        saved = save_product_source_image(
            product,
            SAFE_IMAGE_URL,
            session=session,
        )

        self.assertTrue(saved)
        product.refresh_from_db()
        self.assertTrue(product.image.name)
        self.assertIn("8430094056027", product.image.name)
        self.assertTrue(product.image.storage.exists(product.image.name))
        with product.image.open("rb") as stored_image:
            self.assertEqual(stored_image.read(), image_bytes)

    def test_does_not_replace_an_existing_product_image(self):
        product = self.create_product()
        product.image.save(
            "imagen-existente.png",
            ContentFile(make_png_bytes()),
            save=True,
        )
        original_image_name = product.image.name
        session = Mock()

        saved = save_product_source_image(
            product,
            SAFE_IMAGE_URL,
            session=session,
        )

        self.assertFalse(saved)
        product.refresh_from_db()
        self.assertEqual(product.image.name, original_image_name)
        session.get.assert_not_called()

    def test_rejects_a_response_that_is_not_an_image(self):
        session = Mock()
        session.get.return_value = FakeImageResponse(
            b"<html>No es una imagen</html>",
            content_type="text/html",
        )

        with self.assertRaisesMessage(
            CatalogSourceImageError,
            "La URL no devolvió una imagen.",
        ):
            download_source_image(
                SAFE_IMAGE_URL,
                session=session,
            )
