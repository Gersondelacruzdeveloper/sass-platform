from decimal import Decimal

from django.db import migrations


COLMADO_PLAN_SLUG = "colmado-completo"


def create_or_update_colmado_plan(apps, schema_editor):
    SubscriptionPlan = apps.get_model(
        "subscriptions",
        "SubscriptionPlan",
    )

    plan, _created = SubscriptionPlan.objects.get_or_create(
        slug=COLMADO_PLAN_SLUG,
        defaults={
            "name": "Plan Completo",
            "price": Decimal("19.00"),
            "currency": "USD",
            "interval": "monthly",
            "max_users": 10,
            "max_employees": 30,
            "max_modules": 3,
            "is_active": True,
        },
    )

    # Actualizamos la oferta comercial, pero conservamos cualquier
    # stripe_price_id que ya haya sido configurado en este ambiente.
    plan.name = "Plan Completo"
    plan.price = Decimal("19.00")
    plan.currency = "USD"
    plan.interval = "monthly"
    plan.max_users = 10
    plan.max_employees = 30
    plan.max_modules = 3
    plan.is_active = True
    plan.save(
        update_fields=(
            "name",
            "price",
            "currency",
            "interval",
            "max_users",
            "max_employees",
            "max_modules",
            "is_active",
        )
    )


def preserve_colmado_plan_on_reverse(apps, schema_editor):
    # No eliminamos un plan al revertir porque podría estar relacionado
    # con suscripciones o pagos reales. Preservar datos es la reversión segura.
    pass


class Migration(migrations.Migration):
    dependencies = [
        (
            "subscriptions",
            "0002_subscriptionplan_max_employees",
        ),
    ]

    operations = [
        migrations.RunPython(
            create_or_update_colmado_plan,
            preserve_colmado_plan_on_reverse,
        ),
    ]
