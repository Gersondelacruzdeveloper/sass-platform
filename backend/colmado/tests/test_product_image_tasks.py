from unittest.mock import patch

from django.test import TestCase

from colmado.integrations.open_food_facts import (
    ProductNotFoundError,
)
from colmado.models import MasterProduct
from colmado.tasks import sync_master_product_images


DOWNLOAD_FUNCTION_PATH = (
    "colmado.tasks.download_master_product_image"
)


class MasterProductImageTaskTests(TestCase):
    def create_product(
        self,
        number,
        *,
        barcode=True,
        image="",
        is_active=True,
    ):
        product_barcode = None

        if barcode:
            product_barcode = f"7500000000{number:03d}"

        return MasterProduct.objects.create(
            barcode=product_barcode,
            name=f"Producto {number}",
            brand="Marca de prueba",
            presentation="1 unidad",
            category="Pruebas",
            unit=MasterProduct.UNIT,
            sale_mode=MasterProduct.BY_UNIT,
            units_per_case=1,
            image=image,
            is_active=is_active,
        )

    @patch(DOWNLOAD_FUNCTION_PATH)
    def test_downloads_images_for_eligible_products(
        self,
        download_image,
    ):
        first_product = self.create_product(1)
        second_product = self.create_product(2)

        download_image.return_value = True

        result = sync_master_product_images(
            after_id=0,
            batch_size=10,
        )

        self.assertEqual(
            result["processed"],
            2,
        )
        self.assertEqual(
            result["downloaded"],
            2,
        )
        self.assertEqual(
            result["not_found"],
            0,
        )
        self.assertEqual(
            result["failed"],
            0,
        )
        self.assertFalse(
            result["next_batch_scheduled"],
        )
        self.assertEqual(
            result["next_after_id"],
            second_product.pk,
        )

        self.assertEqual(
            download_image.call_count,
            2,
        )

        processed_products = {
            call.args[0].pk
            for call in download_image.call_args_list
        }

        self.assertEqual(
            processed_products,
            {
                first_product.pk,
                second_product.pk,
            },
        )

    @patch(DOWNLOAD_FUNCTION_PATH)
    def test_ignores_products_that_do_not_need_download(
        self,
        download_image,
    ):
        eligible_product = self.create_product(1)

        self.create_product(
            2,
            image="colmado/products/existing.jpg",
        )
        self.create_product(
            3,
            barcode=False,
        )
        self.create_product(
            4,
            is_active=False,
        )

        download_image.return_value = True

        result = sync_master_product_images(
            after_id=0,
            batch_size=10,
        )

        self.assertEqual(
            result["processed"],
            1,
        )
        self.assertEqual(
            result["downloaded"],
            1,
        )

        download_image.assert_called_once()

        processed_product = download_image.call_args.args[0]

        self.assertEqual(
            processed_product.pk,
            eligible_product.pk,
        )

    @patch(DOWNLOAD_FUNCTION_PATH)
    def test_continues_when_provider_does_not_have_product(
        self,
        download_image,
    ):
        first_product = self.create_product(1)
        second_product = self.create_product(2)

        download_image.side_effect = [
            ProductNotFoundError(
                "El producto no fue encontrado."
            ),
            True,
        ]

        result = sync_master_product_images(
            after_id=0,
            batch_size=10,
        )

        self.assertEqual(
            result["processed"],
            2,
        )
        self.assertEqual(
            result["downloaded"],
            1,
        )
        self.assertEqual(
            result["not_found"],
            1,
        )
        self.assertEqual(
            result["failed"],
            0,
        )
        self.assertEqual(
            result["next_after_id"],
            second_product.pk,
        )

        self.assertEqual(
            download_image.call_args_list[0].args[0].pk,
            first_product.pk,
        )
        self.assertEqual(
            download_image.call_args_list[1].args[0].pk,
            second_product.pk,
        )

    @patch(DOWNLOAD_FUNCTION_PATH)
    def test_continues_after_unexpected_product_error(
        self,
        download_image,
    ):
        self.create_product(1)
        self.create_product(2)

        download_image.side_effect = [
            RuntimeError("Unexpected internal failure"),
            True,
        ]

        with self.assertLogs(
            "colmado.tasks",
            level="ERROR",
        ):
            result = sync_master_product_images(
                after_id=0,
                batch_size=10,
            )

        self.assertEqual(
            result["processed"],
            2,
        )
        self.assertEqual(
            result["downloaded"],
            1,
        )
        self.assertEqual(
            result["failed"],
            1,
        )
        self.assertEqual(
            download_image.call_count,
            2,
        )

    @patch(DOWNLOAD_FUNCTION_PATH)
    def test_schedules_next_batch_after_ten_products(
        self,
        download_image,
    ):
        products = [
            self.create_product(number)
            for number in range(1, 12)
        ]

        download_image.return_value = True

        with patch.object(
            sync_master_product_images,
            "apply_async",
        ) as apply_async:
            result = sync_master_product_images(
                after_id=0,
                batch_size=50,
            )

        self.assertEqual(
            result["processed"],
            10,
        )
        self.assertEqual(
            result["downloaded"],
            10,
        )
        self.assertTrue(
            result["next_batch_scheduled"],
        )
        self.assertEqual(
            result["next_after_id"],
            products[9].pk,
        )

        apply_async.assert_called_once_with(
            kwargs={
                "after_id": products[9].pk,
                "batch_size": 10,
            },
            countdown=60,
        )

    @patch(DOWNLOAD_FUNCTION_PATH)
    def test_cursor_processes_only_products_after_selected_id(
        self,
        download_image,
    ):
        first_product = self.create_product(1)
        second_product = self.create_product(2)
        third_product = self.create_product(3)

        download_image.return_value = True

        result = sync_master_product_images(
            after_id=first_product.pk,
            batch_size=10,
        )

        self.assertEqual(
            result["processed"],
            2,
        )

        processed_products = [
            call.args[0].pk
            for call in download_image.call_args_list
        ]

        self.assertEqual(
            processed_products,
            [
                second_product.pk,
                third_product.pk,
            ],
        )

    @patch(DOWNLOAD_FUNCTION_PATH)
    def test_normalizes_invalid_task_arguments(
        self,
        download_image,
    ):
        self.create_product(1)
        self.create_product(2)

        download_image.return_value = True

        result = sync_master_product_images(
            after_id="invalid",
            batch_size=0,
        )

        self.assertEqual(
            result["processed"],
            1,
        )
        self.assertEqual(
            result["downloaded"],
            1,
        )