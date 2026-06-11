from django.urls import path

from .views import (
    checkout_session_status,
    create_customer_portal_session,
    plans,
    create_checkout_session,
    my_subscription,
)
from .webhooks import stripe_webhook

urlpatterns = [
    path("plans/", plans),
    path("create-checkout-session/", create_checkout_session),
    path("my-subscription/", my_subscription),
    path("webhook/", stripe_webhook),
    path("checkout-session-status/", checkout_session_status),
    path(
    "customer-portal/",
    create_customer_portal_session,
),
]