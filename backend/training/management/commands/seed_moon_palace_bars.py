from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from organisations.models import Organisation
from training.models import Standard, EvaluationTemplate, EvaluationQuestion


TEMPLATE_NAME = "Evaluación Bares – Secuencia de Servicio (PR-AYB-20)"

STANDARDS = [
    {
        "code": "PR-AYB-20-01",
        "title": "Bienvenida y atención inicial",
        "source": "PR-AYB-20 §§ 1.1–1.3",
        "question": "¿Realizó una bienvenida profesional dentro del tiempo establecido?",
        "observe": "Observe el tiempo de reacción y la forma del saludo desde que el huésped llega a la barra o a la mesa.",
        "pass": "Reconoce al huésped antes de 1 minuto en barra o máximo 3 minutos en mesa, mantiene un saludo profesional, utiliza el apellido cuando dispone de él y realiza una bienvenida apropiada al bar.",
        "fail": "Ignora al huésped, supera el tiempo establecido sin atención, usa un saludo inadecuadamente informal o no realiza una bienvenida profesional.",
    },
    {
        "code": "PR-AYB-20-02",
        "title": "Alergias, dietas y restricciones",
        "source": "PR-AYB-20 § 2.1",
        "question": "¿Verificó alergias, dietas especiales o restricciones antes de sugerir?",
        "observe": "Escuche si el cantinero confirma necesidades especiales antes de recomendar bebidas o productos.",
        "pass": "Pregunta de forma cordial por alergias, dietas especiales o restricciones y usa esa información para orientar sus sugerencias.",
        "fail": "Realiza recomendaciones sin verificar posibles alergias, restricciones o necesidades alimenticias especiales.",
    },
    {
        "code": "PR-AYB-20-03",
        "title": "Sugerencias, conocimiento y venta",
        "source": "PR-AYB-20 §§ 3.1–3.3",
        "question": "¿Hizo sugerencias adecuadas y demostró conocimiento del menú?",
        "observe": "Observe si identifica preferencias, explica opciones, responde dudas y propone productos de forma natural.",
        "pass": "Sugiere bebidas según las preferencias del huésped y la oferta disponible, resuelve dudas correctamente y aprovecha oportunidades razonables de venta.",
        "fail": "No orienta al huésped, desconoce la oferta, deja dudas sin resolver o pierde oportunidades claras de sugerencia.",
    },
    {
        "code": "PR-AYB-20-04",
        "title": "Toma y confirmación de la orden",
        "source": "PR-AYB-20 §§ 4.1–4.4",
        "question": "¿Tomó y reconfirmó la orden de manera ordenada y eficiente?",
        "observe": "Observe el orden en que toma la comanda, cómo maneja solicitudes fuera de la oferta, si comunica tiempos y si confirma el pedido antes de proceder.",
        "pass": "Mantiene una secuencia ordenada de toma de orden, busca solución ante solicitudes fuera de la oferta, informa tiempos cuando aplica y reconfirma el pedido.",
        "fail": "Toma la orden de forma desorganizada, niega una solicitud sin buscar alternativa, omite tiempos importantes o procede sin reconfirmar.",
    },
    {
        "code": "PR-AYB-20-05",
        "title": "Servicio de botana seca",
        "source": "PR-AYB-20 § 5.1",
        "question": "¿Ofreció correctamente las opciones de botana seca?",
        "observe": "Verifique si ofrece las variedades disponibles y deja únicamente las seleccionadas por el huésped.",
        "pass": "Presenta las opciones disponibles y coloca en mesa o barra solo las elegidas por el huésped.",
        "fail": "No ofrece las opciones o coloca productos que el huésped no seleccionó.",
    },
    {
        "code": "PR-AYB-20-06",
        "title": "Entrega y presentación de bebidas",
        "source": "PR-AYB-20 §§ 6.1–6.3",
        "question": "¿Entregó y presentó las bebidas conforme al procedimiento?",
        "observe": "Observe tiempo de entrega, uso de charola y, cuando corresponda, presentación de vino y servicio de agua embotellada.",
        "pass": "Entrega las bebidas en charola en un máximo de 3 minutos; cuando aplica, presenta el vino y permite degustación antes de servir; el agua se entrega cerrada y a la temperatura solicitada, con la presentación indicada para servicio en mesa.",
        "fail": "Entrega fuera del tiempo sin explicación, omite la presentación requerida, sirve vino incorrectamente o entrega agua sin respetar el procedimiento.",
    },
    {
        "code": "PR-AYB-20-07",
        "title": "Resurtido y refill de bebidas",
        "source": "PR-AYB-20 §§ 7.1–7.2 y 10.1",
        "question": "¿Se anticipó correctamente al resurtido o refill de bebidas?",
        "observe": "Observe el nivel del vaso o copa y si el cantinero se anticipa antes de que el huésped tenga que pedir otra bebida.",
        "pass": "Cuando la bebida llega aproximadamente a un tercio, ofrece una nueva; en vino de venta mantiene el refill conforme al procedimiento; después de terminar una bebida ofrece reposición dentro de los 3 minutos.",
        "fail": "Deja terminar la bebida sin seguimiento, el huésped debe solicitar el refill o no mantiene el servicio de vino conforme al procedimiento.",
    },
    {
        "code": "PR-AYB-20-08",
        "title": "Visibilidad, retiro y satisfacción",
        "source": "PR-AYB-20 §§ 8.1 y 9.1–9.2",
        "question": "¿Mantuvo visibilidad y atendió correctamente el retiro y la satisfacción?",
        "observe": "Observe postura, atención visual, retiro de platos y momentos de verificación de satisfacción.",
        "pass": "Permanece visible y en postura de servicio, solicita autorización antes de retirar platos y valida la satisfacción sin interrumpir innecesariamente.",
        "fail": "Permanece distraído o fuera de vista, retira sin preguntar o no verifica la satisfacción durante el servicio.",
    },
    {
        "code": "PR-AYB-20-09",
        "title": "Orden y mantenimiento de mesa o barra",
        "source": "PR-AYB-20 § 10.2",
        "question": "¿Mantuvo la mesa o barra limpia, organizada y abastecida durante el servicio?",
        "observe": "Revise continuamente si sobran elementos, faltan insumos o se acumulan objetos que afecten la presentación del área.",
        "pass": "Mantiene el espacio organizado, retira lo innecesario y asegura que estén disponibles los elementos requeridos para continuar el servicio.",
        "fail": "Permite acumulación, desorden, faltantes o condiciones que deterioran la presentación y continuidad del servicio.",
    },
    {
        "code": "PR-AYB-20-10",
        "title": "Despedida y remontaje",
        "source": "PR-AYB-20 §§ 11.1 y 12.1",
        "question": "¿Realizó una despedida cálida y dejó el área lista para el siguiente servicio?",
        "observe": "Observe la última interacción con el huésped y el tiempo/calidad del remontaje.",
        "pass": "Agradece genuinamente, invita al huésped a regresar y realiza el remontaje en un máximo de 5 minutos, usando el menaje correspondiente y de forma discreta.",
        "fail": "No realiza una despedida adecuada o deja la mesa/barra sin remontar, incompleta o fuera del tiempo establecido.",
    },
]


def build_description(item):
    return (
        f"Fuente: {item['source']}\n\n"
        f"QUÉ OBSERVAR\n{item['observe']}\n\n"
        f"CUMPLE CUANDO\n{item['pass']}\n\n"
        f"NO CUMPLE CUANDO\n{item['fail']}"
    )


class Command(BaseCommand):
    help = "Crea o actualiza la plantilla corta de evaluación de Bares PR-AYB-20 para una organización."

    def add_arguments(self, parser):
        parser.add_argument("--organisation-id", type=int, required=True)
        parser.add_argument("--apply", action="store_true")

    def handle(self, *args, **options):
        organisation_id = options["organisation_id"]
        apply_changes = options["apply"]

        try:
            organisation = Organisation.objects.get(pk=organisation_id)
        except Organisation.DoesNotExist as exc:
            raise CommandError(f"No existe una organización con id={organisation_id}.") from exc

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Moon Palace – Plantilla Bares PR-AYB-20"))
        self.stdout.write(
            f"Organización: id={organisation.id} | name='{organisation.name}' | slug='{organisation.slug}'"
        )
        self.stdout.write(f"Modo: {'APPLY' if apply_changes else 'PREVIEW ONLY'}")
        self.stdout.write(f"Plantilla: {TEMPLATE_NAME}")
        self.stdout.write(f"Estándares/preguntas: {len(STANDARDS)}")
        self.stdout.write("Tipo de respuesta: Sí / No")
        self.stdout.write("Outlet: General (aplica a todos los bares)")
        self.stdout.write("")

        for index, item in enumerate(STANDARDS, start=1):
            self.stdout.write(
                f"  {index:02d}. {item['code']} | {item['title']} | {item['question']}"
            )

        if not apply_changes:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    "PREVIEW COMPLETE: no se modificó la base de datos. Ejecuta nuevamente con --apply para crear/actualizar la plantilla."
                )
            )
            return

        with transaction.atomic():
            template, template_created = EvaluationTemplate.objects.update_or_create(
                organisation=organisation,
                name=TEMPLATE_NAME,
                defaults={
                    "description": (
                        "Plantilla corta para observar la secuencia de servicio en bares según el procedimiento PR-AYB-20, versión 01, validado el 22-08-2025. Cada pregunta incluye una guía clara de qué observar, cuándo cumple y cuándo no cumple."
                    ),
                    "outlet": None,
                    "active": True,
                },
            )

            standard_created_count = 0
            standard_updated_count = 0
            question_created_count = 0
            question_updated_count = 0

            for order, item in enumerate(STANDARDS, start=1):
                standard_title = f"{item['code']} | {item['title']}"

                standard, created = Standard.objects.update_or_create(
                    organisation=organisation,
                    title=standard_title,
                    defaults={
                        "category": "beverage",
                        "description": build_description(item),
                        "priority": "medium",
                        "active": True,
                    },
                )
                if created:
                    standard_created_count += 1
                else:
                    standard_updated_count += 1

                _, q_created = EvaluationQuestion.objects.update_or_create(
                    organisation=organisation,
                    template=template,
                    order=order,
                    defaults={
                        "standard": standard,
                        "question": item["question"],
                        "score_type": "yes_no",
                        "weight": 1,
                    },
                )
                if q_created:
                    question_created_count += 1
                else:
                    question_updated_count += 1

            EvaluationQuestion.objects.filter(
                organisation=organisation,
                template=template,
            ).exclude(order__range=(1, len(STANDARDS))).delete()

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Plantilla de Bares creada/actualizada correctamente."))
        self.stdout.write(f"Template: {'created' if template_created else 'updated'}")
        self.stdout.write(
            f"Standards: {standard_created_count} created, {standard_updated_count} updated"
        )
        self.stdout.write(
            f"Questions: {question_created_count} created, {question_updated_count} updated"
        )
        self.stdout.write(
            "Nota: no se crean recovery plans/microtraining porque todavía no se han proporcionado recursos de recuperación."
        )
