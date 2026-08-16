"""Tests for the public customer cart-session conversion endpoint."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.customer_cart_conversion_service import (
    CustomerCartConversionChangedError,
    CustomerCartConversionNotFoundError,
    CustomerCartConversionRepositoryError,
    CustomerCartConversionValidationError,
)


VIEW_MODULE = "ticketing.customer_ai_views"


class PublicCustomerCartConversionTests(APITestCase):
    """Verify the unauthenticated, tenant-scoped checkout boundary."""

    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="public-cart-conversion",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive Tours",
            slug="inactive-cart-conversion",
            business_type="ticketing",
            is_active=False,
        )

    def setUp(self):
        self.url = reverse(
            "ticketing-public-customer-cart-session-convert",
            kwargs={"organisation_slug": self.organisation.slug},
        )
        self.payload = {
            "token": "public-cart-token-that-is-long-enough",
            "full_name": "Jane Customer",
            "whatsapp": "+18095553001",
            "email": "jane@example.com",
            "hotel_name": "Test Hotel",
            "notes": "Vegetarian lunch",
            "payment_choice": "deposit",
        }

    @staticmethod
    def result(*, organisation, created=True):
        return SimpleNamespace(
            booking=SimpleNamespace(
                pk=71,
                organisation=organisation,
                booking_code="PCD-PUBLIC71",
            ),
            cart=SimpleNamespace(pk=19),
            created=created,
        )

    def assert_private_response(self, response):
        self.assertEqual(response["Cache-Control"], "no-store, private")
        self.assertEqual(response["Pragma"], "no-cache")

    def test_route_is_registered(self):
        self.assertEqual(
            self.url,
            "/api/ticketing/public/public-cart-conversion/"
            "customer-cart-session/convert/",
        )

    @patch(f"{VIEW_MODULE}._serialize_public_booking")
    @patch(f"{VIEW_MODULE}.DjangoCustomerCartConversionService")
    def test_valid_request_creates_booking_from_server_controlled_service(
        self,
        service_class,
        serialize_booking,
    ):
        result = self.result(organisation=self.organisation)
        service_class.return_value.convert.return_value = result
        serialize_booking.return_value = {
            "id": 71,
            "booking_code": "PCD-PUBLIC71",
            "total_amount": "80.00",
        }

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertTrue(response.data["created"])
        self.assertEqual(response.data["booking"]["booking_code"], "PCD-PUBLIC71")
        self.assert_private_response(response)

        call = service_class.return_value.convert.call_args.kwargs
        self.assertEqual(call["organisation"], self.organisation)
        self.assertEqual(call["raw_token"], self.payload["token"])
        self.assertIsNotNone(call["request"])
        checkout = call["checkout"]
        self.assertEqual(checkout.customer_name, "Jane Customer")
        self.assertEqual(checkout.customer_whatsapp, "+18095553001")
        self.assertEqual(checkout.customer_email, "jane@example.com")
        self.assertEqual(checkout.customer_hotel, "Test Hotel")
        self.assertEqual(checkout.customer_notes, "Vegetarian lunch")
        self.assertEqual(checkout.payment_choice, "deposit")

    @patch(f"{VIEW_MODULE}._serialize_public_booking")
    @patch(f"{VIEW_MODULE}.DjangoCustomerCartConversionService")
    def test_duplicate_submission_returns_existing_booking_with_200(
        self,
        service_class,
        serialize_booking,
    ):
        service_class.return_value.convert.return_value = self.result(
            organisation=self.organisation,
            created=False,
        )
        serialize_booking.return_value = {"booking_code": "PCD-PUBLIC71"}

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        self.assertFalse(response.data["created"])
        self.assert_private_response(response)

    @patch(f"{VIEW_MODULE}.DjangoCustomerCartConversionService")
    def test_invalid_checkout_input_never_calls_conversion_service(self, service_class):
        invalid_cases = (
            {**self.payload, "token": "short"},
            {**self.payload, "full_name": ""},
            {**self.payload, "whatsapp": ""},
            {**self.payload, "email": "not-an-email"},
            {**self.payload, "payment_choice": "free"},
        )

        for payload in invalid_cases:
            with self.subTest(payload=payload):
                response = self.client.post(self.url, payload, format="json")
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(response.data["code"], "invalid_request")
                self.assertIn("errors", response.data)
                self.assert_private_response(response)

        service_class.assert_not_called()

    @patch(f"{VIEW_MODULE}.DjangoCustomerCartConversionService")
    def test_optional_fields_and_payment_choice_receive_safe_defaults(
        self,
        service_class,
    ):
        service_class.return_value.convert.return_value = self.result(
            organisation=self.organisation
        )
        payload = {
            "token": self.payload["token"],
            "full_name": self.payload["full_name"],
            "whatsapp": self.payload["whatsapp"],
            "email": self.payload["email"],
        }

        with patch(f"{VIEW_MODULE}._serialize_public_booking", return_value={}):
            response = self.client.post(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        checkout = service_class.return_value.convert.call_args.kwargs["checkout"]
        self.assertEqual(checkout.customer_hotel, "")
        self.assertEqual(checkout.customer_notes, "")
        self.assertEqual(checkout.payment_choice, "pending")

    @patch(f"{VIEW_MODULE}.DjangoCustomerCartConversionService")
    def test_unknown_and_inactive_organisations_are_not_enumerable(self, service_class):
        urls = (
            reverse(
                "ticketing-public-customer-cart-session-convert",
                kwargs={"organisation_slug": "unknown-cart-conversion"},
            ),
            reverse(
                "ticketing-public-customer-cart-session-convert",
                kwargs={"organisation_slug": self.inactive_organisation.slug},
            ),
        )

        responses = [self.client.post(url, self.payload, format="json") for url in urls]

        for response in responses:
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
            self.assertEqual(response.data["code"], "invalid_token")
            self.assertEqual(
                response.data["message"],
                "The cart session could not be found.",
            )
            self.assert_private_response(response)
        self.assertEqual(responses[0].data, responses[1].data)
        service_class.assert_not_called()

    @patch(f"{VIEW_MODULE}.DjangoCustomerCartConversionService")
    def test_unknown_or_cross_tenant_token_is_hidden(self, service_class):
        service_class.return_value.convert.side_effect = (
            CustomerCartConversionNotFoundError("internal lookup detail")
        )

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "invalid_token")
        self.assertNotContains(response, "internal lookup detail", status_code=404)
        self.assert_private_response(response)

    @patch(f"{VIEW_MODULE}.DjangoCustomerCartConversionService")
    def test_changed_cart_returns_conflict(self, service_class):
        service_class.return_value.convert.side_effect = (
            CustomerCartConversionChangedError(
                "Availability or pricing changed. Please review the itinerary."
            )
        )

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "cart_changed")
        self.assertIn("changed", response.data["message"].lower())
        self.assert_private_response(response)

    @patch(f"{VIEW_MODULE}.DjangoCustomerCartConversionService")
    def test_non_convertible_cart_returns_conflict(self, service_class):
        service_class.return_value.convert.side_effect = (
            CustomerCartConversionValidationError(
                "The cart session is not ready for checkout."
            )
        )

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "cart_not_convertible")
        self.assert_private_response(response)

    @patch(f"{VIEW_MODULE}.DjangoCustomerCartConversionService")
    def test_repository_failure_is_sanitized(self, service_class):
        service_class.return_value.convert.side_effect = (
            CustomerCartConversionRepositoryError(
                "database host and provider credentials must stay private"
            )
        )

        response = self.client.post(self.url, self.payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["code"], "cart_conversion_unavailable")
        self.assertNotContains(response, "database host", status_code=503)
        self.assertNotContains(response, "credentials", status_code=503)
        self.assert_private_response(response)

    @patch(f"{VIEW_MODULE}.BookingSerializer")
    def test_public_booking_serializer_whitelists_sensitive_internal_fields(
        self,
        serializer_class,
    ):
        serializer_class.return_value.data = {
            "id": 71,
            "booking_code": "PCD-PUBLIC71",
            "status": "pending_payment",
            "total_amount": "80.00",
            "items": [{"product_name": "Saona Island"}],
            "customer_whatsapp": "+18095553001",
            "customer_notes": "private notes",
            "external_raw_response": {"provider_secret": "never-return"},
            "external_validation_response": {"private": True},
            "seller_commission_amount": "10.00",
            "owner_net_amount": "70.00",
            "created_by": 99,
        }
        booking = SimpleNamespace(organisation=self.organisation)

        from ticketing.customer_ai_views import _serialize_public_booking

        result = _serialize_public_booking(booking, Mock())

        self.assertEqual(result["booking_code"], "PCD-PUBLIC71")
        self.assertEqual(result["total_amount"], "80.00")
        self.assertIn("items", result)
        sensitive = {
            "customer_whatsapp",
            "customer_notes",
            "external_raw_response",
            "external_validation_response",
            "seller_commission_amount",
            "owner_net_amount",
            "created_by",
        }
        self.assertTrue(sensitive.isdisjoint(result))
