import time
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from colmado.catalog_source_images import (
    CatalogSourceImageError,
    iter_catalog_image_rows,
    save_product_source_image,
)
from colmado.models import MasterProduct


class Command(BaseCommand):
    help = (
        "Descarga las imágenes indicadas en imagen_url_origen y guarda "
        "una copia permanente en MasterProduct.image."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "workbook",
            help="Ruta del archivo .xlsx que contiene la hoja Productos.",
        )
        parser.add_argument(
            "--start-row",
            type=int,
            default=2,
            help="Primera fila de Excel que se procesará. Predeterminado: 2.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help=(
                "Cantidad máxima de productos sin foto que se intentarán. "
                "Use 0 para procesarlos todos."
            ),
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.10,
            help=(
                "Pausa en segundos entre descargas para no sobrecargar "
                "el servidor de origen. Predeterminado: 0.10."
            ),
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Comprueba las coincidencias sin descargar ni guardar imágenes.",
        )
        parser.add_argument(
            "--progress-every",
            type=int,
            default=50,
            help="Muestra el progreso cada N productos intentados.",
        )

    def handle(self, *args, **options):
        workbook_path = Path(options["workbook"]).expanduser().resolve()
        if not workbook_path.is_file():
            raise CommandError(f"No existe el archivo: {workbook_path}")
        if workbook_path.suffix.lower() != ".xlsx":
            raise CommandError("El archivo debe tener extensión .xlsx.")

        start_row = max(options["start_row"], 2)
        limit = max(options["limit"], 0)
        delay = max(options["delay"], 0.0)
        progress_every = max(options["progress_every"], 1)
        dry_run = options["dry_run"]

        products = list(
            MasterProduct.objects.only(
                "id",
                "barcode",
                "internal_reference",
                "image",
            ).order_by("id")
        )
        products_by_barcode = {
            product.barcode: product
            for product in products
            if product.barcode
        }
        products_by_reference = {
            str(product.internal_reference).lower(): product
            for product in products
        }

        summary = {
            "excel_rows": 0,
            "matched": 0,
            "attempted": 0,
            "downloaded": 0,
            "existing_image": 0,
            "product_not_found": 0,
            "invalid_or_unavailable": 0,
            "unexpected_errors": 0,
        }

        self.stdout.write(
            self.style.MIGRATE_HEADING(
                f"Procesando imágenes desde: {workbook_path.name}"
            )
        )
        self.stdout.write(
            f"Productos disponibles en la plataforma: {len(products)}"
        )
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "Modo de prueba: no se descargarán ni guardarán imágenes."
                )
            )

        try:
            rows = iter_catalog_image_rows(workbook_path)
            for row in rows:
                if row.row_number < start_row:
                    continue

                summary["excel_rows"] += 1
                product = None
                if row.barcode:
                    product = products_by_barcode.get(row.barcode)
                if product is None and row.internal_reference:
                    product = products_by_reference.get(
                        row.internal_reference.lower()
                    )

                if product is None:
                    summary["product_not_found"] += 1
                    continue

                summary["matched"] += 1
                if product.image:
                    summary["existing_image"] += 1
                    continue

                if limit and summary["attempted"] >= limit:
                    break

                summary["attempted"] += 1
                if dry_run:
                    if summary["attempted"] % progress_every == 0:
                        self._show_progress(summary, row.row_number, dry_run=True)
                    continue

                try:
                    saved = save_product_source_image(
                        product,
                        row.image_url,
                    )
                    if saved:
                        summary["downloaded"] += 1
                except CatalogSourceImageError as exc:
                    summary["invalid_or_unavailable"] += 1
                    self.stderr.write(
                        self.style.WARNING(
                            f"Fila {row.row_number}: {exc}"
                        )
                    )
                except Exception as exc:
                    summary["unexpected_errors"] += 1
                    self.stderr.write(
                        self.style.ERROR(
                            f"Fila {row.row_number}: error inesperado: {exc}"
                        )
                    )

                if summary["attempted"] % progress_every == 0:
                    self._show_progress(summary, row.row_number)
                if delay:
                    time.sleep(delay)
        except CatalogSourceImageError as exc:
            raise CommandError(str(exc)) from exc

        self._show_summary(summary, dry_run=dry_run)

    def _show_progress(self, summary, row_number, dry_run=False):
        action = "coincidencias" if dry_run else "descargas"
        self.stdout.write(
            (
                f"Progreso — fila {row_number}: "
                f"{summary['attempted']} {action} intentadas, "
                f"{summary['downloaded']} imágenes guardadas."
            )
        )

    def _show_summary(self, summary, *, dry_run):
        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Resumen"))
        self.stdout.write(f"Filas con URL revisadas: {summary['excel_rows']}")
        self.stdout.write(f"Productos encontrados: {summary['matched']}")
        self.stdout.write(f"Productos intentados: {summary['attempted']}")
        self.stdout.write(f"Ya tenían imagen: {summary['existing_image']}")
        self.stdout.write(
            f"Productos no encontrados: {summary['product_not_found']}"
        )

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(
                    "Comprobación terminada. No se modificó ningún producto."
                )
            )
            return

        self.stdout.write(
            self.style.SUCCESS(
                f"Imágenes guardadas en la plataforma: {summary['downloaded']}"
            )
        )
        self.stdout.write(
            f"Imágenes inválidas o no disponibles: "
            f"{summary['invalid_or_unavailable']}"
        )
        self.stdout.write(
            f"Errores inesperados: {summary['unexpected_errors']}"
        )
