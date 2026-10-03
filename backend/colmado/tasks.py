import logging

from celery import shared_task
from django.db.models import Q

from colmado.integrations.open_food_facts import (
    OpenFoodFactsError,
    download_master_product_image,
)
from colmado.models import MasterProduct


logger = logging.getLogger(__name__)


DEFAULT_IMAGE_BATCH_SIZE = 10
MAX_IMAGE_BATCH_SIZE = 10
NEXT_BATCH_DELAY_SECONDS = 60


@shared_task(
    bind=True,
    name="colmado.sync_master_product_images",
)
def sync_master_product_images(
    self,
    *,
    after_id=0,
    batch_size=DEFAULT_IMAGE_BATCH_SIZE,
):
    """
    Download missing master-product images in controlled batches.

    Each batch processes at most ten products and schedules the next batch
    after one minute. This avoids overwhelming Open Food Facts and prevents
    one missing product from blocking the complete catalog.
    """

    try:
        normalized_after_id = max(int(after_id), 0)
    except (TypeError, ValueError):
        normalized_after_id = 0

    try:
        normalized_batch_size = int(batch_size)
    except (TypeError, ValueError):
        normalized_batch_size = DEFAULT_IMAGE_BATCH_SIZE

    normalized_batch_size = max(
        1,
        min(
            normalized_batch_size,
            MAX_IMAGE_BATCH_SIZE,
        ),
    )

    products = list(
        MasterProduct.objects.filter(
            pk__gt=normalized_after_id,
            barcode__isnull=False,
            is_active=True,
        )
        .exclude(barcode="")
        .filter(
            Q(image="")
            | Q(image__isnull=True)
        )
        .order_by("pk")[:normalized_batch_size]
    )

    summary = {
        "processed": 0,
        "downloaded": 0,
        "not_found": 0,
        "failed": 0,
        "next_after_id": None,
        "next_batch_scheduled": False,
    }

    for product in products:
        summary["processed"] += 1
        summary["next_after_id"] = product.pk

        try:
            downloaded = download_master_product_image(
                product,
            )

            if downloaded:
                summary["downloaded"] += 1
        except OpenFoodFactsError as exc:
            summary["not_found"] += 1

            logger.info(
                (
                    "No se pudo obtener una fotografía automática "
                    "para MasterProduct %s: %s"
                ),
                product.pk,
                exc,
            )
        except Exception:
            summary["failed"] += 1

            logger.exception(
                (
                    "Error inesperado descargando la fotografía "
                    "de MasterProduct %s."
                ),
                product.pk,
            )

    if len(products) == normalized_batch_size:
        sync_master_product_images.apply_async(
            kwargs={
                "after_id": products[-1].pk,
                "batch_size": normalized_batch_size,
            },
            countdown=NEXT_BATCH_DELAY_SECONDS,
        )

        summary["next_batch_scheduled"] = True

    return summary