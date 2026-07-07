"""
Finance constants used throughout the Ticketing module.

This file intentionally contains NO business logic.
It simply defines the canonical values used by the finance engine.

Everything else (pricing, payments, settlements, reports, etc.)
should import these constants instead of hardcoding strings.
"""

from decimal import Decimal


# ==========================================================
# Money
# ==========================================================

ZERO = Decimal("0.00")
ONE_HUNDRED = Decimal("100.00")


# ==========================================================
# Payment Receivers
# Who physically receives the money?
# ==========================================================

PAYMENT_RECEIVER_OWNER = "owner"
PAYMENT_RECEIVER_SELLER = "seller"
PAYMENT_RECEIVER_STRIPE = "stripe"
PAYMENT_RECEIVER_PAYPAL = "paypal"
PAYMENT_RECEIVER_BANK = "bank"

PAYMENT_RECEIVER_CHOICES = (
    (PAYMENT_RECEIVER_OWNER, "Owner"),
    (PAYMENT_RECEIVER_SELLER, "Seller"),
    (PAYMENT_RECEIVER_STRIPE, "Stripe"),
    (PAYMENT_RECEIVER_PAYPAL, "PayPal"),
    (PAYMENT_RECEIVER_BANK, "Bank Transfer"),
)


# ==========================================================
# Payment Types
# Why was the payment made?
# ==========================================================

PAYMENT_TYPE_DEPOSIT = "deposit"
PAYMENT_TYPE_FULL = "full"
PAYMENT_TYPE_BALANCE = "balance"
PAYMENT_TYPE_REFUND = "refund"
PAYMENT_TYPE_COMMISSION_ONLY = "commission_only"
PAYMENT_TYPE_SETTLEMENT = "settlement"

PAYMENT_TYPE_CHOICES = (
    (PAYMENT_TYPE_DEPOSIT, "Deposit"),
    (PAYMENT_TYPE_FULL, "Full Payment"),
    (PAYMENT_TYPE_BALANCE, "Balance"),
    (PAYMENT_TYPE_REFUND, "Refund"),
    (PAYMENT_TYPE_COMMISSION_ONLY, "Commission Only"),
    (PAYMENT_TYPE_SETTLEMENT, "Seller Settlement"),
)


# ==========================================================
# Payer
# Who initiated the payment?
# ==========================================================

PAYER_CUSTOMER = "customer"
PAYER_SELLER = "seller"
PAYER_OWNER = "owner"

PAYER_CHOICES = (
    (PAYER_CUSTOMER, "Customer"),
    (PAYER_SELLER, "Seller"),
    (PAYER_OWNER, "Owner"),
)


# ==========================================================
# Booking Payment Status
# ==========================================================

BOOKING_PAYMENT_UNPAID = "unpaid"
BOOKING_PAYMENT_PENDING = "pending"
BOOKING_PAYMENT_PARTIAL = "partial"
BOOKING_PAYMENT_DEPOSIT = "deposit_paid"
BOOKING_PAYMENT_PAID = "paid"
BOOKING_PAYMENT_REFUNDED = "refunded"

BOOKING_PAYMENT_STATUS_CHOICES = (
    (BOOKING_PAYMENT_UNPAID, "Unpaid"),
    (BOOKING_PAYMENT_PENDING, "Pending"),
    (BOOKING_PAYMENT_PARTIAL, "Partially Paid"),
    (BOOKING_PAYMENT_DEPOSIT, "Deposit Paid"),
    (BOOKING_PAYMENT_PAID, "Paid"),
    (BOOKING_PAYMENT_REFUNDED, "Refunded"),
)


# ==========================================================
# Settlement Status
# Seller ↔ Company
# ==========================================================

SETTLEMENT_PENDING = "pending"
SETTLEMENT_PARTIALLY_SETTLED = "partially_settled"
SETTLEMENT_SETTLED = "settled"

SETTLEMENT_STATUS_CHOICES = (
    (SETTLEMENT_PENDING, "Pending"),
    (SETTLEMENT_PARTIALLY_SETTLED, "Partially Settled"),
    (SETTLEMENT_SETTLED, "Settled"),
)


# ==========================================================
# Commission Status
# ==========================================================

COMMISSION_PENDING = "pending"
COMMISSION_APPROVED = "approved"
COMMISSION_PAID = "paid"
COMMISSION_CANCELLED = "cancelled"

COMMISSION_STATUS_CHOICES = (
    (COMMISSION_PENDING, "Pending"),
    (COMMISSION_APPROVED, "Approved"),
    (COMMISSION_PAID, "Paid"),
    (COMMISSION_CANCELLED, "Cancelled"),
)


# ==========================================================
# Finance Events
# Used for audit trail / timeline
# ==========================================================

EVENT_BOOKING_CREATED = "booking_created"

EVENT_CUSTOMER_PAYMENT = "customer_payment"

EVENT_CUSTOMER_REFUND = "customer_refund"

EVENT_SELLER_CASH_COLLECTED = "seller_cash_collected"

EVENT_OWNER_PAYMENT_RECEIVED = "owner_payment_received"

EVENT_COMMISSION_CREATED = "commission_created"

EVENT_COMMISSION_PAID = "commission_paid"

EVENT_SETTLEMENT_CREATED = "settlement_created"

EVENT_SETTLEMENT_RECEIVED = "settlement_received"

EVENT_SETTLEMENT_COMPLETED = "settlement_completed"

EVENT_DISCOUNT_APPLIED = "discount_applied"


# ==========================================================
# Booking Finance Sources
# ==========================================================

SOURCE_PUBLIC_WEBSITE = "public"

SOURCE_SELLER_DASHBOARD = "seller"

SOURCE_ADMIN = "admin"

SOURCE_API = "api"

SOURCE_IMPORT = "import"


# ==========================================================
# Finance Calculation Modes
# ==========================================================

COMMISSION_FIXED = "fixed"

COMMISSION_PERCENTAGE = "percentage"

COMMISSION_MARGIN = "margin"


# ==========================================================
# Precision
# ==========================================================

MONEY_DECIMAL_PLACES = Decimal("0.01")

PERCENT_DECIMAL_PLACES = Decimal("0.01")


# ==========================================================
# Helper Collections
# ==========================================================

ONLINE_PAYMENT_RECEIVERS = {
    PAYMENT_RECEIVER_STRIPE,
    PAYMENT_RECEIVER_PAYPAL,
}

SELLER_PAYMENT_RECEIVERS = {
    PAYMENT_RECEIVER_SELLER,
}

OWNER_PAYMENT_RECEIVERS = {
    PAYMENT_RECEIVER_OWNER,
    PAYMENT_RECEIVER_BANK,
}

CONFIRMED_SETTLEMENTS = {
    SETTLEMENT_SETTLED,
}

PENDING_SETTLEMENTS = {
    SETTLEMENT_PENDING,
    SETTLEMENT_PARTIALLY_SETTLED,
}