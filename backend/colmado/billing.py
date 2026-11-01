import stripe

from django.conf import settings

from colmado.models import Store
from subscriptions.models import Subscription


stripe.api_key = settings.STRIPE_SECRET_KEY


class ColmadoBillingError(Exception):
    """Raised when the branch quantity cannot be synchronized with Stripe."""


def _stripe_value(value, key, default=None):
    """Read a Stripe field from either an object or dictionary response."""

    if isinstance(value, dict):
        return value.get(key, default)

    return getattr(value, key, default)


def _subscription_item_id(stripe_subscription):
    items_container = _stripe_value(stripe_subscription, "items")
    items = _stripe_value(items_container, "data", []) if items_container else []

    if len(items) != 1:
        raise ColmadoBillingError(
            "La suscripción debe tener exactamente un producto facturable."
        )

    item_id = _stripe_value(items[0], "id")
    if not item_id:
        raise ColmadoBillingError(
            "Stripe no devolvió el identificador del producto de la suscripción."
        )

    return item_id


def sync_colmado_subscription_quantity(organisation):
    """Set Stripe quantity to the organisation's exact active-store count."""

    subscription = (
        Subscription.objects
        .filter(organisation=organisation)
        .first()
    )

    # Older or manually-created organisations may not be connected to Stripe.
    if subscription is None or not subscription.stripe_subscription_id:
        return None

    active_store_count = Store.objects.filter(
        organisation=organisation,
        is_active=True,
    ).count()

    # A paid colmado subscription always bills for at least one branch.
    quantity = max(active_store_count, 1)

    try:
        stripe_subscription = stripe.Subscription.retrieve(
            subscription.stripe_subscription_id,
        )
        item_id = _subscription_item_id(stripe_subscription)

        stripe.Subscription.modify(
            subscription.stripe_subscription_id,
            items=[
                {
                    "id": item_id,
                    "quantity": quantity,
                }
            ],
            proration_behavior="create_prorations",
        )
    except ColmadoBillingError:
        raise
    except stripe.error.StripeError as exc:
        raise ColmadoBillingError(
            "No se pudo actualizar la cantidad de sucursales en Stripe."
        ) from exc

    return quantity
