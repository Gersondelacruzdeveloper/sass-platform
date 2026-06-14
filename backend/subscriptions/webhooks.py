import stripe

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
import logging

from subscriptions.models import Subscription
logger = logging.getLogger(__name__)

stripe.api_key = settings.STRIPE_SECRET_KEY

ACTIVE_STATUSES = ["active", "trialing"]


def stripe_get(obj, key, default=None):
    try:
        return obj[key]
    except Exception:
        return getattr(obj, key, default)


def stripe_metadata(obj):
    metadata = stripe_get(obj, "metadata", None)

    if not metadata:
        return {}

    try:
        return dict(metadata)
    except Exception:
        return metadata


def timestamp_to_datetime(value):
    if not value:
        return None

    return timezone.datetime.fromtimestamp(
        value,
        tz=timezone.get_current_timezone(),
    )


def set_organisation_access(subscription):
    organisation = subscription.organisation
    organisation.is_active = subscription.status in ACTIVE_STATUSES
    organisation.plan = subscription.plan.slug
    organisation.save(update_fields=["is_active", "plan"])


def update_subscription_from_stripe(stripe_subscription):
    stripe_subscription_id = stripe_get(stripe_subscription, "id")
    status = stripe_get(stripe_subscription, "status")

    subscription = (
        Subscription.objects
        .select_related("organisation", "plan")
        .filter(stripe_subscription_id=stripe_subscription_id)
        .first()
    )

    if not subscription:
        return

    subscription.status = status
    subscription.cancel_at_period_end = stripe_get(
        stripe_subscription,
        "cancel_at_period_end",
        False,
    )

    current_period_start = timestamp_to_datetime(
        stripe_get(stripe_subscription, "current_period_start")
    )
    current_period_end = timestamp_to_datetime(
        stripe_get(stripe_subscription, "current_period_end")
    )

    if current_period_start:
        subscription.current_period_start = current_period_start

    if current_period_end:
        subscription.current_period_end = current_period_end

    subscription.save()
    set_organisation_access(subscription)


@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")
    event_type = event["type"]
    data = event["data"]["object"]
    logger.info("Received Stripe webhook: %s", event_type)

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except ValueError:
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError:
        return HttpResponse(status=400)

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        metadata = stripe_metadata(data)
        logger.info("CHECKOUT SESSION METADATA: %s", metadata)
        logger.info("ORG ID: %s | SUB ID: %s", organisation_id, subscription_id)
        logger.info("STRIPE CUSTOMER: %s | STRIPE SUB: %s", stripe_customer_id, stripe_subscription_id)

        organisation_id = metadata.get("organisation_id")
        subscription_id = metadata.get("subscription_id")

        stripe_customer_id = stripe_get(data, "customer")
        stripe_subscription_id = stripe_get(data, "subscription")

        subscription = (
            Subscription.objects
            .select_related("organisation", "plan")
            .filter(
                id=subscription_id,
                organisation_id=organisation_id,
            )
            .first()
        )

    if subscription:
        subscription.stripe_customer_id = stripe_customer_id
        subscription.stripe_subscription_id = stripe_subscription_id

        if stripe_subscription_id:
            stripe_sub = stripe.Subscription.retrieve(stripe_subscription_id)
            subscription.status = stripe_sub.status
        else:
            subscription.status = "active"

        subscription.save()
        set_organisation_access(subscription)

    elif event_type in [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ]:
        update_subscription_from_stripe(data)

    elif event_type == "invoice.payment_succeeded":
        stripe_subscription_id = stripe_get(data, "subscription")

        subscription = (
            Subscription.objects
            .select_related("organisation", "plan")
            .filter(stripe_subscription_id=stripe_subscription_id)
            .first()
        )

        if subscription:
            subscription.status = "active"
            subscription.save(update_fields=["status"])
            set_organisation_access(subscription)

    elif event_type == "invoice.payment_failed":
        stripe_subscription_id = stripe_get(data, "subscription")

        subscription = (
            Subscription.objects
            .select_related("organisation", "plan")
            .filter(stripe_subscription_id=stripe_subscription_id)
            .first()
        )

        if subscription:
            subscription.status = "past_due"
            subscription.save(update_fields=["status"])
            set_organisation_access(subscription)

    return HttpResponse(status=200)