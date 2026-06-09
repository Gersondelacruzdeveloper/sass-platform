from django.urls import path

from .views import (
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
]