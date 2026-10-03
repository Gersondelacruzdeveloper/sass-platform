import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from colmado.models import CatalogImport, MasterProduct
from colmado.services import import_master_catalog


TASK_DELAY_PATH = (
    "colmado.tasks.sync_master_product_images.delay"
)


class CatalogImageSynchronizationTests(TestCase):
    def setUp(self):
        user_model = get_user_model()

        self.admin_user = user_model.objects.create_user(
            email="catalog-admin@example.com",
            username="catalog-admin",
            password="safe-test-password",
            is_staff=True,
        )

        self.temporary_media = tempfile.TemporaryDirectory()

        self.settings_override = override_settings(
            MEDIA_ROOT=self.temporary_media.name,
        )
        self.settings_override.enable()

        # CatalogImport may normally use S3 in this project. During this
        # test we replace that storage with a temporary local directory.
        self.source_file_field = CatalogImport._meta.get_field(
            "source_file"
        )
        self.original_source_file_storage = (
            self.source_file_field.storage
        )
        self.source_file_field.storage = FileSystemStorage(
            location=self.temporary_media.name,
        )

        # TestCase executes cleanup functions in reverse order.
        self.addCleanup(self.temporary_media.cleanup)
        self.addCleanup(self.settings_override.disable)
        self.addCleanup(self.restore_source_file_storage)

    def restore_source_file_storage(self):
        self.source_file_field.storage = (
            self.original_source_file_storage
        )

    def csv_file(self, rows):
        headers = (
            "referencia_interna",
            "codigo_barra",
            "nombre",
            "marca",
            "presentacion",
            "categoria",
            "unidad",
            "modo_venta",
            "unidades_por_caja",
            "activo",
        )

        lines = [
            ",".join(headers),
        ]

        lines.extend(
            ",".join(row)
            for row in rows
        )

        content = (
            "\ufeff"
            + "\n".join(lines)
        ).encode("utf-8")

        return SimpleUploadedFile(
            "catalogo-productos.csv",
            content,
            content_type="text/csv",
        )

    def product_row(
        self,
        *,
        barcode,
        name,
        brand="Marca",
        presentation="1 unidad",
    ):
        return (
            "",
            barcode,
            name,
            brand,
            presentation,
            "Pruebas",
            "unidad",
            "por unidad",
            "1",
            "Sí",
        )

    @patch(TASK_DELAY_PATH)
    def test_successful_import_schedules_automatic_image_sync(
        self,
        task_delay,
    ):
        uploaded_file = self.csv_file(
            [
                self.product_row(
                    barcode="7460123456789",
                    name="Producto Uno",
                ),
                self.product_row(
                    barcode="7460123456796",
                    name="Producto Dos",
                ),
            ]
        )

        with self.captureOnCommitCallbacks(
            execute=True,
        ):
            catalog_import = import_master_catalog(
                uploaded_by=self.admin_user,
                uploaded_file=uploaded_file,
            )

        self.assertEqual(
            catalog_import.status,
            CatalogImport.COMPLETED,
        )
        self.assertEqual(
            catalog_import.created_products,
            2,
        )
        self.assertEqual(
            MasterProduct.objects.count(),
            2,
        )

        task_delay.assert_called_once_with(
            after_id=0,
            batch_size=10,
        )

    @patch(TASK_DELAY_PATH)
    def test_failed_import_does_not_schedule_image_sync(
        self,
        task_delay,
    ):
        duplicated_barcode = "7460123456789"

        uploaded_file = self.csv_file(
            [
                self.product_row(
                    barcode=duplicated_barcode,
                    name="Producto Uno",
                ),
                self.product_row(
                    barcode=duplicated_barcode,
                    name="Producto Duplicado",
                ),
            ]
        )

        with self.captureOnCommitCallbacks(
            execute=True,
        ):
            catalog_import = import_master_catalog(
                uploaded_by=self.admin_user,
                uploaded_file=uploaded_file,
            )

        self.assertEqual(
            catalog_import.status,
            CatalogImport.FAILED,
        )
        self.assertEqual(
            MasterProduct.objects.count(),
            0,
        )
        self.assertGreater(
            catalog_import.error_rows,
            0,
        )

        task_delay.assert_not_called()