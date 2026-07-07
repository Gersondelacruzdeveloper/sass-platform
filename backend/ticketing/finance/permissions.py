"""
Finance permission helpers for seller booking/payment flows.

These helpers centralize business rules so views/serializers do not need
to directly check many seller fields everywhere.
"""


def is_admin_user(user, organisation=None):
    if not user or not getattr(user, "is_authenticated", False):
        return False

    if getattr(user, "is_superuser", False):
        return True

    if getattr(user, "is_staff", False):
        return True

    if organisation and getattr(user, "organisation_id", None) == getattr(organisation, "id", None):
        role = getattr(user, "role", "")
        return role in ["owner", "admin", "manager"]

    return False


def seller_has_permission(seller, permission_name):
    if not seller:
        return False

    if getattr(seller, "role", "") == "owner":
        return True

    if hasattr(seller, "has_permission"):
        return seller.has_permission(permission_name)

    return bool(getattr(seller, permission_name, False))


def can_create_booking(seller):
    return seller_has_permission(seller, "can_create_bookings")


def can_send_payment_link(seller):
    return (
        seller_has_permission(seller, "can_send_payment_links")
        or seller_has_permission(seller, "can_send_email")
        or seller_has_permission(seller, "can_send_whatsapp")
    )


def can_apply_customer_discount(seller):
    return (
        seller_has_permission(seller, "can_apply_customer_discount")
        or seller_has_permission(seller, "can_apply_discounts")
    )


def max_customer_discount_percent(seller):
    if not seller:
        return 0

    explicit = getattr(seller, "max_customer_discount_percent", None)

    if explicit not in [None, ""]:
        return explicit

    margin = getattr(seller, "default_margin_percent", None)

    if margin not in [None, ""]:
        return margin

    legacy_rate = getattr(seller, "commission_rate", 0)

    return legacy_rate or 0


def can_collect_cash(seller):
    return (
        seller_has_permission(seller, "can_collect_cash")
        or seller_has_permission(seller, "can_collect_cash_payment")
    )


def can_mark_cash_collected(seller):
    return (
        seller_has_permission(seller, "can_mark_cash_collected")
        or seller_has_permission(seller, "can_collect_cash_payment")
    )


def can_keep_commission_first(seller):
    return seller_has_permission(seller, "can_keep_commission_first")


def can_create_pending_payment_booking(seller):
    return seller_has_permission(seller, "can_create_pending_payment_booking")


def can_take_deposit(seller):
    return (
        seller_has_permission(seller, "can_take_deposit")
        or seller_has_permission(seller, "can_take_deposits")
    )


def can_take_full_payment(seller):
    return (
        seller_has_permission(seller, "can_take_full_payment")
        or seller_has_permission(seller, "can_take_full_payments")
    )


def can_request_supervisor_approval(seller):
    return seller_has_permission(seller, "can_request_supervisor_approval")


def can_pay_full_amount_as_seller(seller):
    return seller_has_permission(seller, "can_pay_full_amount_as_seller")


def can_pay_deposit_as_seller(seller):
    return seller_has_permission(seller, "can_pay_deposit_as_seller")


def can_pay_commission_only(seller):
    return seller_has_permission(seller, "can_pay_commission_only")


def validate_seller_booking_permission(seller):
    if not can_create_booking(seller):
        return "You do not have permission to create bookings."

    return None


def validate_discount_permission(seller, discount_percent):
    from .utils import money

    discount_percent = money(discount_percent)

    if discount_percent <= 0:
        return None

    if not can_apply_customer_discount(seller):
        return "You do not have permission to apply customer discounts."

    max_discount = money(max_customer_discount_percent(seller))

    if max_discount > 0 and discount_percent > max_discount:
        return f"Maximum discount allowed is {max_discount}%."

    return None


def validate_payment_permission(
    seller,
    payment_type,
    method,
    payer_type="customer",
):
    if not seller:
        return None

    payment_type = str(payment_type or "").lower()
    method = str(method or "").lower()
    payer_type = str(payer_type or "").lower()

    if method == "cash" and not can_collect_cash(seller):
        return "You do not have permission to collect cash payments."

    if payment_type == "deposit" and not can_take_deposit(seller):
        return "You do not have permission to take deposits."

    if payment_type in ["full", "balance"] and not can_take_full_payment(seller):
        return "You do not have permission to take full payments."

    if payment_type == "commission_only" and not can_pay_commission_only(seller):
        return "You do not have permission to pay commission only."

    if payer_type == "seller":
        if payment_type == "full" and not can_pay_full_amount_as_seller(seller):
            return "You do not have permission to pay the full amount as seller."

        if payment_type == "deposit" and not can_pay_deposit_as_seller(seller):
            return "You do not have permission to pay the deposit as seller."

    return None


def validate_pending_booking_permission(seller):
    if not can_create_pending_payment_booking(seller):
        return "You do not have permission to create pending payment bookings."

    return None


def validate_supervisor_approval_permission(seller):
    if not can_request_supervisor_approval(seller):
        return "You do not have permission to request supervisor approval."

    return None