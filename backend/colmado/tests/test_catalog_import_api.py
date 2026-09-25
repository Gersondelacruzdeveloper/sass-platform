import io
import tempfile
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from openpyxl import Workbook
from rest_framework import status
from rest_framework.test import APITestCase

from colmado.models import CatalogImport, MasterProduct


class CatalogImportApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.admin_user = user_model.objects.create_user(
            email="admin@example.com",
            username="platform-admin",
            password="safe-test-password",
            is_staff=True,
        )
        self.normal_user = user_model.objects.create_user(
            email="owner@example.com",
            username="owner",
            password="safe-test-password",
        )
        self.temp_media = tempfile.TemporaryDirectory()
        self.media_override = override_settings(MEDIA_ROOT=self.temp_media.name)
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)
        self.addCleanup(self.temp_media.cleanup)
        self.import_url = reverse("colmado-catalog-import-list")
        self.template_url = reverse("colmado-catalog-import-template")
        self.platform_catalog_url = reverse("colmado-platform-catalog-list")
        self.client.force_authenticate(self.admin_user)

    def csv_file(self, rows, *, filename="catalogo.csv", headers=None, delimiter=","):
        headers = headers or (
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
        lines = [delimiter.join(headers)]
        lines.extend(delimiter.join(row) for row in rows)
        content = ("\ufeff" + "\n".join(lines)).encode("utf-8")
        return SimpleUploadedFile(filename, content, content_type="text/csv")

    def xlsx_file(self, rows, *, filename="catalogo.xlsx"):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(
            (
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
        )
        for row in rows:
            sheet.append(row)
        output = io.BytesIO()
        workbook.save(output)
        workbook.close()
        return SimpleUploadedFile(
            filename,
            output.getvalue(),
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )

    def post_import(self, uploaded_file):
        return self.client.post(
            self.import_url,
            {"file": uploaded_file},
            format="multipart",
        )

    def coca_cola_row(self, **overrides):
        values = {
            "internal_reference": "",
            "barcode": "7460123456789",
            "name": "Coca-Cola",
            "brand": "Coca-Cola",
            "presentation": "12 oz",
            "category": "Bebidas",
            "unit": "unidad",
            "sale_mode": "por_unidad",
            "units_per_case": "24",
            "is_active": "Sí",
        }
        values.update(overrides)
        return tuple(values.values())

    def test_catalog_import_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.import_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_staff_user_cannot_view_imports(self):
        self.client.force_authenticate(self.normal_user)

        response = self.client.get(self.import_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_staff_user_cannot_upload_catalog(self):
        self.client.force_authenticate(self.normal_user)

        response = self.post_import(self.csv_file([self.coca_cola_row()]))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(MasterProduct.objects.count(), 0)

    def test_non_staff_user_cannot_download_template(self):
        self.client.force_authenticate(self.normal_user)

        response = self.client.get(self.template_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_can_download_spanish_csv_template(self):
        response = self.client.get(self.template_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("text/csv", response["Content-Type"])
        content = response.content.decode("utf-8-sig")
        self.assertIn("codigo_barra", content)
        self.assertIn("nombre", content)
        self.assertIn("Coca-Cola", content)

    def test_staff_can_create_individual_master_product(self):
        response = self.client.post(
            self.platform_catalog_url,
            {
                "barcode": "7460123456789",
                "name": "Coca-Cola",
                "brand": "Coca-Cola",
                "presentation": "12 oz",
                "category": "Bebidas",
                "unit": MasterProduct.UNIT,
                "sale_mode": MasterProduct.BY_UNIT,
                "units_per_case": 24,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            MasterProduct.objects.filter(barcode="7460123456789").exists()
        )

    def test_non_staff_cannot_manage_platform_catalog(self):
        self.client.force_authenticate(self.normal_user)

        response = self.client.get(self.platform_catalog_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_imports_valid_csv_and_records_summary(self):
        response = self.post_import(
            self.csv_file(
                [
                    self.coca_cola_row(),
                    self.coca_cola_row(
                        barcode="7460123456796",
                        name="Agua Planeta Azul",
                        brand="Planeta Azul",
                        presentation="16 oz",
                        units_per_case="20",
                    ),
                ]
            )
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], CatalogImport.COMPLETED)
        self.assertEqual(response.data["total_rows"], 2)
        self.assertEqual(response.data["created_products"], 2)
        self.assertEqual(response.data["error_rows"], 0)
        self.assertEqual(MasterProduct.objects.count(), 2)

    def test_imports_valid_excel_file(self):
        response = self.post_import(self.xlsx_file([self.coca_cola_row()]))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["file_format"], CatalogImport.XLSX)
        self.assertEqual(response.data["created_products"], 1)
        product = MasterProduct.objects.get()
        self.assertEqual(product.barcode, "7460123456789")

    def test_semicolon_separated_csv_is_supported(self):
        response = self.post_import(
            self.csv_file([self.coca_cola_row()], delimiter=";")
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(MasterProduct.objects.count(), 1)

    def test_updates_existing_product_by_barcode(self):
        product = MasterProduct.objects.create(
            barcode="7460123456789",
            name="Coca Cola vieja",
            brand="Coca-Cola",
            presentation="12 oz",
            category="Refrescos",
        )

        response = self.post_import(self.csv_file([self.coca_cola_row()]))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["updated_products"], 1)
        self.assertEqual(response.data["created_products"], 0)
        product.refresh_from_db()
        self.assertEqual(product.name, "Coca-Cola")
        self.assertEqual(product.category, "Bebidas")

    def test_unchanged_product_is_counted_without_update(self):
        MasterProduct.objects.create(
            barcode="7460123456789",
            name="Coca-Cola",
            brand="Coca-Cola",
            presentation="12 oz",
            category="Bebidas",
            unit=MasterProduct.UNIT,
            sale_mode=MasterProduct.BY_UNIT,
            units_per_case=24,
            is_active=True,
        )

        response = self.post_import(self.csv_file([self.coca_cola_row()]))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["unchanged_products"], 1)
        self.assertEqual(response.data["updated_products"], 0)

    def test_imports_loose_product_without_barcode(self):
        response = self.post_import(
            self.csv_file(
                [
                    self.coca_cola_row(
                        barcode="",
                        name="Plátano maduro",
                        brand="",
                        presentation="",
                        category="Víveres",
                        unit="libra",
                        sale_mode="por_peso",
                        units_per_case="1",
                    )
                ]
            )
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        product = MasterProduct.objects.get()
        self.assertIsNone(product.barcode)
        self.assertEqual(product.unit, MasterProduct.POUND)
        self.assertEqual(product.sale_mode, MasterProduct.BY_WEIGHT)

    def test_internal_reference_updates_product_without_barcode(self):
        product = MasterProduct.objects.create(
            name="Plátano",
            category="Víveres",
            unit=MasterProduct.POUND,
            sale_mode=MasterProduct.BY_WEIGHT,
        )
        response = self.post_import(
            self.csv_file(
                [
                    self.coca_cola_row(
                        internal_reference=str(product.internal_reference),
                        barcode="",
                        name="Plátano maduro",
                        brand="",
                        presentation="",
                        category="Víveres",
                        unit="libra",
                        sale_mode="por_peso",
                        units_per_case="1",
                    )
                ]
            )
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["updated_products"], 1)
        self.assertEqual(MasterProduct.objects.count(), 1)
        product.refresh_from_db()
        self.assertEqual(product.name, "Plátano maduro")

    def test_invalid_extension_is_rejected_before_import_record(self):
        uploaded_file = SimpleUploadedFile(
            "catalogo.txt",
            b"nombre\nCoca-Cola",
            content_type="text/plain",
        )

        response = self.post_import(uploaded_file)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)
        self.assertEqual(CatalogImport.objects.count(), 0)

    def test_empty_file_is_rejected_before_import_record(self):
        response = self.post_import(
            SimpleUploadedFile("catalogo.csv", b"", content_type="text/csv")
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)
        self.assertEqual(CatalogImport.objects.count(), 0)

    def test_invalid_utf8_csv_fails_safely(self):
        response = self.post_import(
            SimpleUploadedFile(
                "catalogo.csv",
                b"nombre\n\xff\xfe",
                content_type="text/csv",
            )
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["status"], CatalogImport.FAILED)
        self.assertEqual(MasterProduct.objects.count(), 0)

    def test_missing_name_header_fails_safely(self):
        response = self.post_import(
            self.csv_file(
                [("7460123456789", "Coca-Cola")],
                headers=("codigo_barra", "marca"),
            )
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["status"], CatalogImport.FAILED)
        self.assertIn("nombre", response.data["errors"][0]["errors"][0])

    def test_one_invalid_row_prevents_all_products_from_being_saved(self):
        response = self.post_import(
            self.csv_file(
                [
                    self.coca_cola_row(),
                    self.coca_cola_row(
                        barcode="ABC",
                        name="Producto inválido",
                    ),
                ]
            )
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["status"], CatalogImport.FAILED)
        self.assertEqual(MasterProduct.objects.count(), 0)
        self.assertEqual(response.data["created_products"], 0)

    def test_duplicate_barcode_in_file_prevents_entire_import(self):
        response = self.post_import(
            self.csv_file(
                [
                    self.coca_cola_row(),
                    self.coca_cola_row(name="Otro producto"),
                ]
            )
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MasterProduct.objects.count(), 0)
        self.assertIn("repetido", response.data["errors"][0]["errors"][0])

    def test_invalid_unit_prevents_entire_import(self):
        response = self.post_import(
            self.csv_file([self.coca_cola_row(unit="caja rara")])
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MasterProduct.objects.count(), 0)
        self.assertIn("unidad", response.data["errors"][0]["errors"][0])

    def test_invalid_sale_mode_prevents_entire_import(self):
        response = self.post_import(
            self.csv_file([self.coca_cola_row(sale_mode="desconocido")])
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MasterProduct.objects.count(), 0)

    def test_invalid_boolean_prevents_entire_import(self):
        response = self.post_import(
            self.csv_file([self.coca_cola_row(is_active="quizás")])
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MasterProduct.objects.count(), 0)

    def test_invalid_internal_reference_prevents_entire_import(self):
        response = self.post_import(
            self.csv_file(
                [self.coca_cola_row(internal_reference="no-es-un-uuid")]
            )
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(MasterProduct.objects.count(), 0)

    def test_import_history_is_available_to_staff(self):
        upload_response = self.post_import(self.csv_file([self.coca_cola_row()]))

        response = self.client.get(self.import_url)

        self.assertEqual(upload_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(
            response.data[0]["uploaded_by"],
            self.admin_user.id,
        )

    def test_platform_catalog_does_not_allow_hard_delete(self):
        product = MasterProduct.objects.create(
            barcode="7460123456789",
            name="Coca-Cola",
        )

        response = self.client.delete(
            reverse("colmado-platform-catalog-detail", args=(product.id,))
        )

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(MasterProduct.objects.filter(pk=product.pk).exists())
