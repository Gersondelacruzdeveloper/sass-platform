from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from partner_network.cart_components import ReferralAwareCustomerCartValidator
from partner_network.models import (
    PartnerNetworkSettings,
    ReferralPartner,
    ReferralPartnerLocation,
    ReferralProductAccess,
)
from partner_network.services.attribution_service import claim_referral_from_message
from partner_network.services.qr_service import generate_qr_for_location
from ticketing.ai.customer.cart_tools import (
    CartItemRequest,
    CustomerCartValidationError,
    SaveCartRequest,
)
from ticketing.customer_ai_models import CustomerAIConversation
from ticketing.models import ExperienceProduct, PickupLocation


class ReferralCartValidationBoundaryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner Cart Validation Org",
            slug="partner-cart-validation-org",
            business_type="ticketing",
            is_active=True,
        )
        PartnerNetworkSettings.objects.create(
            organisation=cls.organisation,
            enabled=True,
            referral_session_hours=72,
        )

        cls.property_pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Jara Beach",
            slug="jara-beach-cart-validation",
            location_type="hotel",
            is_active=True,
        )
        cls.other_pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Other Hotel",
            slug="other-hotel-cart-validation",
            location_type="hotel",
            is_active=True,
        )

        cls.partner = ReferralPartner.objects.create(
            organisation=cls.organisation,
            name="Jara Beach",
            partner_type="hotel",
            status="active",
            product_access_mode=ReferralPartner.PRODUCT_ACCESS_CUSTOM,
        )
        cls.location = ReferralPartnerLocation.objects.create(
            partner=cls.partner,
            display_name="Jara Beach",
            property_type="hotel",
            linked_pickup_location=cls.property_pickup,
            is_active=True,
        )

        cls.allowed_product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Saona Island",
            slug="saona-cart-validation",
            product_type="excursion",
            adult_price=Decimal("69.00"),
            status="active",
            is_active=True,
            public_enabled=True,
            requires_pickup_location=True,
        )
        cls.blocked_product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Blocked Excursion",
            slug="blocked-cart-validation",
            product_type="excursion",
            adult_price=Decimal("99.00"),
            status="active",
            is_active=True,
            public_enabled=True,
            requires_pickup_location=True,
        )
        ReferralProductAccess.objects.create(
            organisation=cls.organisation,
            partner=cls.partner,
            product=cls.allowed_product,
            is_active=True,
        )

    def setUp(self):
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095550071",
        )
        qr = generate_qr_for_location(self.location)
        session, _ = claim_referral_from_message(
            conversation=self.conversation,
            text=f"PCDREF:{qr.token}",
        )
        self.assertIsNotNone(session)

        self.validator = ReferralAwareCustomerCartValidator()
        self.service_date = date.today() + timedelta(days=7)

    def request_for(self, *, product_id, pickup_location_id):
        return SaveCartRequest(
            cart_token=None,
            items=(
                CartItemRequest(
                    position=1,
                    product_id=product_id,
                    service_date=self.service_date,
                    adults=1,
                    children=0,
                    infants=0,
                    package_id=None,
                    event_ticket_type_id=None,
                    selected_external_option_id=None,
                    pickup_location_id=pickup_location_id,
                ),
            ),
            language="en",
            customer_approved=True,
            idempotency_key="partner-cart-validation",
        )

    @patch(
        "ticketing.ai.customer.cart_components."
        "DjangoCustomerCartValidator.validate_for_checkout"
    )
    def test_disallowed_product_is_rejected_before_base_checkout_validation(
        self,
        base_validate,
    ):
        request = self.request_for(
            product_id=self.blocked_product.pk,
            pickup_location_id=self.property_pickup.pk,
        )

        with self.assertRaisesMessage(
            CustomerCartValidationError,
            "One or more excursions are not enabled for this concierge property.",
        ):
            self.validator.validate_for_checkout(
                organisation=self.organisation,
                conversation=self.conversation,
                request=request,
                checked_at=timezone.now(),
            )

        base_validate.assert_not_called()

    @patch(
        "ticketing.ai.customer.cart_components."
        "DjangoCustomerCartValidator.validate_for_checkout"
    )
    def test_wrong_pickup_location_is_rejected_before_base_checkout_validation(
        self,
        base_validate,
    ):
        request = self.request_for(
            product_id=self.allowed_product.pk,
            pickup_location_id=self.other_pickup.pk,
        )

        with self.assertRaisesMessage(
            CustomerCartValidationError,
            "The selected pickup location does not match this concierge property.",
        ):
            self.validator.validate_for_checkout(
                organisation=self.organisation,
                conversation=self.conversation,
                request=request,
                checked_at=timezone.now(),
            )

        base_validate.assert_not_called()

    @patch(
        "ticketing.ai.customer.cart_components."
        "DjangoCustomerCartValidator.validate_for_checkout"
    )
    def test_missing_property_pickup_configuration_is_rejected(
        self,
        base_validate,
    ):
        self.location.linked_pickup_location = None
        self.location.save(update_fields=["linked_pickup_location"])

        request = self.request_for(
            product_id=self.allowed_product.pk,
            pickup_location_id=None,
        )

        with self.assertRaisesMessage(
            CustomerCartValidationError,
            "This concierge property does not have a configured pickup location.",
        ):
            self.validator.validate_for_checkout(
                organisation=self.organisation,
                conversation=self.conversation,
                request=request,
                checked_at=timezone.now(),
            )

        base_validate.assert_not_called()

    @patch(
        "ticketing.ai.customer.cart_components."
        "DjangoCustomerCartValidator.validate_for_checkout"
    )
    def test_direct_customer_without_referral_uses_existing_base_validator_unchanged(
        self,
        base_validate,
    ):
        sentinel = object()
        base_validate.return_value = sentinel

        direct_conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095550072",
        )
        request = self.request_for(
            product_id=self.blocked_product.pk,
            pickup_location_id=self.other_pickup.pk,
        )

        result = self.validator.validate_for_checkout(
            organisation=self.organisation,
            conversation=direct_conversation,
            request=request,
            checked_at=timezone.now(),
        )

        self.assertIs(result, sentinel)
        base_validate.assert_called_once()
        kwargs = base_validate.call_args.kwargs
        self.assertEqual(kwargs["organisation"], self.organisation)
        self.assertEqual(kwargs["conversation"], direct_conversation)
        self.assertEqual(kwargs["request"], request)
