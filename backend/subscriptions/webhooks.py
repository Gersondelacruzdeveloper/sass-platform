import stripe

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt

from subscriptions.models import Subscription


stripe.api_key = settings.STRIPE_SECRET_KEY


ACTIVE_STATUSES = ["active", "trialing"]


def update_subscription_from_stripe(stripe_subscription):
    stripe_subscription_id = stripe_subscription.get("id")
    status = stripe_subscription.get("status")

    subscription = (
        Subscription.objects
        .select_related("organisation", "plan")
        .filter(stripe_subscription_id=stripe_subscription_id)
        .first()
    )

    if not subscription:
        return

    subscription.status = status
    subscription.cancel_at_period_end = stripe_subscription.get(
        "cancel_at_period_end",
        False,
    )

    current_period_start = stripe_subscription.get("current_period_start")
    current_period_end = stripe_subscription.get("current_period_end")

    if current_period_start:
        subscription.current_period_start = timezone.datetime.fromtimestamp(
            current_period_start,
            tz=timezone.get_current_timezone(),
        )

    if current_period_end:
        subscription.current_period_end = timezone.datetime.fromtimestamp(
            current_period_end,
            tz=timezone.get_current_timezone(),
        )

    subscription.save()

    organisation = subscription.organisation
    organisation.is_active = status in ACTIVE_STATUSES
    organisation.plan = subscription.plan.slug
    organisation.save(update_fields=["is_active", "plan"])


@csrf_exempt
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get("HTTP_STRIPE_SIGNATURE")

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
        organisation_id = data.get("metadata", {}).get("organisation_id")
        subscription_id = data.get("metadata", {}).get("subscription_id")
        stripe_customer_id = data.get("customer")
        stripe_subscription_id = data.get("subscription")

        subscription = (
            Subscription.objects
            .select_related("organisation", "plan")
            .filter(id=subscription_id, organisation_id=organisation_id)
            .first()
        )

        if subscription:
            subscription.stripe_customer_id = stripe_customer_id
            subscription.stripe_subscription_id = stripe_subscription_id
            subscription.status = "active"
            subscription.save()

            organisation = subscription.organisation
            organisation.is_active = True
            organisation.plan = subscription.plan.slug
            organisation.save(update_fields=["is_active", "plan"])

    elif event_type in [
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ]:
        update_subscription_from_stripe(data)

    elif event_type == "invoice.payment_succeeded":
        stripe_subscription_id = data.get("subscription")

        subscription = (
            Subscription.objects
            .select_related("organisation", "plan")
            .filter(stripe_subscription_id=stripe_subscription_id)
            .first()
        )

        if subscription:
            subscription.status = "active"
            subscription.save(update_fields=["status"])

            organisation = subscription.organisation
            organisation.is_active = True
            organisation.save(update_fields=["is_active"])

    elif event_type == "invoice.payment_failed":
        stripe_subscription_id = data.get("subscription")

        subscription = (
            Subscription.objects
            .select_related("organisation")
            .filter(stripe_subscription_id=stripe_subscription_id)
            .first()
        )

        if subscription:
            subscription.status = "past_due"
            subscription.save(update_fields=["status"])

            organisation = subscription.organisation
            organisation.is_active = False
            organisation.save(update_fields=["is_active"])

    return HttpResponse(status=200)