import tempfile
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from openpyxl import Workbook

from colmado.catalog_source_images import CatalogSourceImageError
from colmado.models import MasterProduct


COMMAND_SERVICE_PATH = (
    "colmado.management.commands.import_catalog_source_images."
    "save_product_source_image"
)


class ImportCatalogSourceImagesCommandTests(TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.settings_override = override_settings(
            MEDIA_ROOT=self.temporary_directory.name,
        )
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.temporary_directory.cleanup)

    def create_product(self, *, barcode=None):
        return MasterProduct.objects.create(
            barcode=barcode,
            name=f"Producto {barcode or 'sin código'}",
            brand="Marca",
            presentation="1 unidad",
            category="Pruebas",
        )

    def create_workbook(self, rows, filename="catalogo.xlsx"):
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

        path = Path(self.temporary_directory.name) / filename
        workbook.save(path)
        workbook.close()
        return path

    def image_url(self, identifier):
        return (
            "https://gruporamos.vtexassets.com/arquivos/ids/"
            f"{identifier}/producto.webp"
        )

    @patch(COMMAND_SERVICE_PATH)
    def test_dry_run_finds_product_without_downloading_image(self, save_image):
        product = self.create_product(barcode="8430094056027")
        path = self.create_workbook(
            [
                [
                    str(product.internal_reference),
                    product.barcode,
                    product.name,
                    self.image_url("170142"),
                ]
            ]
        )
        output = StringIO()

        call_command(
            "import_catalog_source_images",
            str(path),
            dry_run=True,
            delay=0,
            stdout=output,
        )

        save_image.assert_not_called()
        self.assertIn("Productos encontrados: 1", output.getvalue())
        self.assertIn("No se modificó ningún producto", output.getvalue())

    @patch(COMMAND_SERVICE_PATH, return_value=True)
    def test_downloads_image_for_product_matched_by_barcode(self, save_image):
        product = self.create_product(barcode="8430094056027")
        source_url = self.image_url("170142")
        path = self.create_workbook(
            [
                [
                    "",
                    product.barcode,
                    product.name,
                    source_url,
                ]
            ]
        )
        output = StringIO()

        call_command(
            "import_catalog_source_images",
            str(path),
            delay=0,
            stdout=output,
        )

        save_image.assert_called_once_with(product, source_url)
        self.assertIn(
            "Imágenes guardadas en la plataforma: 1",
            output.getvalue(),
        )

    @patch(COMMAND_SERVICE_PATH, return_value=True)
    def test_matches_product_without_barcode_by_internal_reference(
        self,
        save_image,
    ):
        product = self.create_product()
        source_url = self.image_url("170143")
        path = self.create_workbook(
            [
                [
                    str(product.internal_reference),
                    "",
                    product.name,
                    source_url,
                ]
            ]
        )

        call_command(
            "import_catalog_source_images",
            str(path),
            delay=0,
            stdout=StringIO(),
        )

        save_image.assert_called_once_with(product, source_url)

    @patch(COMMAND_SERVICE_PATH)
    def test_does_not_download_when_product_already_has_image(self, save_image):
        product = self.create_product(barcode="8430094056027")
        product.image.save(
            "imagen-existente.jpg",
            ContentFile(b"imagen-existente"),
            save=True,
        )
        path = self.create_workbook(
            [
                [
                    str(product.internal_reference),
                    product.barcode,
                    product.name,
                    self.image_url("170142"),
                ]
            ]
        )
        output = StringIO()

        call_command(
            "import_catalog_source_images",
            str(path),
            delay=0,
            stdout=output,
        )

        save_image.assert_not_called()
        self.assertIn("Ya tenían imagen: 1", output.getvalue())

    @patch(COMMAND_SERVICE_PATH, return_value=True)
    def test_respects_safe_processing_limit(self, save_image):
        first_product = self.create_product(barcode="8430094056027")
        second_product = self.create_product(barcode="8430094056028")
        path = self.create_workbook(
            [
                [
                    str(first_product.internal_reference),
                    first_product.barcode,
                    first_product.name,
                    self.image_url("170142"),
                ],
                [
                    str(second_product.internal_reference),
                    second_product.barcode,
                    second_product.name,
                    self.image_url("170143"),
                ],
            ]
        )

        call_command(
            "import_catalog_source_images",
            str(path),
            limit=1,
            delay=0,
            stdout=StringIO(),
        )

        self.assertEqual(save_image.call_count, 1)
        save_image.assert_called_once_with(
            first_product,
            self.image_url("170142"),
        )

    @patch(COMMAND_SERVICE_PATH)
    def test_one_failed_image_does_not_stop_remaining_products(self, save_image):
        first_product = self.create_product(barcode="8430094056027")
        second_product = self.create_product(barcode="8430094056028")
        path = self.create_workbook(
            [
                [
                    str(first_product.internal_reference),
                    first_product.barcode,
                    first_product.name,
                    self.image_url("170142"),
                ],
                [
                    str(second_product.internal_reference),
                    second_product.barcode,
                    second_product.name,
                    self.image_url("170143"),
                ],
            ]
        )
        save_image.side_effect = [
            CatalogSourceImageError("Imagen no disponible."),
            True,
        ]
        output = StringIO()
        errors = StringIO()

        call_command(
            "import_catalog_source_images",
            str(path),
            delay=0,
            stdout=output,
            stderr=errors,
        )

        self.assertEqual(save_image.call_count, 2)
        self.assertIn(
            "Imágenes guardadas en la plataforma: 1",
            output.getvalue(),
        )
        self.assertIn(
            "Imágenes inválidas o no disponibles: 1",
            output.getvalue(),
        )
        self.assertIn("Fila 2: Imagen no disponible", errors.getvalue())

    def test_rejects_a_missing_workbook(self):
        missing_path = (
            Path(self.temporary_directory.name)
            / "archivo-inexistente.xlsx"
        )

        with self.assertRaisesMessage(
            CommandError,
            "No existe el archivo",
        ):
            call_command(
                "import_catalog_source_images",
                str(missing_path),
                stdout=StringIO(),
            )
