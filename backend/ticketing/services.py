from decimal import Decimal
import json
import uuid
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

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
    Backend-only Wellet / Coco Bongo client placeholder.

    The React frontend must never call Wellet directly.
    This client is intentionally conservative and only makes a request
    when api_base_url is configured.
    """

    def __init__(self, config):
        self.config = config

    def is_ready(self):
        return bool(self.config and self.config.is_enabled and self.config.api_base_url)

    def build_products_url(self, service_date=None):
        base_url = self.config.api_base_url.rstrip("/")

        query_params = {
            "show_id": self.config.show_id,
            "category_id": self.config.category_id,
            "currency": self.config.currency,
            "lang": self.config.lang,
            "include_table": "true" if self.config.include_table else "false",
        }

        if service_date:
            query_params["date"] = str(service_date)

        query_string = urlencode(
            {
                key: value
                for key, value in query_params.items()
                if value not in [None, ""]
            }
        )

        return f"{base_url}?{query_string}"

    def list_products(self, service_date=None, timeout=20):
        if not self.is_ready():
            return {
                "ok": False,
                "status_code": None,
                "data": None,
                "error": "Wellet config is missing or disabled.",
            }

        url = self.build_products_url(service_date=service_date)

        headers = {
            "Accept": "application/json",
        }

        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        request = Request(url, headers=headers, method="GET")

        try:
            with urlopen(request, timeout=timeout) as response:
                body = response.read().decode("utf-8")
                data = json.loads(body) if body else {}

                return {
                    "ok": True,
                    "status_code": response.status,
                    "data": data,
                    "error": "",
                }

        except HTTPError as error:
            try:
                body = error.read().decode("utf-8")
            except Exception:
                body = ""

            return {
                "ok": False,
                "status_code": error.code,
                "data": body,
                "error": str(error),
            }

        except URLError as error:
            return {
                "ok": False,
                "status_code": None,
                "data": None,
                "error": str(error),
            }

        except Exception as error:
            return {
                "ok": False,
                "status_code": None,
                "data": None,
                "error": str(error),
            }


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
    """
    Fetch products from Wellet if config exists.

    This function does not create bookings. It only returns provider data.
    """

    config = get_wellet_config(organisation)

    if not config:
        return {
            "ok": False,
            "data": None,
            "error": "Wellet is not configured or not enabled for this organisation.",
        }

    client = WelletClient(config)
    return client.list_products(service_date=service_date)


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


def sync_wellet_products_to_snapshots(organisation, service_date=None):
    """
    Generic Wellet sync placeholder.

    Because Wellet response fields may differ, this tries common keys only.
    Adjust mapping after you confirm the real API response.
    """

    result = fetch_wellet_products(
        organisation=organisation,
        service_date=service_date,
    )

    if not result.get("ok"):
        return result

    data = result.get("data") or {}
    items = data.get("products") or data.get("items") or data.get("data") or []

    snapshots = []

    for item in items:
        external_product_id = (
            item.get("id")
            or item.get("product_id")
            or item.get("external_id")
            or item.get("sku")
            or ""
        )

        external_name = (
            item.get("name")
            or item.get("title")
            or item.get("description")
            or ""
        )

        price = (
            item.get("price")
            or item.get("amount")
            or item.get("total")
            or ZERO
        )

        currency = item.get("currency") or data.get("currency") or "USD"

        snapshot = create_wellet_snapshot(
            organisation=organisation,
            external_product_id=external_product_id,
            external_name=external_name,
            price=price,
            currency=currency,
            service_date=service_date,
            raw_data=item,
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
