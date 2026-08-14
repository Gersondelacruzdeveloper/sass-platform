"""Defence-in-depth tests for customer AI multi-tenant boundaries."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from organisations.models import Membership, Organisation
from rest_framework.test import APIClient

from ticketing.ai.customer.conversation_service import (
    CustomerConversationRepositoryError,
    CustomerConversationService,
)
from ticketing.ai.customer.handoff_service import (
    CustomerHandoffRepositoryError,
    CustomerHandoffService,
)
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIHandoff,
    CustomerAIMessage,
    CustomerItineraryCart,
)


class SpyStaffReplyService:
    calls = []

    @classmethod
    def reset(cls):
        cls.calls = []

    def queue_reply(self, **kwargs):
        self.__class__.calls.append(kwargs)
        raise AssertionError("Cross-tenant staff reply service must not be called.")


class SpyHandoffViewService:
    calls = []

    @classmethod
    def reset(cls):
        cls.calls = []

    def assign_to_staff(self, **kwargs):
        self.__class__.calls.append(kwargs)
        raise AssertionError("Cross-tenant handoff service must not be called.")

    def resolve(self, **kwargs):
        self.__class__.calls.append(kwargs)
        raise AssertionError("Cross-tenant handoff service must not be called.")

    def cancel_unassigned(self, **kwargs):
        self.__class__.calls.append(kwargs)
        raise AssertionError("Cross-tenant handoff service must not be called.")


class NeverCalledHandoffRepository:
    def __init__(self):
        self.called = False

    def assign_handoff(self, **kwargs):
        self.called = True
        raise AssertionError("Repository must not receive a cross-tenant handoff.")


class AllowStaffPolicy:
    def can_manage_handoff(self, **kwargs):
        return True


class NoopNotifier:
    def queue_staff_notification(self, **kwargs):
        return True


class CrossTenantConversationRepository:
    def __init__(self, returned_conversation):
        self.returned_conversation = returned_conversation

    def get_or_create_active_conversation(self, **kwargs):
        return self.returned_conversation, False


@override_settings(
    CUSTOMER_AI_STAFF_REPLY_SERVICE=(
        "ticketing.tests.test_customer_ai_tenant_security.SpyStaffReplyService"
    ),
    CUSTOMER_AI_HANDOFF_SERVICE=(
        "ticketing.tests.test_customer_ai_tenant_security.SpyHandoffViewService"
    ),
)
class CustomerAITenantSecurityTests(TestCase):
    @classmethod
    def create_user(cls, username, email):
        return get_user_model().objects.create_user(
            username=username,
            email=email,
            password="Strong-test-password-123",
        )

    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Organisation A",
            slug="customer-ai-security-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Organisation B",
            slug="customer-ai-security-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.owner_a = cls.create_user("security-owner-a", "owner-a@example.com")
        cls.owner_b = cls.create_user("security-owner-b", "owner-b@example.com")
        cls.viewer_a = cls.create_user("security-viewer-a", "viewer-a@example.com")
        cls.multi_user = cls.create_user("security-multi", "multi@example.com")
        cls.inactive_user = cls.create_user("security-inactive", "inactive@example.com")
        Membership.objects.create(
            user=cls.owner_a,
            organisation=cls.organisation_a,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.owner_b,
            organisation=cls.organisation_b,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.viewer_a,
            organisation=cls.organisation_a,
            role="viewer",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.multi_user,
            organisation=cls.organisation_a,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.multi_user,
            organisation=cls.organisation_b,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.inactive_user,
            organisation=cls.organisation_a,
            role="owner",
            is_active=False,
        )

    def setUp(self):
        SpyStaffReplyService.reset()
        SpyHandoffViewService.reset()
        self.client = APIClient()
        self.client.force_authenticate(self.owner_a)
        self.conversation_a = self.make_conversation(
            self.organisation_a,
            "18095555001",
            "Customer A",
            CustomerAIConversation.STATUS_HUMAN_OWNED,
        )
        self.conversation_b = self.make_conversation(
            self.organisation_b,
            "18095555001",
            "Customer B",
            CustomerAIConversation.STATUS_HUMAN_OWNED,
        )
        self.message_a = self.make_message(
            self.conversation_a, "wamid.security.a", "Private message A"
        )
        self.message_b = self.make_message(
            self.conversation_b, "wamid.security.b", "Private message B"
        )
        self.handoff_a = self.make_handoff(self.conversation_a)
        self.handoff_b = self.make_handoff(self.conversation_b)
        self.cart_a = self.make_cart(self.conversation_a)
        self.cart_b = self.make_cart(self.conversation_b)

    @staticmethod
    def make_conversation(organisation, customer_id, customer_name, status):
        return CustomerAIConversation.objects.create(
            organisation=organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id=customer_id,
            customer_name=customer_name,
            status=status,
        )

    @staticmethod
    def make_message(conversation, external_id, text):
        return CustomerAIMessage.objects.create(
            conversation=conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id=external_id,
            text=text,
            metadata={
                "provider_customer_id": conversation.external_customer_id,
                "raw_provider_payload": "must-never-be-serialized",
                "customer_ai_state": {"status": "pending"},
            },
        )

    @staticmethod
    def make_handoff(conversation):
        return CustomerAIHandoff.objects.create(
            organisation=conversation.organisation,
            conversation=conversation,
            category="customer_request",
            reason="Customer requested help.",
            idempotency_key=f"handoff:security:{conversation.organisation_id}",
        )

    @staticmethod
    def make_cart(conversation):
        raw_token, token_hash = CustomerItineraryCart.generate_token()
        cart = CustomerItineraryCart.objects.create(
            organisation=conversation.organisation,
            conversation=conversation,
            token_hash=token_hash,
            idempotency_key=f"cart:security:{conversation.organisation_id}",
            currency="USD",
            subtotal=Decimal("90.00"),
            discount_total=Decimal("10.00"),
            total=Decimal("80.00"),
            expires_at=timezone.now() + timedelta(hours=2),
        )
        cart._test_raw_token = raw_token
        return cart

    @staticmethod
    def result_rows(response):
        return response.data.get("results", response.data)

    def test_same_external_customer_id_is_isolated_per_organisation(self):
        self.assertEqual(
            self.conversation_a.external_customer_id,
            self.conversation_b.external_customer_id,
        )
        self.assertNotEqual(
            self.conversation_a.organisation_id,
            self.conversation_b.organisation_id,
        )
        self.assertEqual(
            CustomerAIConversation.objects.filter(
                external_customer_id="18095555001"
            ).count(),
            2,
        )

    def test_forged_organisation_query_parameters_cannot_change_list_scope(self):
        forged = {
            "organisation": self.organisation_b.pk,
            "organisation_id": self.organisation_b.pk,
            "organisation_slug": self.organisation_b.slug,
        }
        endpoints = (
            "ticketing-customer-ai-conversations-list",
            "ticketing-customer-ai-handoffs-list",
            "ticketing-customer-ai-carts-list",
        )
        expected_ids = (self.conversation_a.pk, self.handoff_a.pk, self.cart_a.pk)
        for endpoint, expected_id in zip(endpoints, expected_ids):
            with self.subTest(endpoint=endpoint):
                response = self.client.get(reverse(endpoint), forged)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    [row["id"] for row in self.result_rows(response)],
                    [expected_id],
                )

    def test_cross_tenant_detail_id_guessing_returns_404_for_all_resources(self):
        routes = (
            ("ticketing-customer-ai-conversations-detail", self.conversation_b.pk),
            ("ticketing-customer-ai-handoffs-detail", self.handoff_b.pk),
            ("ticketing-customer-ai-carts-detail", self.cart_b.pk),
        )
        for route, pk in routes:
            with self.subTest(route=route):
                response = self.client.get(reverse(route, kwargs={"pk": pk}))
                self.assertEqual(response.status_code, 404)

    def test_cross_tenant_nested_conversation_resources_return_404(self):
        for route in (
            "ticketing-customer-ai-conversations-messages",
            "ticketing-customer-ai-conversations-handoffs",
            "ticketing-customer-ai-conversations-carts",
        ):
            with self.subTest(route=route):
                response = self.client.get(
                    reverse(route, kwargs={"pk": self.conversation_b.pk})
                )
                self.assertEqual(response.status_code, 404)

    def test_cross_tenant_staff_reply_is_rejected_before_service_call(self):
        response = self.client.post(
            reverse(
                "ticketing-customer-ai-conversations-staff-reply",
                kwargs={"pk": self.conversation_b.pk},
            ),
            {"text": "Forged cross-tenant reply", "organisation_id": self.organisation_b.pk},
            format="json",
            HTTP_IDEMPOTENCY_KEY="security:cross-tenant-reply",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(SpyStaffReplyService.calls, [])
        self.assertEqual(
            CustomerAIMessage.objects.filter(
                conversation=self.conversation_b,
                direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            ).count(),
            0,
        )

    def test_cross_tenant_handoff_actions_are_rejected_before_service_call(self):
        actions = (
            ("ticketing-customer-ai-handoffs-assign", {}),
            (
                "ticketing-customer-ai-handoffs-resolve",
                {"resolution": "Forged resolution", "resume_ai": True},
            ),
            ("ticketing-customer-ai-handoffs-cancel", {}),
        )
        for route, body in actions:
            with self.subTest(route=route):
                response = self.client.post(
                    reverse(route, kwargs={"pk": self.handoff_b.pk}),
                    body,
                    format="json",
                )
                self.assertEqual(response.status_code, 404)
        self.assertEqual(SpyHandoffViewService.calls, [])

    def test_message_endpoint_hides_provider_metadata_and_external_ids(self):
        response = self.client.get(
            reverse(
                "ticketing-customer-ai-conversations-messages",
                kwargs={"pk": self.conversation_a.pk},
            )
        )
        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]
        rendered = str(response.data)
        self.assertNotIn("metadata", row)
        self.assertNotIn("external_message_id", row)
        self.assertNotIn("provider_customer_id", rendered)
        self.assertNotIn("raw_provider_payload", rendered)
        self.assertNotIn("wamid.security.a", rendered)

    def test_conversation_endpoint_masks_whatsapp_identity(self):
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        row = self.result_rows(response)[0]
        self.assertEqual(row["customer_reference"], "••••5001")
        self.assertNotIn("external_customer_id", row)
        self.assertNotIn("18095555001", str(response.data))

    def test_cart_endpoints_never_expose_raw_token_hash_or_internal_snapshots(self):
        list_response = self.client.get(
            reverse("ticketing-customer-ai-carts-list")
        )
        detail_response = self.client.get(
            reverse(
                "ticketing-customer-ai-carts-detail",
                kwargs={"pk": self.cart_a.pk},
            )
        )
        for response in (list_response, detail_response):
            rendered = str(response.data)
            self.assertEqual(response.status_code, 200)
            self.assertNotIn("token_hash", rendered)
            self.assertNotIn(self.cart_a.token_hash, rendered)
            self.assertNotIn(self.cart_a._test_raw_token, rendered)
            self.assertNotIn("idempotency_key", rendered)
            self.assertNotIn("promotion_snapshot", rendered)

    def test_disallowed_role_cannot_read_any_customer_ai_resource(self):
        self.client.force_authenticate(self.viewer_a)
        for route in (
            "ticketing-customer-ai-conversations-list",
            "ticketing-customer-ai-handoffs-list",
            "ticketing-customer-ai-carts-list",
        ):
            with self.subTest(route=route):
                self.assertEqual(self.client.get(reverse(route)).status_code, 403)

    def test_inactive_membership_cannot_establish_tenant_context(self):
        self.client.force_authenticate(self.inactive_user)
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("organisation", response.data)

    def test_ambiguous_memberships_cannot_silently_select_a_tenant(self):
        self.client.force_authenticate(self.multi_user)
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("organisation", response.data)

    def test_handoff_domain_service_rejects_scope_before_repository_write(self):
        repository = NeverCalledHandoffRepository()
        service = CustomerHandoffService(
            repository=repository,
            notifier=NoopNotifier(),
            staff_access_policy=AllowStaffPolicy(),
        )
        with self.assertRaises(CustomerHandoffRepositoryError):
            service.assign_to_staff(
                organisation=self.organisation_a,
                conversation=self.conversation_a,
                handoff=self.handoff_b,
                staff_user=self.owner_a,
            )
        self.assertFalse(repository.called)

    def test_conversation_domain_service_rejects_repository_scope_leak(self):
        repository = CrossTenantConversationRepository(self.conversation_b)
        service = CustomerConversationService(repository=repository)
        with self.assertRaises(CustomerConversationRepositoryError):
            service.get_or_create_conversation(
                organisation=self.organisation_a,
                channel="whatsapp",
                external_customer_id="18095555001",
                language="en",
            )

    def test_owner_b_sees_only_organisation_b_data(self):
        self.client.force_authenticate(self.owner_b)
        conversations = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        handoffs = self.client.get(reverse("ticketing-customer-ai-handoffs-list"))
        carts = self.client.get(reverse("ticketing-customer-ai-carts-list"))
        self.assertEqual(
            [row["id"] for row in self.result_rows(conversations)],
            [self.conversation_b.pk],
        )
        self.assertEqual(
            [row["id"] for row in self.result_rows(handoffs)],
            [self.handoff_b.pk],
        )
        self.assertEqual(
            [row["id"] for row in self.result_rows(carts)],
            [self.cart_b.pk],
        )
