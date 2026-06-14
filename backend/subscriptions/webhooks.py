import logging
import stripe

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

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
        return metadata.to_dict()
    except Exception:
        pass

    try:
        return dict(metadata)
    except Exception:
        return {}


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

    update_fields = ["is_active"]

    if subscription.plan:
        organisation.plan = subscription.plan.slug
        update_fields.append("plan")

    organisation.save(update_fields=update_fields)


def update_subscription_from_stripe(stripe_subscription):
    stripe_subscription_id = stripe_get(stripe_subscription, "id")
    status_value = stripe_get(stripe_subscription, "status")

    metadata = stripe_metadata(stripe_subscription)
    subscription_id = metadata.get("subscription_id")
    organisation_id = metadata.get("organisation_id")

    logger.info(
        "Stripe subscription event | stripe_subscription_id=%s | status=%s | metadata=%s",
        stripe_subscription_id,
        status_value,
        metadata,
    )

    subscription = (
        Subscription.objects
        .select_related("organisation", "plan")
        .filter(stripe_subscription_id=stripe_subscription_id)
        .first()
    )

    if not subscription and subscription_id and organisation_id:
        subscription = (
            Subscription.objects
            .select_related("organisation", "plan")
            .filter(id=subscription_id, organisation_id=organisation_id)
            .first()
        )

    if not subscription:
        logger.warning("No local subscription found for Stripe subscription.")
        return

    subscription.stripe_subscription_id = stripe_subscription_id
    subscription.status = status_value or subscription.status
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

    logger.info("========== STRIPE WEBHOOK START ==========")
    logger.info("Webhook payload length: %s", len(payload))
    logger.info("Stripe signature exists: %s", bool(sig_header))

    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            settings.STRIPE_WEBHOOK_SECRET,
        )
    except ValueError as exc:
        logger.exception("Stripe webhook invalid payload: %s", exc)
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError as exc:
        logger.exception("Stripe webhook invalid signature: %s", exc)
        return HttpResponse(status=400)

    try:
        event_type = event["type"]
        data = event["data"]["object"]

        logger.info("Received Stripe webhook: %s", event_type)
        logger.info("Stripe event id: %s", stripe_get(event, "id"))
        logger.info("Stripe object id: %s", stripe_get(data, "id"))
        logger.info("Stripe object metadata: %s", stripe_metadata(data))

        if event_type == "checkout.session.completed":
            metadata = stripe_metadata(data)

            organisation_id = metadata.get("organisation_id")
            subscription_id = metadata.get("subscription_id")

            stripe_customer_id = stripe_get(data, "customer")
            stripe_subscription_id = stripe_get(data, "subscription")

            logger.info("Checkout organisation_id: %s", organisation_id)
            logger.info("Checkout subscription_id: %s", subscription_id)
            logger.info("Checkout stripe_customer_id: %s", stripe_customer_id)
            logger.info("Checkout stripe_subscription_id: %s", stripe_subscription_id)

            subscription = (
                Subscription.objects
                .select_related("organisation", "plan")
                .filter(id=subscription_id, organisation_id=organisation_id)
                .first()
            )

            logger.info("Local subscription found by metadata: %s", bool(subscription))

            if not subscription and stripe_subscription_id:
                subscription = (
                    Subscription.objects
                    .select_related("organisation", "plan")
                    .filter(stripe_subscription_id=stripe_subscription_id)
                    .first()
                )

                logger.info("Local subscription found by stripe id: %s", bool(subscription))

            if subscription:
                logger.info(
                    "Before update | local_sub_id=%s | org_slug=%s | old_status=%s | old_customer=%s | old_stripe_sub=%s",
                    subscription.id,
                    subscription.organisation.slug,
                    subscription.status,
                    subscription.stripe_customer_id,
                    subscription.stripe_subscription_id,
                )

                subscription.stripe_customer_id = stripe_customer_id
                subscription.stripe_subscription_id = stripe_subscription_id

                if stripe_subscription_id:
                    try:
                        stripe_sub = stripe.Subscription.retrieve(stripe_subscription_id)
                        subscription.status = stripe_get(stripe_sub, "status", "active")
                        logger.info("Retrieved Stripe subscription status: %s", subscription.status)
                    except Exception as exc:
                        logger.exception("Could not retrieve Stripe subscription: %s", exc)
                        subscription.status = "active"
                else:
                    subscription.status = "active"

                subscription.save()
                set_organisation_access(subscription)

                logger.info(
                    "After update | local_sub_id=%s | org_slug=%s | new_status=%s | org_active=%s",
                    subscription.id,
                    subscription.organisation.slug,
                    subscription.status,
                    subscription.organisation.is_active,
                )
            else:
                logger.warning("No local subscription found for checkout.session.completed.")

        elif event_type in [
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
        ]:
            logger.info("Sending event to update_subscription_from_stripe")
            update_subscription_from_stripe(data)

        elif event_type == "invoice.payment_succeeded":
            stripe_subscription_id = stripe_get(data, "subscription")
            logger.info("invoice.payment_succeeded stripe_subscription_id: %s", stripe_subscription_id)

            subscription = (
                Subscription.objects
                .select_related("organisation", "plan")
                .filter(stripe_subscription_id=stripe_subscription_id)
                .first()
            )

            logger.info("Invoice local subscription found: %s", bool(subscription))

            if subscription:
                subscription.status = "active"
                subscription.save(update_fields=["status"])
                set_organisation_access(subscription)
                logger.info("Invoice activated organisation: %s", subscription.organisation.slug)

        elif event_type == "invoice.payment_failed":
            stripe_subscription_id = stripe_get(data, "subscription")
            logger.info("invoice.payment_failed stripe_subscription_id: %s", stripe_subscription_id)

            subscription = (
                Subscription.objects
                .select_related("organisation", "plan")
                .filter(stripe_subscription_id=stripe_subscription_id)
                .first()
            )

            logger.info("Payment failed local subscription found: %s", bool(subscription))

            if subscription:
                subscription.status = "past_due"
                subscription.save(update_fields=["status"])
                set_organisation_access(subscription)
                logger.info("Payment failed deactivated organisation: %s", subscription.organisation.slug)

        logger.info("========== STRIPE WEBHOOK END OK ==========")
        return HttpResponse(status=200)

    except Exception as exc:
        logger.exception("STRIPE WEBHOOK CRASHED: %s", exc)
        return HttpResponse(status=500)