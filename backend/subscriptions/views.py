import stripe

from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.text import slugify

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from organisations.models import Organisation, Membership,OrganisationBranding
from subscriptions.models import SubscriptionPlan, Subscription
from subscriptions.serializers import (
    SubscriptionPlanSerializer,
    CreateCheckoutSessionSerializer,
    MySubscriptionSerializer,
)

User = get_user_model()

stripe.api_key = settings.STRIPE_SECRET_KEY



@api_view(["GET"])
@permission_classes([AllowAny])
def plans(request):
    subscription_plans = SubscriptionPlan.objects.filter(
        is_active=True,
    ).order_by("price")

    serializer = SubscriptionPlanSerializer(
        subscription_plans,
        many=True,
    )

    return Response(serializer.data)

@api_view(["POST"])
@permission_classes([AllowAny])
def create_checkout_session(request):
    serializer = CreateCheckoutSessionSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data

    company_name = data["company_name"]
    owner_name = data.get("owner_name", "")
    email = data["email"]
    password = data["password"]
    business_type = data.get("business_type") or request.data.get("business_type") or "disco"
    plan_slug = data["plan"]

    app_slug = data.get("app") or request.data.get("app") or business_type or "disco"

    if business_type == "ticketing":
        app_slug = "ticketing"
        default_platform_name = "PCD Experiences"
        default_login_subtitle = (
            "Sign in to manage tours, tickets, transfers, sellers, bookings, "
            "payments, commissions, pickup schedules, and public website settings."
        )
        default_accent_color = "#f59e0b"
    else:
        default_platform_name = "Disco Management"
        default_login_subtitle = (
            "Sign in to manage POS, inventory, tables, staff, reservations, and reports."
        )
        default_accent_color = "#06b6d4"

    branding_data = {
        "company_name": request.data.get("branding_company_name") or company_name,
        "platform_name": request.data.get("platform_name") or default_platform_name,
        "login_title": request.data.get("login_title") or company_name,
        "login_subtitle": request.data.get("login_subtitle") or default_login_subtitle,
        "primary_color": request.data.get("primary_color") or "#020617",
        "secondary_color": request.data.get("secondary_color") or "#0f172a",
        "accent_color": request.data.get("accent_color") or default_accent_color,
    }

    plan = SubscriptionPlan.objects.filter(slug=plan_slug, is_active=True).first()

    if not plan:
        return Response({"detail": "Invalid plan."}, status=status.HTTP_400_BAD_REQUEST)

    if not plan.stripe_price_id:
        return Response(
            {"detail": "Plan is not configured in Stripe."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    slug = slugify(company_name)

    if Organisation.objects.filter(slug=slug).exists():
        return Response(
            {"detail": "Organisation already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email=email).exists():
        return Response(
            {"detail": "Email already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    organisation = Organisation.objects.create(
        name=company_name,
        slug=slug,
        business_type=business_type,
        email=email,
        plan=plan.slug,
        is_active=False,
    )

    OrganisationBranding.objects.create(
        organisation=organisation,
        company_name=branding_data["company_name"],
        platform_name=branding_data["platform_name"],
        login_title=branding_data["login_title"],
        login_subtitle=branding_data["login_subtitle"],
        primary_color=branding_data["primary_color"],
        secondary_color=branding_data["secondary_color"],
        accent_color=branding_data["accent_color"],
    )

    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=owner_name or "",
    )

    Membership.objects.create(
        user=user,
        organisation=organisation,
        role="owner",
        is_active=True,
    )

    subscription = Subscription.objects.create(
        organisation=organisation,
        plan=plan,
        status="trialing",
    )

    stripe_metadata = {
        "organisation_id": str(organisation.id),
        "organisation_slug": organisation.slug,
        "subscription_id": str(subscription.id),
        "user_id": str(user.id),
        "plan_slug": plan.slug,
        "app_slug": app_slug,
        "business_type": business_type,
    }

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=email,
            payment_method_types=["card"],
            line_items=[
                {
                    "price": plan.stripe_price_id,
                    "quantity": 1,
                }
            ],
            success_url=(
                f"{settings.FRONTEND_URL}"
                f"/{app_slug}/subscription/success"
                "?session_id={CHECKOUT_SESSION_ID}"
            ),
            cancel_url=(
                f"{settings.FRONTEND_URL}"
                f"/{app_slug}/subscription/cancel"
            ),
            metadata=stripe_metadata,
            subscription_data={
                "metadata": stripe_metadata,
            },
        )

    except stripe.error.StripeError as exc:
        subscription.delete()
        user.delete()
        organisation.delete()

        return Response(
            {
                "detail": "Could not create Stripe checkout session.",
                "stripe_error": str(exc),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {
            "checkout_url": session.url,
            "organisation_slug": organisation.slug,
            "login_url": f"/{app_slug}/{organisation.slug}/login",
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def checkout_session_status(request):
    session_id = request.query_params.get("session_id")

    if not session_id:
        return Response(
            {"detail": "Session ID is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        session = stripe.checkout.Session.retrieve(session_id)
    except stripe.error.StripeError as exc:
        return Response(
            {"detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    metadata = session.metadata or {}

    organisation_id = (
        metadata["organisation_id"]
        if "organisation_id" in metadata
        else None
    )

    app_slug = (
        metadata["app_slug"]
        if "app_slug" in metadata
        else "disco"
    )

    if not organisation_id:
        return Response(
            {"detail": "Organisation ID missing from checkout session."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    organisation = Organisation.objects.filter(id=organisation_id).first()

    if not organisation:
        return Response(
            {"detail": "Organisation not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response({
        "payment_status": session.payment_status,
        "organisation_name": organisation.name,
        "organisation_slug": organisation.slug,
        "app_slug": app_slug,
        "login_url": f"/{app_slug}/{organisation.slug}/login",
        "is_active": organisation.is_active,
    })

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_subscription(request):
    membership = (
        Membership.objects
        .filter(
            user=request.user,
            is_active=True,
        )
        .select_related(
            "organisation",
            "organisation__subscription",
            "organisation__subscription__plan",
        )
        .first()
    )

    if not membership:
        return Response(
            {"detail": "No organisation found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    organisation = membership.organisation

    if not hasattr(organisation, "subscription"):
        return Response(
            {"detail": "No subscription found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = MySubscriptionSerializer(organisation.subscription)

    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_customer_portal_session(request):
    membership = (
        Membership.objects
        .filter(user=request.user, is_active=True)
        .select_related(
            "organisation",
            "organisation__subscription",
        )
        .first()
    )

    if not membership:
        return Response(
            {"detail": "No organisation found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    organisation = membership.organisation

    if not hasattr(organisation, "subscription"):
        return Response(
            {"detail": "No subscription found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    subscription = organisation.subscription

    if not subscription.stripe_customer_id:
        return Response(
            {"detail": "Stripe customer not found."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        portal_session = stripe.billing_portal.Session.create(
            customer=subscription.stripe_customer_id,
            return_url=(
                f"{settings.FRONTEND_URL}"
                f"/disco/{organisation.slug}/billing-locked"
            ),
        )
    except stripe.error.StripeError as exc:
        return Response(
            {
                "detail": "Could not open billing portal.",
                "stripe_error": str(exc),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({"portal_url": portal_session.url})