"""Integration tests for authenticated customer AI staff API endpoints."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from organisations.models import Membership, Organisation
from rest_framework.test import APIClient

from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIHandoff,
    CustomerAIMessage,
    CustomerItineraryCart,
)


class FakeStaffReplyService:
    """Test double loaded through the same setting used in production."""

    calls = []
    messages_by_key = {}

    @classmethod
    def reset(cls):
        cls.calls = []
        cls.messages_by_key = {}

    def queue_reply(
        self,
        *,
        organisation,
        conversation,
        staff_user,
        text,
        idempotency_key,
    ):
        self.__class__.calls.append(
            {
                "organisation": organisation,
                "conversation": conversation,
                "staff_user": staff_user,
                "text": text,
                "idempotency_key": idempotency_key,
            }
        )
        existing_id = self.__class__.messages_by_key.get(idempotency_key)
        if existing_id:
            return CustomerAIMessage.objects.get(pk=existing_id)
        message = CustomerAIMessage.objects.create(
            conversation=conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            message_type="text",
            text=text,
            metadata={"delivery_status": "queued", "private": "hidden"},
        )
        self.__class__.messages_by_key[idempotency_key] = message.pk
        return message


class FakeHandoffService:
    calls = []

    @classmethod
    def reset(cls):
        cls.calls = []

    def assign_to_staff(
        self, *, organisation, conversation, handoff, staff_user
    ):
        self.__class__.calls.append(("assign", organisation.pk, handoff.pk))
        now = timezone.now()
        handoff.status = CustomerAIHandoff.STATUS_ASSIGNED
        handoff.assigned_to = staff_user
        handoff.assigned_at = now
        handoff.save(
            update_fields=("status", "assigned_to", "assigned_at", "updated_at")
        )
        conversation.status = CustomerAIConversation.STATUS_HUMAN_OWNED
        conversation.human_owned_at = now
        conversation.save(
            update_fields=("status", "human_owned_at", "updated_at")
        )
        return handoff, conversation

    def resolve(
        self,
        *,
        organisation,
        conversation,
        handoff,
        staff_user,
        resolution,
        resume_ai,
    ):
        self.__class__.calls.append(("resolve", organisation.pk, handoff.pk))
        handoff.status = CustomerAIHandoff.STATUS_RESOLVED
        handoff.resolution = resolution
        handoff.resolved_at = timezone.now()
        handoff.save(
            update_fields=("status", "resolution", "resolved_at", "updated_at")
        )
        conversation.status = (
            CustomerAIConversation.STATUS_ACTIVE
            if resume_ai
            else CustomerAIConversation.STATUS_HUMAN_OWNED
        )
        conversation.save(update_fields=("status", "updated_at"))
        return handoff, conversation

    def cancel_unassigned(
        self, *, organisation, conversation, handoff, staff_user
    ):
        self.__class__.calls.append(("cancel", organisation.pk, handoff.pk))
        handoff.status = CustomerAIHandoff.STATUS_CANCELLED
        handoff.cancelled_at = timezone.now()
        handoff.save(update_fields=("status", "cancelled_at", "updated_at"))
        return handoff, conversation


@override_settings(
    CUSTOMER_AI_STAFF_REPLY_SERVICE=(
        "ticketing.tests.test_customer_ai_views.FakeStaffReplyService"
    ),
    CUSTOMER_AI_HANDOFF_SERVICE=(
        "ticketing.tests.test_customer_ai_views.FakeHandoffService"
    ),
)
class CustomerAIViewTests(TestCase):
    @classmethod
    def create_user(cls, identifier):
        User = get_user_model()
        return User.objects.create_user(
            username=identifier.split("@", 1)[0],
            email=identifier,
            password="Strong-test-password-123",
        )

    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="customer-ai-view-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Tour Company",
            slug="customer-ai-view-other-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive Tour Company",
            slug="customer-ai-view-inactive-org",
            business_type="ticketing",
            is_active=False,
        )
        cls.owner = cls.create_user("customer-ai-owner@example.com")
        cls.cashier = cls.create_user("customer-ai-cashier@example.com")
        cls.multi_member = cls.create_user("customer-ai-multiple@example.com")
        cls.inactive_member = cls.create_user("customer-ai-inactive@example.com")
        Membership.objects.create(
            user=cls.owner,
            organisation=cls.organisation,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.cashier,
            organisation=cls.organisation,
            role="cashier",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.multi_member,
            organisation=cls.organisation,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.multi_member,
            organisation=cls.other_organisation,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.inactive_member,
            organisation=cls.inactive_organisation,
            role="owner",
            is_active=True,
        )

    def setUp(self):
        FakeStaffReplyService.reset()
        FakeHandoffService.reset()
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.conversation = self.make_conversation(
            organisation=self.organisation,
            customer_id="18095552001",
            customer_name="Maria",
            hotel_name="Hotel Beach",
        )
        self.other_conversation = self.make_conversation(
            organisation=self.other_organisation,
            customer_id="18095552999",
            customer_name="Other Customer",
        )

    def make_conversation(
        self,
        *,
        organisation,
        customer_id,
        customer_name="",
        hotel_name="",
        status=CustomerAIConversation.STATUS_ACTIVE,
        channel=CustomerAIConversation.CHANNEL_WHATSAPP,
    ):
        return CustomerAIConversation.objects.create(
            organisation=organisation,
            channel=channel,
            external_customer_id=customer_id,
            customer_name=customer_name,
            hotel_name=hotel_name,
            status=status,
            last_inbound_at=timezone.now(),
        )

    def make_handoff(self, conversation=None, *, organisation=None, status=None):
        conversation = conversation or self.conversation
        return CustomerAIHandoff.objects.create(
            organisation=organisation or conversation.organisation,
            conversation=conversation,
            status=status or CustomerAIHandoff.STATUS_PENDING,
            category="customer_request",
            priority=CustomerAIHandoff.PRIORITY_NORMAL,
            reason="Customer asked for staff assistance.",
            idempotency_key=f"handoff:view-test:{conversation.pk}:{CustomerAIHandoff.objects.count()}",
        )

    def make_cart(self, conversation=None, *, organisation=None):
        conversation = conversation or self.conversation
        _token, token_hash = CustomerItineraryCart.generate_token()
        return CustomerItineraryCart.objects.create(
            organisation=organisation or conversation.organisation,
            conversation=conversation,
            token_hash=token_hash,
            idempotency_key=f"cart:view-test:{conversation.pk}:{CustomerItineraryCart.objects.count()}",
            currency="USD",
            subtotal=Decimal("90.00"),
            discount_total=Decimal("10.00"),
            total=Decimal("80.00"),
            expires_at=timezone.now() + timedelta(hours=2),
        )

    @staticmethod
    def results(response):
        return response.data.get("results", response.data)

    def test_authentication_is_required(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        self.assertIn(response.status_code, (401, 403))

    def test_disallowed_role_is_forbidden(self):
        self.client.force_authenticate(self.cashier)
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        self.assertEqual(response.status_code, 403)

    def test_multiple_memberships_require_trusted_tenant_context(self):
        self.client.force_authenticate(self.multi_member)
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("organisation", response.data)

    def test_inactive_organisation_is_forbidden(self):
        self.client.force_authenticate(self.inactive_member)
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        self.assertEqual(response.status_code, 403)

    def test_conversation_list_is_tenant_scoped_and_masks_whatsapp_id(self):
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        self.assertEqual(response.status_code, 200)
        rows = self.results(response)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], self.conversation.pk)
        self.assertEqual(rows[0]["customer_reference"], "••••2001")
        self.assertNotIn("external_customer_id", rows[0])
        self.assertNotContains(response, "18095552999")

    def test_conversation_list_filters_search_status_channel_and_handoff(self):
        handoff = self.make_conversation(
            organisation=self.organisation,
            customer_id="18095552002",
            customer_name="Carlos",
            status=CustomerAIConversation.STATUS_HANDOFF_REQUESTED,
        )
        search_response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list"),
            {"search": "Hotel Beach"},
        )
        handoff_response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list"),
            {"handoff_only": "true"},
        )
        status_response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list"),
            {"status": CustomerAIConversation.STATUS_ACTIVE, "channel": "whatsapp"},
        )

        self.assertEqual([row["id"] for row in self.results(search_response)], [self.conversation.pk])
        self.assertEqual([row["id"] for row in self.results(handoff_response)], [handoff.pk])
        self.assertEqual([row["id"] for row in self.results(status_response)], [self.conversation.pk])

    def test_invalid_conversation_filter_returns_400(self):
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list"),
            {"status": "not-a-status"},
        )
        self.assertEqual(response.status_code, 400)

    def test_conversation_detail_is_scoped_and_does_not_expose_provider_ids(self):
        own = self.client.get(
            reverse(
                "ticketing-customer-ai-conversations-detail",
                kwargs={"pk": self.conversation.pk},
            )
        )
        other = self.client.get(
            reverse(
                "ticketing-customer-ai-conversations-detail",
                kwargs={"pk": self.other_conversation.pk},
            )
        )
        self.assertEqual(own.status_code, 200)
        self.assertEqual(other.status_code, 404)
        self.assertNotIn("last_response_id", own.data)
        self.assertNotIn("provider_conversation_id", own.data)
        self.assertNotIn("external_customer_id", own.data)

    def test_messages_action_orders_paginates_and_hides_metadata(self):
        first = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.view-first",
            text="First",
            metadata={"secret": "hidden", "customer_ai_state": {"status": "sent"}},
        )
        second = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            external_message_id="wamid.view-second",
            text="Second",
            metadata={"secret": "hidden", "delivery_status": "delivered"},
        )
        response = self.client.get(
            reverse(
                "ticketing-customer-ai-conversations-messages",
                kwargs={"pk": self.conversation.pk},
            ),
            {"limit": 2},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data["results"]], [first.pk, second.pk])
        self.assertEqual(response.data["results"][0]["processing_status"], "sent")
        self.assertEqual(response.data["results"][1]["delivery_status"], "delivered")
        self.assertNotIn("metadata", response.data["results"][0])
        self.assertEqual(response.data["next_before_id"], first.pk)

    def test_nested_handoffs_and_carts_are_conversation_scoped(self):
        handoff = self.make_handoff()
        cart = self.make_cart()
        self.make_handoff(self.other_conversation)
        self.make_cart(self.other_conversation)

        handoffs = self.client.get(
            reverse(
                "ticketing-customer-ai-conversations-handoffs",
                kwargs={"pk": self.conversation.pk},
            )
        )
        carts = self.client.get(
            reverse(
                "ticketing-customer-ai-conversations-carts",
                kwargs={"pk": self.conversation.pk},
            )
        )
        self.assertEqual([row["id"] for row in self.results(handoffs)], [handoff.pk])
        self.assertEqual([row["id"] for row in self.results(carts)], [cart.pk])
        self.assertNotIn("token_hash", self.results(carts)[0])
        self.assertNotIn("idempotency_key", self.results(carts)[0])

    def test_top_level_handoff_and_cart_lists_are_tenant_scoped(self):
        handoff = self.make_handoff()
        cart = self.make_cart()
        self.make_handoff(self.other_conversation)
        self.make_cart(self.other_conversation)

        handoffs = self.client.get(reverse("ticketing-customer-ai-handoffs-list"))
        carts = self.client.get(reverse("ticketing-customer-ai-carts-list"))
        self.assertEqual([row["id"] for row in self.results(handoffs)], [handoff.pk])
        self.assertEqual([row["id"] for row in self.results(carts)], [cart.pk])

    def test_pagination_honours_page_size(self):
        self.make_conversation(
            organisation=self.organisation,
            customer_id="18095552003",
            customer_name="Second Customer",
        )
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list"),
            {"page_size": 1},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["count"], 2)
        self.assertIsNotNone(response.data["next"])

    def test_staff_reply_requires_human_ownership(self):
        response = self.client.post(
            reverse(
                "ticketing-customer-ai-conversations-staff-reply",
                kwargs={"pk": self.conversation.pk},
            ),
            {"text": "Hello, I can help."},
            format="json",
            HTTP_IDEMPOTENCY_KEY="staff-reply:test:1",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(FakeStaffReplyService.calls), 0)

    def test_staff_reply_requires_valid_idempotency_header(self):
        self.conversation.status = CustomerAIConversation.STATUS_HUMAN_OWNED
        self.conversation.save(update_fields=("status", "updated_at"))
        url = reverse(
            "ticketing-customer-ai-conversations-staff-reply",
            kwargs={"pk": self.conversation.pk},
        )
        missing = self.client.post(url, {"text": "Hello"}, format="json")
        unsafe = self.client.post(
            url,
            {"text": "Hello"},
            format="json",
            HTTP_IDEMPOTENCY_KEY="bad key!",
        )
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(unsafe.status_code, 400)
        self.assertEqual(len(FakeStaffReplyService.calls), 0)

    def test_staff_reply_creates_idempotent_outbound_message(self):
        self.conversation.status = CustomerAIConversation.STATUS_HUMAN_OWNED
        self.conversation.save(update_fields=("status", "updated_at"))
        url = reverse(
            "ticketing-customer-ai-conversations-staff-reply",
            kwargs={"pk": self.conversation.pk},
        )
        headers = {"HTTP_IDEMPOTENCY_KEY": "staff-reply:test:same"}
        first = self.client.post(url, {"text": "  Hello, I can help.  "}, format="json", **headers)
        second = self.client.post(url, {"text": "Hello, I can help."}, format="json", **headers)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(first.data["direction"], CustomerAIMessage.DIRECTION_OUTBOUND)
        self.assertNotIn("metadata", first.data)
        self.assertEqual(CustomerAIMessage.objects.filter(direction="outbound").count(), 1)

    def test_handoff_assign_resolve_and_cancel_actions(self):
        assign_handoff = self.make_handoff()
        assign_response = self.client.post(
            reverse(
                "ticketing-customer-ai-handoffs-assign",
                kwargs={"pk": assign_handoff.pk},
            ),
            {},
            format="json",
        )
        self.assertEqual(assign_response.status_code, 200)
        self.assertEqual(assign_response.data["status"], CustomerAIHandoff.STATUS_ASSIGNED)

        resolve_response = self.client.post(
            reverse(
                "ticketing-customer-ai-handoffs-resolve",
                kwargs={"pk": assign_handoff.pk},
            ),
            {"resolution": "Customer question answered.", "resume_ai": True},
            format="json",
        )
        self.assertEqual(resolve_response.status_code, 200)
        self.assertEqual(resolve_response.data["status"], CustomerAIHandoff.STATUS_RESOLVED)
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.status, CustomerAIConversation.STATUS_ACTIVE)

        cancel_conversation = self.make_conversation(
            organisation=self.organisation,
            customer_id="18095552004",
        )
        cancel_handoff = self.make_handoff(cancel_conversation)
        cancel_response = self.client.post(
            reverse(
                "ticketing-customer-ai-handoffs-cancel",
                kwargs={"pk": cancel_handoff.pk},
            ),
            {},
            format="json",
        )
        self.assertEqual(cancel_response.status_code, 200)
        self.assertEqual(cancel_response.data["status"], CustomerAIHandoff.STATUS_CANCELLED)

    def test_handoff_actions_reject_request_controlled_assignee_and_bad_resolution(self):
        handoff = self.make_handoff()
        assign = self.client.post(
            reverse(
                "ticketing-customer-ai-handoffs-assign",
                kwargs={"pk": handoff.pk},
            ),
            {"assigned_to": self.owner.pk},
            format="json",
        )
        resolve = self.client.post(
            reverse(
                "ticketing-customer-ai-handoffs-resolve",
                kwargs={"pk": handoff.pk},
            ),
            {"resolution": "x", "resume_ai": True},
            format="json",
        )
        self.assertEqual(assign.status_code, 400)
        self.assertEqual(resolve.status_code, 400)

    def test_cross_tenant_handoff_and_cart_details_return_404(self):
        other_handoff = self.make_handoff(self.other_conversation)
        other_cart = self.make_cart(self.other_conversation)
        handoff_response = self.client.get(
            reverse(
                "ticketing-customer-ai-handoffs-detail",
                kwargs={"pk": other_handoff.pk},
            )
        )
        cart_response = self.client.get(
            reverse(
                "ticketing-customer-ai-carts-detail",
                kwargs={"pk": other_cart.pk},
            )
        )
        self.assertEqual(handoff_response.status_code, 404)
        self.assertEqual(cart_response.status_code, 404)

    def test_invalid_handoff_status_filter_returns_400(self):
        response = self.client.get(
            reverse("ticketing-customer-ai-handoffs-list"),
            {"status": "invalid"},
        )
        self.assertEqual(response.status_code, 400)
