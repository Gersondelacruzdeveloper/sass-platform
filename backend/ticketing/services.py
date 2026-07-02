from decimal import Decimal
import json
import os
import uuid
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

from django.conf import settings
from django.db import transaction
from django.db.models import Avg, Count, Sum, Q
from django.utils import timezone

from .models import (
    TicketingSettings,
    TicketingPublicSiteSettings,
    ExperienceProduct,
    ProductPickupSchedule,
    PickupLocation,
    Customer,
    Seller,
    Booking,
    BookingItem,
    BookingPickupInfo,
    BookingPayment,
    SellerCommission,
    Receipt,
    NotificationLog,
    ExternalProviderConfig,
    ExternalProviderProductSnapshot,
    ProductReview,
)


ZERO = Decimal("0.00")


def money(value):
    """
    Normalize numbers to Decimal for financial calculations.
    """
    if value is None or value == "":
        return ZERO

    if isinstance(value, Decimal):
        return value

    return Decimal(str(value))


def get_ticketing_settings(organisation):
    settings_obj, created = TicketingSettings.objects.get_or_create(
        organisation=organisation,
        defaults={
            "module_name": "Tours, Tickets & Transfers",
            "public_brand_name": "PCD Experiences",
        },
    )
    return settings_obj


def get_public_site_settings(organisation):
    site_settings, created = TicketingPublicSiteSettings.objects.get_or_create(
        organisation=organisation,
        defaults={
            "site_title": organisation.name,
            "public_email": organisation.email,
            "public_whatsapp": organisation.phone,
        },
    )
    return site_settings


def resolve_pickup_schedule(product, pickup_location, service_date):
    """
    Resolve the automatic pickup schedule.

    Priority:
    1. Product + pickup location + exact date
    2. Product + pickup location + day of week
    3. Product + pickup location + generic schedule
    """

    if not product or not pickup_location or not service_date:
        return None

    schedules = ProductPickupSchedule.objects.filter(
        product=product,
        pickup_location=pickup_location,
        is_active=True,
    ).filter(
        Q(specific_date=service_date)
        | Q(day_of_week=service_date.weekday(), specific_date__isnull=True)
        | Q(day_of_week__isnull=True, specific_date__isnull=True)
    )

    exact_date_schedule = schedules.filter(
        specific_date=service_date,
    ).first()

    if exact_date_schedule:
        return exact_date_schedule

    day_schedule = schedules.filter(
        day_of_week=service_date.weekday(),
        specific_date__isnull=True,
    ).first()

    if day_schedule:
        return day_schedule

    return schedules.filter(
        day_of_week__isnull=True,
        specific_date__isnull=True,
    ).first()


def create_or_update_pickup_info(
    booking,
    pickup_location=None,
    pickup_location_id=None,
    override_time=None,
    override_point=None,
    override_instructions=None,
    override_reason="",
    overridden_by=None,
):
    """
    Create or update BookingPickupInfo.

    Normal flow:
    product/date/location -> automatic pickup time.

    Override flow:
    admin/supervisor can pass override values.
    """

    organisation = booking.organisation

    if not pickup_location and pickup_location_id:
        pickup_location = PickupLocation.objects.filter(
            id=pickup_location_id,
            organisation=organisation,
        ).first()

    if not pickup_location:
        return None

    schedule = resolve_pickup_schedule(
        product=booking.primary_product,
        pickup_location=pickup_location,
        service_date=booking.service_date,
    )

    pickup_info, created = BookingPickupInfo.objects.get_or_create(
        booking=booking,
        defaults={
            "pickup_location": pickup_location,
            "hotel_or_location_name": pickup_location.name,
            "pickup_zone_name": pickup_location.zone.name if pickup_location.zone else "",
            "pickup_point": pickup_location.default_pickup_point,
            "instructions": pickup_location.default_instructions,
        },
    )

    pickup_info.pickup_location = pickup_location
    pickup_info.hotel_or_location_name = pickup_location.name
    pickup_info.pickup_zone_name = pickup_location.zone.name if pickup_location.zone else ""

    if schedule:
        pickup_info.apply_schedule(schedule)
    else:
        pickup_info.pickup_schedule = None
        pickup_info.pickup_point = pickup_location.default_pickup_point
        pickup_info.instructions = pickup_location.default_instructions

    if override_time or override_point or override_instructions:
        pickup_info.was_overridden = True
        pickup_info.override_reason = override_reason
        pickup_info.overridden_by = overridden_by

        if override_time:
            pickup_info.pickup_time = override_time

        if override_point:
            pickup_info.pickup_point = override_point

        if override_instructions:
            pickup_info.instructions = override_instructions

    pickup_info.save()

    return pickup_info


def calculate_booking_items_total(booking):
    totals = booking.items.aggregate(
        subtotal=Sum("total"),
    )

    return money(totals.get("subtotal"))


def calculate_booking_cost_total(booking):
    total = ZERO

    for item in booking.items.all():
        total += money(item.unit_cost) * item.quantity

    return total


def calculate_booking_paid_total(booking):
    paid_amount = ZERO

    for payment in booking.payments.filter(status="confirmed"):
        if payment.payment_type == "refund":
            paid_amount -= money(payment.amount)
        else:
            paid_amount += money(payment.amount)

    return max(paid_amount, ZERO)


def calculate_seller_collected_total(booking):
    collected = ZERO

    for payment in booking.payments.filter(status="confirmed"):
        if payment.seller:
            if payment.payment_type == "refund":
                collected -= money(payment.amount)
            else:
                collected += money(payment.amount)

    return max(collected, ZERO)


def calculate_seller_commission_amount(booking):
    if not booking.seller:
        return ZERO

    seller = booking.seller

    if seller.fixed_commission_amount > ZERO:
        return money(seller.fixed_commission_amount)

    if seller.commission_rate > ZERO:
        return (money(booking.subtotal_amount) * money(seller.commission_rate)) / Decimal("100.00")

    return ZERO


def calculate_deposit_required(booking):
    if booking.deposit_required > ZERO:
        return money(booking.deposit_required)

    product = booking.primary_product

    if not product:
        return ZERO

    if product.deposit_amount > ZERO:
        return money(product.deposit_amount)

    if product.deposit_percentage > ZERO:
        return (money(booking.total_amount) * money(product.deposit_percentage)) / Decimal("100.00")

    settings_obj = get_ticketing_settings(booking.organisation)

    if settings_obj.default_deposit_percentage > ZERO:
        return (money(booking.total_amount) * money(settings_obj.default_deposit_percentage)) / Decimal("100.00")

    return ZERO


@transaction.atomic
def recalculate_booking_financials(booking, save=True):
    """
    Recalculate booking totals, payment status, seller commission,
    seller owed amount, and commission row.
    """

    items_subtotal = calculate_booking_items_total(booking)

    if items_subtotal > ZERO:
        booking.subtotal_amount = items_subtotal

    booking.total_amount = (
        money(booking.subtotal_amount)
        - money(booking.discount_amount)
        + money(booking.tax_amount)
    )

    if booking.total_amount < ZERO:
        booking.total_amount = ZERO

    booking.deposit_required = calculate_deposit_required(booking)
    booking.deposit_paid = calculate_booking_paid_total(booking)
    booking.balance_due = max(
        money(booking.total_amount) - money(booking.deposit_paid),
        ZERO,
    )

    booking.seller_collected_amount = calculate_seller_collected_total(booking)
    booking.seller_commission_amount = calculate_seller_commission_amount(booking)

    booking.seller_due_to_company = max(
        money(booking.seller_collected_amount) - money(booking.seller_commission_amount),
        ZERO,
    )

    if booking.deposit_paid >= booking.total_amount and booking.total_amount > ZERO:
        booking.payment_status = "paid"
        if booking.status in ["draft", "pending_payment"]:
            booking.status = "confirmed"

    elif booking.deposit_required > ZERO and booking.deposit_paid >= booking.deposit_required:
        booking.payment_status = "deposit_paid"
        if booking.status in ["draft", "pending_payment"]:
            booking.status = "confirmed"

    elif booking.deposit_paid > ZERO:
        booking.payment_status = "partially_paid"
        if booking.status in ["draft", "pending_payment"]:
            booking.status = "confirmed"

    elif booking.payment_mode == "pending_payment":
        booking.payment_status = "pending"

    else:
        booking.payment_status = "unpaid"

    if save:
        booking.save()

    create_or_update_seller_commission(booking)
    update_seller_totals(booking.seller)
    update_customer_totals(booking.customer)
    update_product_booking_counts(booking.primary_product)

    return booking


def create_or_update_seller_commission(booking):
    if not booking.seller:
        return None

    if booking.seller_commission_amount <= ZERO:
        SellerCommission.objects.filter(booking=booking).delete()
        return None

    commission, created = SellerCommission.objects.get_or_create(
        organisation=booking.organisation,
        seller=booking.seller,
        booking=booking,
        defaults={
            "amount": booking.seller_commission_amount,
            "rate_used": booking.seller.commission_rate,
            "status": "pending",
        },
    )

    if not created and commission.status != "paid":
        commission.amount = booking.seller_commission_amount
        commission.rate_used = booking.seller.commission_rate
        commission.save(update_fields=["amount", "rate_used"])

    return commission


def update_seller_totals(seller):
    if not seller:
        return None

    totals = Booking.objects.filter(
        seller=seller,
    ).exclude(
        status__in=["cancelled", "refunded"],
    ).aggregate(
        sales_total=Sum("total_amount"),
        commission_total=Sum("seller_commission_amount"),
        collected_total=Sum("seller_collected_amount"),
        owed_total=Sum("seller_due_to_company"),
    )

    seller.total_sales_amount = money(totals.get("sales_total"))
    seller.total_commission_amount = money(totals.get("commission_total"))
    seller.total_collected_amount = money(totals.get("collected_total"))
    seller.total_owed_to_company = money(totals.get("owed_total"))
    seller.save(
        update_fields=[
            "total_sales_amount",
            "total_commission_amount",
            "total_collected_amount",
            "total_owed_to_company",
            "updated_at",
        ]
    )

    return seller


def update_customer_totals(customer):
    if not customer:
        return None

    totals = Booking.objects.filter(
        customer=customer,
    ).exclude(
        status__in=["cancelled", "refunded"],
    ).aggregate(
        bookings_count=Count("id"),
        spent_total=Sum("total_amount"),
    )

    customer.total_bookings = totals.get("bookings_count") or 0
    customer.total_spent = money(totals.get("spent_total"))
    customer.save(update_fields=["total_bookings", "total_spent", "updated_at"])

    return customer


def update_product_booking_counts(product):
    if not product:
        return None

    booking_count = BookingItem.objects.filter(
        product=product,
    ).exclude(
        booking__status__in=["cancelled", "refunded"],
    ).aggregate(
        quantity=Sum("quantity"),
    )["quantity"] or 0

    review_stats = ProductReview.objects.filter(
        product=product,
        is_public=True,
        is_approved=True,
    ).aggregate(
        average_rating=Avg("rating"),
        review_count=Count("id"),
    )

    product.booking_count = booking_count
    product.average_rating = review_stats.get("average_rating") or ZERO
    product.review_count = review_stats.get("review_count") or 0
    product.save(
        update_fields=[
            "booking_count",
            "average_rating",
            "review_count",
            "updated_at",
        ]
    )

    return product


@transaction.atomic
def add_booking_payment(
    booking,
    amount,
    payment_type="partial",
    payer_type="customer",
    method="cash",
    status_value="confirmed",
    seller=None,
    collected_by=None,
    reference="",
    note="",
):
    payment = BookingPayment.objects.create(
        booking=booking,
        seller=seller,
        collected_by=collected_by,
        amount=money(amount),
        payment_type=payment_type,
        payer_type=payer_type,
        method=method,
        status=status_value,
        reference=reference,
        note=note,
    )

    recalculate_booking_financials(booking)

    return payment


def get_or_create_booking_customer(booking):
    if booking.customer:
        return booking.customer

    customer = Customer.objects.create(
        organisation=booking.organisation,
        full_name=booking.customer_name,
        whatsapp=booking.customer_whatsapp,
        email=booking.customer_email,
        hotel_name=booking.customer_hotel,
        notes=booking.customer_notes,
    )

    booking.customer = customer
    booking.save(update_fields=["customer", "updated_at"])

    return customer


def build_receipt_data(booking):
    pickup_data = None

    if hasattr(booking, "pickup_info"):
        pickup_data = {
            "hotel_or_location_name": booking.pickup_info.hotel_or_location_name,
            "pickup_zone_name": booking.pickup_info.pickup_zone_name,
            "pickup_time": str(booking.pickup_info.pickup_time) if booking.pickup_info.pickup_time else None,
            "pickup_point": booking.pickup_info.pickup_point,
            "instructions": booking.pickup_info.instructions,
            "was_overridden": booking.pickup_info.was_overridden,
        }

    return {
        "booking_code": booking.booking_code,
        "status": booking.status,
        "payment_status": booking.payment_status,
        "payment_mode": booking.payment_mode,
        "payment_method": booking.payment_method,
        "customer": {
            "name": booking.customer_name,
            "whatsapp": booking.customer_whatsapp,
            "email": booking.customer_email,
            "hotel": booking.customer_hotel,
            "notes": booking.customer_notes,
        },
        "seller": {
            "id": booking.seller_id,
            "name": booking.seller.full_name if booking.seller else "",
            "slug": booking.seller.seller_slug if booking.seller else "",
        },
        "service": {
            "date": str(booking.service_date) if booking.service_date else None,
            "time": str(booking.service_time) if booking.service_time else None,
            "total_guests": booking.total_guests,
            "adults": booking.adults,
            "children": booking.children,
            "infants": booking.infants,
        },
        "pickup": pickup_data,
        "amounts": {
            "subtotal": str(booking.subtotal_amount),
            "discount": str(booking.discount_amount),
            "tax": str(booking.tax_amount),
            "total": str(booking.total_amount),
            "deposit_required": str(booking.deposit_required),
            "deposit_paid": str(booking.deposit_paid),
            "balance_due": str(booking.balance_due),
            "seller_collected_amount": str(booking.seller_collected_amount),
            "seller_due_to_company": str(booking.seller_due_to_company),
            "seller_commission_amount": str(booking.seller_commission_amount),
        },
        "transfer": {
            "origin": booking.transfer_origin,
            "destination": booking.transfer_destination,
            "airport": booking.transfer_airport,
            "flight_number": booking.transfer_flight_number,
            "vehicle_type": booking.transfer_vehicle_type,
            "round_trip": booking.transfer_round_trip,
            "return_date": str(booking.transfer_return_date) if booking.transfer_return_date else None,
            "return_time": str(booking.transfer_return_time) if booking.transfer_return_time else None,
            "status": booking.transfer_status,
            "driver_name": booking.driver_name,
            "driver_phone": booking.driver_phone,
        },
        "items": [
            {
                "product_name": item.product_name,
                "product_type": item.product_type,
                "quantity": item.quantity,
                "unit_price": str(item.unit_price),
                "unit_cost": str(item.unit_cost),
                "total": str(item.total),
                "service_date": str(item.service_date) if item.service_date else None,
                "service_time": str(item.service_time) if item.service_time else None,
                "instructions": item.instructions,
            }
            for item in booking.items.all()
        ],
        "created_at": booking.created_at.isoformat() if booking.created_at else None,
    }


def create_or_update_receipt(booking):
    receipt_data = build_receipt_data(booking)

    receipt, created = Receipt.objects.get_or_create(
        booking=booking,
        defaults={
            "receipt_number": f"R-{uuid.uuid4().hex[:8].upper()}",
            "public_url_token": uuid.uuid4().hex,
            "receipt_data": receipt_data,
        },
    )

    if not created:
        receipt.receipt_data = receipt_data
        receipt.save(update_fields=["receipt_data"])

    return receipt


def build_customer_confirmation_message(booking):
    lines = [
        f"Booking confirmation: {booking.booking_code}",
        f"Customer: {booking.customer_name}",
    ]

    if booking.primary_product:
        lines.append(f"Product: {booking.primary_product.name}")

    if booking.service_date:
        lines.append(f"Date: {booking.service_date}")

    if booking.service_time:
        lines.append(f"Time: {booking.service_time}")

    if hasattr(booking, "pickup_info"):
        pickup = booking.pickup_info

        if pickup.pickup_time:
            lines.append(f"Pickup time: {pickup.pickup_time}")

        if pickup.pickup_point:
            lines.append(f"Pickup point: {pickup.pickup_point}")

        if pickup.instructions:
            lines.append(f"Pickup instructions: {pickup.instructions}")

    lines.extend(
        [
            f"Total: {booking.total_amount}",
            f"Deposit paid: {booking.deposit_paid}",
            f"Balance due: {booking.balance_due}",
            f"Payment status: {booking.payment_status}",
        ]
    )

    return "\n".join(lines)


def log_notification(
    organisation,
    channel,
    recipient,
    booking=None,
    subject="",
    message="",
    status_value="pending",
    provider_response=None,
):
    notification = NotificationLog.objects.create(
        organisation=organisation,
        booking=booking,
        channel=channel,
        recipient=recipient,
        subject=subject,
        message=message,
        status=status_value,
        provider_response=provider_response or {},
        sent_at=timezone.now() if status_value == "sent" else None,
    )

    return notification


def queue_booking_confirmation_notifications(booking):
    """
    Placeholder notification queue.

    This creates logs only. Later you can connect SendGrid, Gmail API,
    Twilio, Meta WhatsApp Cloud API, WATI, or another provider.
    """

    settings_obj = get_ticketing_settings(booking.organisation)
    message = build_customer_confirmation_message(booking)

    logs = []

    if settings_obj.send_customer_email and booking.customer_email:
        logs.append(
            log_notification(
                organisation=booking.organisation,
                booking=booking,
                channel="email",
                recipient=booking.customer_email,
                subject=f"Booking confirmation {booking.booking_code}",
                message=message,
                status_value="pending",
            )
        )

    if settings_obj.send_customer_whatsapp and booking.customer_whatsapp:
        logs.append(
            log_notification(
                organisation=booking.organisation,
                booking=booking,
                channel="whatsapp",
                recipient=booking.customer_whatsapp,
                subject=f"Booking confirmation {booking.booking_code}",
                message=message,
                status_value="pending",
            )
        )

    if settings_obj.notify_owner_on_booking:
        owner_recipient = booking.organisation.email or ""
        if owner_recipient:
            logs.append(
                log_notification(
                    organisation=booking.organisation,
                    booking=booking,
                    channel="email",
                    recipient=owner_recipient,
                    subject=f"New booking {booking.booking_code}",
                    message=message,
                    status_value="pending",
                )
            )

    return logs


@transaction.atomic
def finalize_booking_after_create(booking, pickup_location_id=None):
    """
    Main helper after a booking is created.

    Use this later from serializers/views to keep logic centralized.
    """

    get_or_create_booking_customer(booking)
    recalculate_booking_financials(booking)

    if pickup_location_id:
        create_or_update_pickup_info(
            booking=booking,
            pickup_location_id=pickup_location_id,
        )

    receipt = create_or_update_receipt(booking)
    queue_booking_confirmation_notifications(booking)

    return {
        "booking": booking,
        "receipt": receipt,
    }


def build_product_json_ld(product):
    data = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.name,
        "description": product.short_description or product.meta_description,
        "sku": product.sku,
        "image": product.image.url if product.image else "",
        "offers": {
            "@type": "Offer",
            "price": str(product.base_price),
            "availability": "https://schema.org/InStock",
        },
    }

    if product.average_rating and product.review_count:
        data["aggregateRating"] = {
            "@type": "AggregateRating",
            "ratingValue": str(product.average_rating),
            "reviewCount": product.review_count,
        }

    if product.json_ld_override:
        data.update(product.json_ld_override)

    return data


def build_event_json_ld(product):
    data = {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": product.name,
        "description": product.short_description or product.meta_description,
        "location": {
            "@type": "Place",
            "name": product.location,
            "address": product.address,
        },
        "offers": {
            "@type": "Offer",
            "price": str(product.base_price),
            "availability": "https://schema.org/InStock",
        },
    }

    if product.event_start_datetime:
        data["startDate"] = product.event_start_datetime.isoformat()

    if product.event_end_datetime:
        data["endDate"] = product.event_end_datetime.isoformat()

    if product.image:
        data["image"] = product.image.url

    if product.json_ld_override:
        data.update(product.json_ld_override)

    return data


def build_product_seo_payload(product):
    if product.product_type == "event":
        json_ld = build_event_json_ld(product)
    else:
        json_ld = build_product_json_ld(product)

    return {
        "title": product.seo_title or product.name,
        "meta_description": product.meta_description or product.short_description,
        "canonical_url": product.canonical_url,
        "og_title": product.og_title or product.seo_title or product.name,
        "og_description": product.og_description or product.meta_description or product.short_description,
        "twitter_title": product.twitter_title or product.seo_title or product.name,
        "twitter_description": product.twitter_description or product.meta_description or product.short_description,
        "image_alt_text": product.image_alt_text or product.name,
        "keywords_tags": product.keywords_tags,
        "json_ld": json_ld,
    }


class WelletClient:
    """
    Backend-only Wellet / Coco Bongo client.

    Important:
    - The frontend must never call Wellet directly.
    - Endpoint paths are configurable through ExternalProviderConfig.extra_settings
      because the final Wellet API paths can differ by account/environment.

    For the current Wellet products endpoint, use this config:
    api_base_url = "https://api2.wellet.fun/products/get"
    show_id = "4"
    category_id = "1"
    currency = "USD"
    lang = "en"
    include_table = True

    Recommended extra_settings for this endpoint:
    {
        "products_path": "",
        "availability_path": "",
        "booking_path": "",
        "product_param": "",
        "api_key_header": "Authorization",
        "api_key_prefix": "Bearer"
    }
    """

    def __init__(self, config):
        self.config = config

    def is_ready(self):
        return bool(self.config and self.config.is_enabled and self.config.api_base_url)

    def get_extra(self, key, default=None):
        extra_settings = self.config.extra_settings or {}
        return extra_settings.get(key, default)

    def build_url(self, path="", query_params=None):
        base_url = self.config.api_base_url.rstrip("/")
        path = (path or "").strip("/")

        if path:
            url = f"{base_url}/{path}"
        else:
            url = base_url

        query_params = query_params or {}
        clean_params = {
            key: value
            for key, value in query_params.items()
            if value not in [None, ""]
        }

        if clean_params:
            return f"{url}?{urlencode(clean_params)}"

        return url

    def build_default_query_params(self, service_date=None, external_product_id=""):
        """
        Wellet expects camelCase query parameters.

        Final URL example:
        https://api2.wellet.fun/products/get?showId=4&date=2026-07-01&currency=USD&lang=en&includeTable=true&categoryId=1
        """
        query_params = {
            "showId": self.config.show_id,
            "date": str(service_date) if service_date else None,
            "currency": self.config.currency or "USD",
            "lang": self.config.lang or "en",
            "includeTable": "true" if self.config.include_table else "false",
            "categoryId": self.config.category_id,
        }

        # Keep this optional. For the Wellet URL you gave me, no product param is needed.
        # If Wellet later gives a product-specific endpoint, set extra_settings.product_param.
        product_param = self.get_extra("product_param", "")

        if external_product_id and product_param:
            query_params[product_param] = external_product_id

        return query_params

    def build_headers(self):
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        if self.config.api_key:
            api_key_header = self.get_extra("api_key_header", "Authorization")
            api_key_prefix = self.get_extra("api_key_prefix", "Bearer")

            if api_key_header.lower() == "authorization" and api_key_prefix:
                headers[api_key_header] = f"{api_key_prefix} {self.config.api_key}"
            else:
                headers[api_key_header] = self.config.api_key

        if self.config.api_secret:
            secret_header = self.get_extra("api_secret_header", "")
            if secret_header:
                headers[secret_header] = self.config.api_secret

        extra_headers = self.get_extra("headers", {})
        if isinstance(extra_headers, dict):
            headers.update(extra_headers)

        return headers

    def request(self, method="GET", path="", query_params=None, payload=None, timeout=20):
        if not self.is_ready():
            return {
                "ok": False,
                "status_code": None,
                "data": None,
                "error": "Wellet config is missing or disabled.",
            }

        url = self.build_url(path=path, query_params=query_params)
        headers = self.build_headers()
        body = None

        if payload is not None:
            body = json.dumps(payload, default=str).encode("utf-8")

        safe_headers = {
            key: ("***" if key.lower() in ["authorization", "x-api-key", "api-key"] else value)
            for key, value in headers.items()
        }

        print("\n================ WELLET BACKEND REQUEST ================", flush=True)
        print("METHOD:", method.upper(), flush=True)
        print("URL:", url, flush=True)
        print("QUERY PARAMS:", query_params or {}, flush=True)
        print("HEADERS:", safe_headers, flush=True)
        if payload is not None:
            print("PAYLOAD:", payload, flush=True)
        print("========================================================\n", flush=True)

        request = Request(
            url,
            data=body,
            headers=headers,
            method=method.upper(),
        )

        try:
            with urlopen(request, timeout=timeout) as response:
                response_body = response.read().decode("utf-8")
                data = json.loads(response_body) if response_body else {}

                print("\n================ WELLET BACKEND RESPONSE ================", flush=True)
                print("STATUS:", response.status, flush=True)
                print("URL:", url, flush=True)
                print("BODY PREVIEW:", response_body[:1000], flush=True)
                print("=========================================================\n", flush=True)

                return {
                    "ok": True,
                    "status_code": response.status,
                    "data": data,
                    "error": "",
                    "url": url,
                }

        except HTTPError as error:
            try:
                error_body = error.read().decode("utf-8")
                error_data = json.loads(error_body) if error_body else {}
            except Exception:
                error_data = error_body if "error_body" in locals() else ""

            print("\n================ WELLET BACKEND HTTP ERROR ================", flush=True)
            print("STATUS:", error.code, flush=True)
            print("URL:", url, flush=True)
            print("ERROR:", error_data, flush=True)
            print("===========================================================\n", flush=True)

            return {
                "ok": False,
                "status_code": error.code,
                "data": error_data,
                "error": str(error),
                "url": url,
            }

        except URLError as error:
            print("\n================ WELLET BACKEND URL ERROR ================", flush=True)
            print("URL:", url, flush=True)
            print("ERROR:", str(error), flush=True)
            print("==========================================================\n", flush=True)

            return {
                "ok": False,
                "status_code": None,
                "data": None,
                "error": str(error),
                "url": url,
            }

        except Exception as error:
            print("\n================ WELLET BACKEND UNKNOWN ERROR ================", flush=True)
            print("URL:", url, flush=True)
            print("ERROR:", str(error), flush=True)
            print("==============================================================\n", flush=True)

            return {
                "ok": False,
                "status_code": None,
                "data": None,
                "error": str(error),
                "url": url,
            }

    def list_products(self, service_date=None, timeout=20):
        products_path = self.get_extra("products_path", "")
        query_params = self.build_default_query_params(service_date=service_date)

        return self.request(
            method="GET",
            path=products_path,
            query_params=query_params,
            timeout=timeout,
        )

    def get_availability(self, external_product_id="", service_date=None, timeout=20):
        availability_path = self.get_extra("availability_path", "")

        query_params = self.build_default_query_params(
            service_date=service_date,
            external_product_id=external_product_id,
        )

        return self.request(
            method="GET",
            path=availability_path,
            query_params=query_params,
            timeout=timeout,
        )

    def create_booking_order(self, payload, timeout=30):
        booking_path = self.get_extra("booking_path", "")

        if not booking_path:
            return {
                "ok": False,
                "status_code": None,
                "data": None,
                "error": "Wellet booking/order endpoint is not configured yet.",
                "skipped": True,
            }

        return self.request(
            method="POST",
            path=booking_path,
            payload=payload,
            timeout=timeout,
        )


def get_wellet_config(organisation):
    settings_obj = get_ticketing_settings(organisation)

    if not settings_obj.wellet_enabled:
        return None

    return ExternalProviderConfig.objects.filter(
        organisation=organisation,
        provider="wellet",
        is_enabled=True,
    ).first()


def fetch_wellet_products(organisation, service_date=None):
    config = get_wellet_config(organisation)

    if not config:
        return {
            "ok": False,
            "data": None,
            "error": "Wellet is not configured or not enabled for this organisation.",
        }

    client = WelletClient(config)
    return client.list_products(service_date=service_date)


def fetch_wellet_availability(organisation, product=None, service_date=None):
    config = get_wellet_config(organisation)

    if not config:
        return {
            "ok": False,
            "data": None,
            "error": "Wellet is not configured or not enabled for this organisation.",
        }

    external_product_id = ""

    if product:
        external_product_id = product.external_product_id or ""

    client = WelletClient(config)

    return client.get_availability(
        external_product_id=external_product_id,
        service_date=service_date,
    )


def extract_wellet_items(data):
    """
    Supports common provider shapes:
    - {"products": [...]}
    - {"items": [...]}
    - {"data": [...]}
    - {"data": {"items": [...]}}
    - direct list
    """

    if isinstance(data, list):
        return data

    if not isinstance(data, dict):
        return []

    for key in ["products", "items", "tickets", "options", "availability"]:
        value = data.get(key)
        if isinstance(value, list):
            return value

    nested_data = data.get("data")

    if isinstance(nested_data, list):
        return nested_data

    if isinstance(nested_data, dict):
        for key in ["products", "items", "tickets", "options", "availability"]:
            value = nested_data.get(key)
            if isinstance(value, list):
                return value

    return []


def first_value(data, keys, default=""):
    if not isinstance(data, dict):
        return default

    for key in keys:
        value = data.get(key)

        if value not in [None, ""]:
            return value

    return default


def normalize_bool_available(item):
    if not isinstance(item, dict):
        return True

    sold_out_value = first_value(
        item,
        ["sold_out", "soldOut", "is_sold_out", "isSoldOut"],
        None,
    )

    if sold_out_value in [True, "true", "True", 1, "1"]:
        return False

    available_value = first_value(
        item,
        ["available", "is_available", "isAvailable", "enabled", "active"],
        None,
    )

    if available_value in [False, "false", "False", 0, "0"]:
        return False

    status_value = str(
        first_value(item, ["status", "availability_status", "availabilityStatus"], "")
    ).lower()

    if status_value in ["sold_out", "soldout", "unavailable", "inactive", "closed"]:
        return False

    return True


def normalize_available_quantity(item):
    quantity = first_value(
        item,
        [
            "available_quantity",
            "availableQuantity",
            "availability",
            "remaining",
            "remaining_quantity",
            "remainingQuantity",
            "stock",
            "capacity",
        ],
        None,
    )

    if quantity in [None, ""]:
        return None

    try:
        return int(quantity)
    except Exception:
        return None


def normalize_price(item):
    price = first_value(
        item,
        [
            "price",
            "amount",
            "total",
            "sale_price",
            "salePrice",
            "public_price",
            "publicPrice",
            "unit_price",
            "unitPrice",
        ],
        ZERO,
    )

    return money(price)


def normalize_wellet_availability(data, service_date=None, product=None):
    """
    Returns clean SaaS fields for React.

    Supports the real Wellet Coco Bongo response shape:
    data.options[].products[].prices[]

    Also keeps the generic provider parser as fallback.
    """

    def clean_text(value):
        return str(value or "").replace("\xa0", " ").strip()

    def clean_bool(value):
        return value in [True, "true", "True", 1, "1"]

    def get_wellet_price(product_item):
        prices = product_item.get("prices") or []

        if isinstance(prices, list) and prices:
            first_price = prices[0] or {}

            amount = first_value(
                first_price,
                ["amount", "amountWithoutDiscount", "price", "salePrice", "unitPrice"],
                ZERO,
            )

            currency = first_value(
                first_price,
                ["currencyCode", "currency", "Currency"],
                "USD",
            )

            return money(amount), currency, first_price

        amount = first_value(
            product_item,
            ["price", "amount", "salePrice", "unitPrice"],
            ZERO,
        )

        currency = first_value(
            product_item,
            ["currencyCode", "currency", "Currency"],
            "USD",
        )

        return money(amount), currency, {}

    normalized_options = []

    # Real Wellet Coco Bongo shape: data.options[].products[].prices[]
    if isinstance(data, dict) and isinstance(data.get("options"), list):
        for performance_group in data.get("options") or []:
            if not isinstance(performance_group, dict):
                continue

            performance = performance_group.get("performance") or {}
            products = performance_group.get("products") or []

            if not isinstance(products, list):
                continue

            performance_id = clean_text(performance.get("id"))
            performance_time = clean_text(
                performance.get("timeStart")
                or performance.get("time")
                or performance.get("startTime")
            )
            performance_end_time = clean_text(
                performance.get("timeEnd")
                or performance.get("endTime")
            )
            checkin_time = clean_text(performance.get("timeCheckIn"))
            performance_active = performance.get("isActive", True)

            for wellet_product in products:
                if not isinstance(wellet_product, dict):
                    continue

                product_id = clean_text(wellet_product.get("id"))
                option_name = clean_text(wellet_product.get("name"))
                description = clean_text(wellet_product.get("description"))
                features = wellet_product.get("features") or []

                price, currency, raw_price = get_wellet_price(wellet_product)

                available_quantity = normalize_available_quantity(wellet_product)
                if available_quantity is None:
                    available_quantity = normalize_available_quantity(
                        {
                            "available_quantity": first_value(
                                wellet_product,
                                ["itemsAvailable", "stock"],
                                None,
                            )
                        }
                    )

                is_sold_out = clean_bool(wellet_product.get("isSoldOut"))
                is_unavailable = clean_bool(wellet_product.get("isUnavailable"))

                available = (
                    performance_active is not False
                    and not is_sold_out
                    and not is_unavailable
                    and (available_quantity is None or int(available_quantity) > 0)
                )

                external_availability_id = (
                    f"{performance_id}:{product_id}"
                    if performance_id and product_id
                    else product_id
                )

                normalized_options.append(
                    {
                        "provider": "wellet",
                        "external_product_id": product_id,
                        "external_variant_id": product_id,
                        "external_availability_id": external_availability_id,
                        "performance_id": performance_id,
                        "name": product.name if product else "Coco Bongo",
                        "option_name": option_name or description or "Ticket option",
                        "description": description,
                        "features": features if isinstance(features, list) else [],
                        "price": str(price),
                        "currency": currency or "USD",
                        "available": available,
                        "available_quantity": available_quantity,
                        "sold_out": not available,
                        "service_date": str(service_date) if service_date else "",
                        "start_time": performance_time,
                        "end_time": performance_end_time,
                        "checkin_time": checkin_time,
                        "high_demand": bool(wellet_product.get("highDemand")),
                        "seat_distribution_image_url": clean_text(
                            wellet_product.get("seatDistributionImgUrl")
                        ),
                        "max_pax_capacity": wellet_product.get("maxPaxCapacity"),
                        "raw": {
                            "performance": performance,
                            "product": wellet_product,
                            "price": raw_price,
                        },
                    }
                )

        if normalized_options:
            return normalized_options

    # Generic fallback for other providers / other Wellet shapes.
    items = extract_wellet_items(data)
    normalized_options = []

    response_currency = "USD"

    if isinstance(data, dict):
        response_currency = data.get("currency") or data.get("Currency") or "USD"

    for item in items:
        if not isinstance(item, dict):
            continue

        nested_options = (
            item.get("options")
            or item.get("variants")
            or item.get("tickets")
            or item.get("prices")
            or []
        )

        base_external_product_id = str(
            first_value(
                item,
                [
                    "id",
                    "product_id",
                    "productId",
                    "external_id",
                    "externalId",
                    "sku",
                    "code",
                ],
                "",
            )
        )

        base_name = str(
            first_value(
                item,
                ["name", "title", "product_name", "productName", "description"],
                product.name if product else "",
            )
        ).strip()

        base_currency = first_value(item, ["currency", "Currency"], response_currency)

        if nested_options and isinstance(nested_options, list):
            for option in nested_options:
                if not isinstance(option, dict):
                    continue

                external_product_id = str(
                    first_value(
                        option,
                        [
                            "product_id",
                            "productId",
                            "external_product_id",
                            "externalProductId",
                        ],
                        base_external_product_id,
                    )
                )

                external_variant_id = str(
                    first_value(
                        option,
                        [
                            "id",
                            "variant_id",
                            "variantId",
                            "ticket_id",
                            "ticketId",
                            "option_id",
                            "optionId",
                            "sku",
                            "code",
                        ],
                        "",
                    )
                )

                external_availability_id = str(
                    first_value(
                        option,
                        [
                            "availability_id",
                            "availabilityId",
                            "inventory_id",
                            "inventoryId",
                        ],
                        "",
                    )
                )

                option_name = str(
                    first_value(
                        option,
                        ["name", "title", "label", "option_name", "optionName"],
                        base_name,
                    )
                ).strip()

                raw_option = {
                    "parent": item,
                    "option": option,
                }

                available_quantity = normalize_available_quantity(option)
                available = normalize_bool_available(option)

                normalized_options.append(
                    {
                        "provider": "wellet",
                        "external_product_id": external_product_id or base_external_product_id,
                        "external_variant_id": external_variant_id,
                        "external_availability_id": external_availability_id,
                        "name": base_name,
                        "option_name": option_name,
                        "price": str(normalize_price(option)),
                        "currency": first_value(option, ["currency", "Currency"], base_currency),
                        "available": available,
                        "available_quantity": available_quantity,
                        "sold_out": not available,
                        "service_date": str(service_date) if service_date else "",
                        "start_time": first_value(option, ["start_time", "startTime", "time"], ""),
                        "end_time": first_value(option, ["end_time", "endTime"], ""),
                        "raw": raw_option,
                    }
                )

            continue

        available_quantity = normalize_available_quantity(item)
        available = normalize_bool_available(item)

        normalized_options.append(
            {
                "provider": "wellet",
                "external_product_id": base_external_product_id,
                "external_variant_id": str(
                    first_value(
                        item,
                        ["variant_id", "variantId", "ticket_id", "ticketId"],
                        "",
                    )
                ),
                "external_availability_id": str(
                    first_value(
                        item,
                        ["availability_id", "availabilityId", "inventory_id", "inventoryId"],
                        "",
                    )
                ),
                "name": base_name,
                "option_name": str(
                    first_value(
                        item,
                        ["option_name", "optionName", "ticket_name", "ticketName", "name", "title"],
                        base_name,
                    )
                ).strip(),
                "price": str(normalize_price(item)),
                "currency": base_currency,
                "available": available,
                "available_quantity": available_quantity,
                "sold_out": not available,
                "service_date": str(service_date) if service_date else "",
                "start_time": first_value(item, ["start_time", "startTime", "time"], ""),
                "end_time": first_value(item, ["end_time", "endTime"], ""),
                "raw": item,
            }
        )

    return normalized_options



def get_local_product_availability(product, service_date=None):
    queryset = product.availability.filter(is_available=True)

    if service_date:
        queryset = queryset.filter(date=service_date)

    options = []

    for availability in queryset.select_related("package"):
        package = availability.package

        price = (
            availability.price_override
            if availability.price_override is not None
            else package.price if package else product.base_price
        )

        deposit = (
            availability.deposit_override
            if availability.deposit_override is not None
            else package.deposit_amount if package else product.deposit_amount
        )

        options.append(
            {
                "provider": "local",
                "product_id": product.id,
                "package_id": package.id if package else None,
                "name": product.name,
                "option_name": package.name if package else product.name,
                "price": str(price),
                "deposit_amount": str(deposit),
                "currency": "",
                "available": availability.remaining_capacity > 0,
                "available_quantity": availability.remaining_capacity,
                "sold_out": availability.remaining_capacity <= 0,
                "service_date": str(availability.date),
                "raw": {
                    "availability_id": availability.id,
                    "package_id": package.id if package else None,
                },
            }
        )

    if not options and product.packages.filter(is_active=True).exists():
        for package in product.packages.filter(is_active=True):
            options.append(
                {
                    "provider": "local",
                    "product_id": product.id,
                    "package_id": package.id,
                    "name": product.name,
                    "option_name": package.name,
                    "price": str(package.price),
                    "deposit_amount": str(package.deposit_amount),
                    "currency": "",
                    "available": True,
                    "available_quantity": package.capacity or None,
                    "sold_out": False,
                    "service_date": str(service_date) if service_date else "",
                    "raw": {
                        "package_id": package.id,
                    },
                }
            )

    if not options:
        options.append(
            {
                "provider": "local",
                "product_id": product.id,
                "package_id": None,
                "name": product.name,
                "option_name": product.name,
                "price": str(product.base_price),
                "deposit_amount": str(product.deposit_amount),
                "currency": "",
                "available": product.status == "active" and product.is_active,
                "available_quantity": product.capacity or None,
                "sold_out": product.status == "sold_out",
                "service_date": str(service_date) if service_date else "",
                "raw": {},
            }
        )

    return options


def get_live_product_availability(organisation, product, service_date=None, include_raw=False):
    if product.external_provider == "wellet" or product.is_cocobongo_product:
        result = fetch_wellet_availability(
            organisation=organisation,
            product=product,
            service_date=service_date,
        )

        if not result.get("ok"):
            return {
                "ok": False,
                "provider": "wellet",
                "product": {
                    "id": product.id,
                    "name": product.name,
                    "slug": product.slug,
                    "external_product_id": product.external_product_id,
                },
                "service_date": str(service_date) if service_date else "",
                "options": [],
                "raw": result.get("data") if include_raw else None,
                "error": result.get("error") or "Could not fetch Wellet availability.",
            }

        raw_data = result.get("data") or {}
        options = normalize_wellet_availability(
            raw_data,
            service_date=service_date,
            product=product,
        )

        # IMPORTANT FOR COCO BONGO:
        # A single SaaS product page can represent the whole Coco Bongo show,
        # while Wellet returns several real ticket products for the same date
        # such as Regular, Premium, Gold Member and Front Row.
        #
        # Do NOT filter the options here by product.external_product_id, because
        # that can remove the ticket selected on the frontend and cause checkout
        # validation to fail with:
        # "Selected Wellet ticket option was not found for this date."
        #
        # The final selected ticket is validated later by find_selected_external_option().

        return {
            "ok": True,
            "provider": "wellet",
            "product": {
                "id": product.id,
                "name": product.name,
                "slug": product.slug,
                "external_product_id": product.external_product_id,
            },
            "service_date": str(service_date) if service_date else "",
            "options": options,
            "raw": raw_data if include_raw else None,
            "error": "",
        }

    options = get_local_product_availability(
        product=product,
        service_date=service_date,
    )

    return {
        "ok": True,
        "provider": "local",
        "product": {
            "id": product.id,
            "name": product.name,
            "slug": product.slug,
            "external_product_id": product.external_product_id,
        },
        "service_date": str(service_date) if service_date else "",
        "options": options,
        "raw": None,
        "error": "",
    }


def find_selected_external_option(options, selected_external_product_id):
    """
    Find the Wellet option selected by the frontend.

    The frontend can send any of these values:
    - external_product_id: "18"
    - external_variant_id: "18"
    - external_availability_id: "84:18"
    - selected_external_product_id: sometimes "18", sometimes "84:18"

    This matcher accepts all of them and also compares the last part after ':'
    so "84:18" matches an option with external_product_id "18".
    """
    if not selected_external_product_id:
        return None

    def clean(value):
        return str(value or "").strip()

    def expanded_values(value):
        value = clean(value)
        values = {value}

        if ":" in value:
            values.add(value.split(":")[-1].strip())

        return {item for item in values if item}

    selected_values = expanded_values(selected_external_product_id)

    print("\n================ WELLET SELECTED OPTION DEBUG ================", flush=True)
    print("SELECTED FROM CHECKOUT:", selected_external_product_id, flush=True)
    print("SELECTED MATCH VALUES:", sorted(selected_values), flush=True)
    print("AVAILABLE OPTION IDS:", flush=True)

    for option in options:
        possible_values = set()

        for key in [
            "external_product_id",
            "external_variant_id",
            "external_availability_id",
            "performance_id",
        ]:
            possible_values.update(expanded_values(option.get(key)))

        raw = option.get("raw") or {}

        if isinstance(raw, dict):
            raw_product = raw.get("product") or {}
            raw_performance = raw.get("performance") or {}

            if isinstance(raw_product, dict):
                possible_values.update(expanded_values(raw_product.get("id")))

            if isinstance(raw_performance, dict) and isinstance(raw_product, dict):
                performance_id = clean(raw_performance.get("id"))
                product_id = clean(raw_product.get("id"))

                if performance_id and product_id:
                    possible_values.add(f"{performance_id}:{product_id}")

        possible_values = {item for item in possible_values if item}

        print(
            "-",
            option.get("option_name") or option.get("name"),
            sorted(possible_values),
            flush=True,
        )

        if selected_values.intersection(possible_values):
            print("MATCHED OPTION:", option.get("option_name") or option.get("name"), flush=True)
            print("==============================================================\n", flush=True)
            return option

    print("NO MATCH FOUND", flush=True)
    print("==============================================================\n", flush=True)
    return None


def validate_external_product_before_booking(
    organisation,
    product,
    service_date,
    selected_external_product_id,
    quantity=1,
):
    if not product or not (
        product.external_provider == "wellet" or product.is_cocobongo_product
    ):
        return {
            "ok": True,
            "provider": "local",
            "selected_option": None,
            "availability": None,
            "error": "",
        }

    availability = get_live_product_availability(
        organisation=organisation,
        product=product,
        service_date=service_date,
        include_raw=True,
    )

    if not availability.get("ok"):
        return {
            "ok": False,
            "provider": "wellet",
            "selected_option": None,
            "availability": availability,
            "error": availability.get("error") or "Could not validate external availability.",
        }

    options = availability.get("options") or []

    print("\n================ WELLET VALIDATION DEBUG ================", flush=True)
    print("PRODUCT:", product.id, product.name, product.slug, flush=True)
    print("SERVICE DATE:", service_date, flush=True)
    print("SELECTED EXTERNAL PRODUCT ID:", selected_external_product_id, flush=True)
    print("QUANTITY:", quantity, flush=True)
    print("NORMALIZED OPTIONS COUNT:", len(options), flush=True)
    print("=========================================================\n", flush=True)

    selected_option = find_selected_external_option(
        options=options,
        selected_external_product_id=selected_external_product_id,
    )

    if not selected_option:
        return {
            "ok": False,
            "provider": "wellet",
            "selected_option": None,
            "availability": availability,
            "error": "Selected Wellet ticket option was not found for this date.",
        }

    if not selected_option.get("available"):
        return {
            "ok": False,
            "provider": "wellet",
            "selected_option": selected_option,
            "availability": availability,
            "error": "Selected Wellet ticket option is no longer available.",
        }

    available_quantity = selected_option.get("available_quantity")

    if available_quantity is not None and int(quantity) > int(available_quantity):
        return {
            "ok": False,
            "provider": "wellet",
            "selected_option": selected_option,
            "availability": availability,
            "error": "Requested quantity is higher than the current Wellet availability.",
        }

    return {
        "ok": True,
        "provider": "wellet",
        "selected_option": selected_option,
        "availability": availability,
        "error": "",
    }


def create_wellet_snapshot(
    organisation,
    external_product_id,
    external_name,
    price,
    currency="USD",
    service_date=None,
    raw_data=None,
    product=None,
):
    snapshot = ExternalProviderProductSnapshot.objects.create(
        organisation=organisation,
        provider="wellet",
        product=product,
        external_product_id=external_product_id,
        external_name=external_name,
        price=money(price),
        currency=currency,
        service_date=service_date,
        raw_data=raw_data or {},
    )

    return snapshot


def create_wellet_snapshot_from_option(organisation, product, service_date, option):
    return create_wellet_snapshot(
        organisation=organisation,
        product=product,
        external_product_id=option.get("external_product_id") or "",
        external_name=option.get("option_name") or option.get("name") or product.name,
        price=option.get("price") or ZERO,
        currency=option.get("currency") or "USD",
        service_date=service_date,
        raw_data=option.get("raw") or option,
    )


def build_external_booking_payload(booking):
    items = []

    for item in booking.items.filter(external_provider="wellet"):
        items.append(
            {
                "external_product_id": item.external_product_id,
                "external_variant_id": item.external_variant_id,
                "external_availability_id": item.external_availability_id,
                "name": item.product_name,
                "quantity": item.quantity,
                "unit_price": str(item.unit_price),
                "service_date": str(item.service_date) if item.service_date else None,
                "service_time": str(item.service_time) if item.service_time else None,
                "raw": item.external_raw_data,
            }
        )

    return {
        "booking_code": booking.booking_code,
        "customer": {
            "name": booking.customer_name,
            "email": booking.customer_email,
            "whatsapp": booking.customer_whatsapp,
            "hotel": booking.customer_hotel,
        },
        "service": {
            "date": str(booking.service_date) if booking.service_date else None,
            "time": str(booking.service_time) if booking.service_time else None,
            "adults": booking.adults,
            "children": booking.children,
            "infants": booking.infants,
            "total_guests": booking.total_guests,
        },
        "amounts": {
            "subtotal": str(booking.subtotal_amount),
            "total": str(booking.total_amount),
            "deposit_paid": str(booking.deposit_paid),
            "balance_due": str(booking.balance_due),
        },
        "items": items,
    }


def create_external_booking_order_if_possible(booking):
    if booking.external_provider != "wellet":
        return {
            "ok": False,
            "skipped": True,
            "error": "Booking is not a Wellet booking.",
        }

    config = get_wellet_config(booking.organisation)

    if not config:
        return {
            "ok": False,
            "skipped": True,
            "error": "Wellet config is missing or disabled.",
        }

    payload = build_external_booking_payload(booking)
    client = WelletClient(config)
    result = client.create_booking_order(payload=payload)

    booking.external_raw_response = result.get("data") or {}
    booking.external_status = "pending_provider_confirmation"

    if result.get("ok"):
        data = result.get("data") or {}

        booking.external_status = str(
            first_value(data, ["status", "order_status", "booking_status"], "created")
        )

        booking.external_order_id = str(
            first_value(data, ["order_id", "orderId", "id", "reference"], "")
        )

        booking.external_booking_id = str(
            first_value(data, ["booking_id", "bookingId", "reservation_id"], "")
        )

        booking.external_reference = (
            booking.external_order_id
            or booking.external_booking_id
            or booking.external_reference
        )

        booking.external_order_created_at = timezone.now()

    elif result.get("skipped"):
        booking.external_status = "booking_endpoint_not_configured"
    else:
        booking.external_status = "provider_error"

    booking.save(
        update_fields=[
            "external_raw_response",
            "external_status",
            "external_order_id",
            "external_booking_id",
            "external_reference",
            "external_order_created_at",
            "updated_at",
        ]
    )

    return result


def sync_wellet_products_to_snapshots(organisation, service_date=None):
    result = fetch_wellet_products(
        organisation=organisation,
        service_date=service_date,
    )

    if not result.get("ok"):
        return result

    data = result.get("data") or {}
    options = normalize_wellet_availability(
        data=data,
        service_date=service_date,
    )

    snapshots = []

    for option in options:
        snapshot = create_wellet_snapshot(
            organisation=organisation,
            external_product_id=option.get("external_product_id") or "",
            external_name=option.get("option_name") or option.get("name") or "",
            price=option.get("price") or ZERO,
            currency=option.get("currency") or "USD",
            service_date=service_date,
            raw_data=option.get("raw") or option,
        )
        snapshots.append(snapshot)

    return {
        "ok": True,
        "data": {
            "snapshots_created": len(snapshots),
            "snapshot_ids": [snapshot.id for snapshot in snapshots],
        },
        "error": "",
    }


# ============================================================
# Custom domain automation for Ticketing public websites
# ============================================================

def get_setting_value(name, default=""):
    """
    Read a value from Django settings first, then environment variables.

    This keeps production secrets outside the database.
    """
    value = getattr(settings, name, None)

    if value not in [None, ""]:
        return value

    return os.environ.get(name, default)


def clean_custom_domain_value(domain):
    if not domain:
        return ""

    domain = str(domain).strip().lower()
    domain = domain.replace("https://", "").replace("http://", "")
    domain = domain.split("/")[0]
    domain = domain.split(":")[0]
    domain = domain.strip(".")

    return domain


def validate_custom_domain_value(domain):
    domain = clean_custom_domain_value(domain)

    if not domain:
        raise ValueError("Custom domain is required.")

    if "." not in domain:
        raise ValueError("Enter a valid domain, for example www.puntacanaticket.com.")

    if domain.startswith("*"):
        raise ValueError("Wildcard domains are not supported here.")

    if domain.startswith("http://") or domain.startswith("https://"):
        raise ValueError("Enter only the domain, without http:// or https://.")

    # MVP rule:
    # External DNS providers like GoDaddy usually cannot CNAME the root/apex
    # domain in the same way Route 53 can use an ALIAS. For now, require a
    # subdomain such as www.example.com.
    if len(domain.split(".")) < 3:
        raise ValueError(
            "Use a subdomain like www.example.com. Root domains need a different DNS setup."
        )

    return domain


def strip_dns_dot(value):
    return str(value or "").strip().rstrip(".")


def guess_dns_zone(domain):
    """
    Good enough for the common GoDaddy .com/.net/.org use case.

    Example:
    www.puntacanaticket.com -> puntacanaticket.com
    """
    domain = clean_custom_domain_value(domain)
    parts = domain.split(".")

    if len(parts) <= 2:
        return domain

    return ".".join(parts[-2:])


def get_godaddy_host_value(record_name, custom_domain):
    """
    Returns the Host value a customer normally enters in GoDaddy.

    Examples for zone puntacanaticket.com:
    www.puntacanaticket.com -> www
    _abc.www.puntacanaticket.com -> _abc.www
    """
    record_name = strip_dns_dot(record_name).lower()
    zone = guess_dns_zone(custom_domain)

    if not record_name:
        return ""

    if record_name == zone:
        return "@"

    suffix = f".{zone}"

    if record_name.endswith(suffix):
        return record_name[: -len(suffix)]

    return record_name


def get_aws_acm_region():
    return (
        get_setting_value("AWS_ACM_REGION")
        or get_setting_value("TICKETING_AWS_ACM_REGION")
        or "us-east-1"
    )


def get_cloudfront_distribution_id():
    distribution_id = (
        get_setting_value("AWS_CLOUDFRONT_DISTRIBUTION_ID")
        or get_setting_value("TICKETING_CLOUDFRONT_DISTRIBUTION_ID")
    )

    if not distribution_id:
        raise ValueError(
            "AWS_CLOUDFRONT_DISTRIBUTION_ID is missing from your backend environment."
        )

    return distribution_id


def get_cloudfront_domain_name():
    domain_name = (
        get_setting_value("AWS_CLOUDFRONT_DOMAIN")
        or get_setting_value("TICKETING_CLOUDFRONT_DOMAIN")
    )

    if not domain_name:
        raise ValueError(
            "AWS_CLOUDFRONT_DOMAIN is missing from your backend environment."
        )

    return strip_dns_dot(domain_name)


def get_boto3_client(service_name, region_name=None):
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError(
            "boto3 is not installed. Install it with: pip install boto3"
        ) from exc

    kwargs = {}

    if region_name:
        kwargs["region_name"] = region_name

    return boto3.client(service_name, **kwargs)


def get_acm_client():
    return get_boto3_client("acm", region_name=get_aws_acm_region())


def get_cloudfront_client():
    return get_boto3_client("cloudfront")


def build_acm_idempotency_token(site_settings, custom_domain):
    token_source = f"ticketing-{site_settings.organisation_id}-{custom_domain}"
    return uuid.uuid5(uuid.NAMESPACE_DNS, token_source).hex[:32]


def request_or_reuse_acm_certificate(site_settings, custom_domain):
    acm = get_acm_client()

    if site_settings.aws_acm_certificate_arn:
        try:
            acm.describe_certificate(
                CertificateArn=site_settings.aws_acm_certificate_arn,
            )
            return site_settings.aws_acm_certificate_arn
        except Exception:
            # If the stored ARN was deleted in AWS, request a new one.
            site_settings.aws_acm_certificate_arn = ""

    response = acm.request_certificate(
        DomainName=custom_domain,
        ValidationMethod="DNS",
        IdempotencyToken=build_acm_idempotency_token(site_settings, custom_domain),
        Tags=[
            {
                "Key": "Project",
                "Value": "Punta Cana Discovery",
            },
            {
                "Key": "Module",
                "Value": "Ticketing",
            },
            {
                "Key": "OrganisationSlug",
                "Value": site_settings.organisation.slug,
            },
        ],
    )

    certificate_arn = response["CertificateArn"]

    site_settings.aws_acm_certificate_arn = certificate_arn
    site_settings.aws_acm_requested_at = timezone.now()

    return certificate_arn


def read_acm_certificate_details(site_settings):
    if not site_settings.aws_acm_certificate_arn:
        return {}

    acm = get_acm_client()

    response = acm.describe_certificate(
        CertificateArn=site_settings.aws_acm_certificate_arn,
    )

    certificate = response.get("Certificate") or {}
    status_value = certificate.get("Status") or ""

    site_settings.aws_acm_certificate_status = status_value

    validation_options = certificate.get("DomainValidationOptions") or []
    validation_option = None

    for option in validation_options:
        if clean_custom_domain_value(option.get("DomainName")) == site_settings.custom_domain:
            validation_option = option
            break

    if not validation_option and validation_options:
        validation_option = validation_options[0]

    resource_record = {}

    if validation_option:
        resource_record = validation_option.get("ResourceRecord") or {}

    if resource_record:
        site_settings.aws_acm_validation_record_name = strip_dns_dot(
            resource_record.get("Name")
        )
        site_settings.aws_acm_validation_record_type = (
            resource_record.get("Type") or "CNAME"
        )
        site_settings.aws_acm_validation_record_value = strip_dns_dot(
            resource_record.get("Value")
        )

    return certificate


def build_ticketing_domain_dns_records(site_settings):
    records = []

    custom_domain = clean_custom_domain_value(site_settings.custom_domain)

    if (
        site_settings.aws_acm_validation_record_name
        and site_settings.aws_acm_validation_record_value
    ):
        records.append(
            {
                "purpose": "ssl_validation",
                "label": "SSL Certificate Validation",
                "type": site_settings.aws_acm_validation_record_type or "CNAME",
                "host": strip_dns_dot(site_settings.aws_acm_validation_record_name),
                "godaddy_host": get_godaddy_host_value(
                    site_settings.aws_acm_validation_record_name,
                    custom_domain,
                ),
                "value": strip_dns_dot(site_settings.aws_acm_validation_record_value),
                "status": site_settings.aws_acm_certificate_status
                or "PENDING_VALIDATION",
                "instructions": "Add this CNAME in GoDaddy to validate the SSL certificate.",
            }
        )

    if custom_domain and site_settings.cloudfront_domain_name:
        records.append(
            {
                "purpose": "website",
                "label": "Website Domain",
                "type": "CNAME",
                "host": custom_domain,
                "godaddy_host": get_godaddy_host_value(custom_domain, custom_domain),
                "value": strip_dns_dot(site_settings.cloudfront_domain_name),
                "status": site_settings.domain_status,
                "instructions": "Add this CNAME in GoDaddy to point the website to Punta Cana Discovery.",
            }
        )

    return records


def save_ticketing_domain_dns_records(site_settings):
    site_settings.dns_records_payload = build_ticketing_domain_dns_records(site_settings)
    return site_settings.dns_records_payload


def get_cloudfront_distribution_status(distribution_id):
    cloudfront = get_cloudfront_client()

    response = cloudfront.get_distribution(Id=distribution_id)
    distribution = response.get("Distribution") or {}

    return distribution.get("Status") or ""


def ensure_cloudfront_alias(site_settings):
    """
    Attach the custom domain to the configured CloudFront distribution.

    Important for future scaling:
    One CloudFront distribution can use only one viewer certificate at a time.
    For many tenant domains, use a shared SAN certificate strategy or a
    distribution-per-domain strategy. This helper is correct for the MVP where
    this distribution/certificate setup is controlled by the platform owner.
    """
    custom_domain = clean_custom_domain_value(site_settings.custom_domain)

    if not custom_domain:
        raise ValueError("Custom domain is missing.")

    if not site_settings.aws_acm_certificate_arn:
        raise ValueError("ACM certificate ARN is missing.")

    distribution_id = (
        site_settings.cloudfront_distribution_id
        or get_cloudfront_distribution_id()
    )

    cloudfront = get_cloudfront_client()

    config_response = cloudfront.get_distribution_config(Id=distribution_id)
    etag = config_response["ETag"]
    distribution_config = config_response["DistributionConfig"]

    aliases = distribution_config.get("Aliases") or {}
    alias_items = aliases.get("Items") or []

    if custom_domain not in alias_items:
        alias_items.append(custom_domain)

    distribution_config["Aliases"] = {
        "Quantity": len(alias_items),
        "Items": alias_items,
    }

    current_certificate_arn = (
        distribution_config.get("ViewerCertificate", {}).get("ACMCertificateArn")
    )

    certificate_changed = current_certificate_arn != site_settings.aws_acm_certificate_arn

    distribution_config["ViewerCertificate"] = {
        "ACMCertificateArn": site_settings.aws_acm_certificate_arn,
        "SSLSupportMethod": "sni-only",
        "MinimumProtocolVersion": "TLSv1.2_2021",
        "CertificateSource": "acm",
    }

    response = cloudfront.update_distribution(
        Id=distribution_id,
        IfMatch=etag,
        DistributionConfig=distribution_config,
    )

    site_settings.cloudfront_distribution_id = distribution_id
    site_settings.cloudfront_domain_name = (
        site_settings.cloudfront_domain_name or get_cloudfront_domain_name()
    )

    distribution = response.get("Distribution") or {}
    distribution_status = distribution.get("Status") or "InProgress"

    if custom_domain in alias_items:
        site_settings.cloudfront_alias_added_at = timezone.now()

    return {
        "updated": True,
        "certificate_changed": certificate_changed,
        "distribution_id": distribution_id,
        "status": distribution_status,
    }


@transaction.atomic
def connect_ticketing_custom_domain(site_settings, custom_domain):
    """
    Starts the AWS side of custom-domain setup.

    Customer still handles GoDaddy manually:
    - The app creates/reads ACM certificate validation CNAME.
    - The app returns the DNS records that the customer copies to GoDaddy.
    """
    custom_domain = validate_custom_domain_value(custom_domain)

    previous_domain = clean_custom_domain_value(site_settings.custom_domain)

    if previous_domain != custom_domain:
        site_settings.aws_acm_certificate_arn = ""
        site_settings.aws_acm_certificate_status = ""
        site_settings.aws_acm_requested_at = None
        site_settings.aws_acm_validation_record_name = ""
        site_settings.aws_acm_validation_record_type = "CNAME"
        site_settings.aws_acm_validation_record_value = ""
        site_settings.cloudfront_alias_added_at = None
        site_settings.domain_verified_at = None
        site_settings.domain_error_message = ""
        site_settings.dns_records_payload = []

    site_settings.custom_domain = custom_domain
    site_settings.domain_status = "pending_aws_setup"
    site_settings.domain_error_message = ""
    site_settings.domain_last_checked_at = timezone.now()
    site_settings.cloudfront_distribution_id = get_cloudfront_distribution_id()
    site_settings.cloudfront_domain_name = get_cloudfront_domain_name()
    site_settings.save()

    request_or_reuse_acm_certificate(site_settings, custom_domain)
    read_acm_certificate_details(site_settings)

    if (
        site_settings.aws_acm_validation_record_name
        and site_settings.aws_acm_validation_record_value
    ):
        site_settings.domain_status = "pending_dns"
    else:
        site_settings.domain_status = "pending_aws_setup"

    save_ticketing_domain_dns_records(site_settings)

    site_settings.save(
        update_fields=[
            "custom_domain",
            "domain_status",
            "domain_error_message",
            "domain_last_checked_at",
            "aws_acm_certificate_arn",
            "aws_acm_certificate_status",
            "aws_acm_requested_at",
            "aws_acm_validation_record_name",
            "aws_acm_validation_record_type",
            "aws_acm_validation_record_value",
            "cloudfront_distribution_id",
            "cloudfront_domain_name",
            "cloudfront_alias_added_at",
            "domain_verified_at",
            "dns_records_payload",
            "updated_at",
        ]
    )

    return site_settings


@transaction.atomic
def check_ticketing_custom_domain(site_settings):
    """
    Checks ACM validation. If issued, it tries to attach the domain to CloudFront.
    """
    custom_domain = validate_custom_domain_value(site_settings.custom_domain)

    site_settings.domain_last_checked_at = timezone.now()
    site_settings.domain_error_message = ""

    if not site_settings.cloudfront_distribution_id:
        site_settings.cloudfront_distribution_id = get_cloudfront_distribution_id()

    if not site_settings.cloudfront_domain_name:
        site_settings.cloudfront_domain_name = get_cloudfront_domain_name()

    if not site_settings.aws_acm_certificate_arn:
        request_or_reuse_acm_certificate(site_settings, custom_domain)

    certificate = read_acm_certificate_details(site_settings)
    certificate_status = certificate.get("Status") or site_settings.aws_acm_certificate_status

    if certificate_status in ["FAILED", "VALIDATION_TIMED_OUT", "REVOKED"]:
        site_settings.domain_status = "failed"
        site_settings.domain_error_message = (
            f"ACM certificate status is {certificate_status}."
        )
        save_ticketing_domain_dns_records(site_settings)
        site_settings.save()
        return site_settings

    if certificate_status != "ISSUED":
        if (
            site_settings.aws_acm_validation_record_name
            and site_settings.aws_acm_validation_record_value
        ):
            site_settings.domain_status = "pending_dns"
        else:
            site_settings.domain_status = "pending_aws_setup"

        save_ticketing_domain_dns_records(site_settings)
        site_settings.save()
        return site_settings

    site_settings.domain_status = "pending_cloudfront"
    save_ticketing_domain_dns_records(site_settings)
    site_settings.save()

    cloudfront_result = ensure_cloudfront_alias(site_settings)
    distribution_status = cloudfront_result.get("status") or ""

    if distribution_status == "Deployed":
        site_settings.mark_domain_active(save=False)
    else:
        site_settings.domain_status = "pending_cloudfront"

    save_ticketing_domain_dns_records(site_settings)

    site_settings.save(
        update_fields=[
            "domain_status",
            "domain_error_message",
            "domain_verified_at",
            "domain_last_checked_at",
            "aws_acm_certificate_status",
            "aws_acm_validation_record_name",
            "aws_acm_validation_record_type",
            "aws_acm_validation_record_value",
            "cloudfront_distribution_id",
            "cloudfront_domain_name",
            "cloudfront_alias_added_at",
            "dns_records_payload",
            "updated_at",
        ]
    )

    return site_settings

