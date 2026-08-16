"""Validation and transaction-integrity tests for account registration."""

from unittest.mock import patch

from django.db import DatabaseError
from django.test import TestCase
from organisations.models import Membership, Organisation

from .models import CustomUser
from .serializers import RegisterSerializer


class RegistrationValidationTests(TestCase):
    def valid_payload(self, **overrides):
        payload = {
            "email": "integrity-owner@example.com",
            "username": "integrity-owner",
            "password": "Strong-test-password-123",
            "organisation_name": "Integrity Test Organisation",
            "business_type": "ticketing",
            "plan": "pro",
        }
        payload.update(overrides)
        return payload

    def test_every_declared_business_type_is_accepted(self):
        for business_type, _label in Organisation.BUSINESS_TYPE_CHOICES:
            with self.subTest(business_type=business_type):
                serializer = RegisterSerializer(
                    data=self.valid_payload(business_type=business_type)
                )

                self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_every_declared_plan_is_accepted(self):
        for plan, _label in Organisation.PLAN_CHOICES:
            with self.subTest(plan=plan):
                serializer = RegisterSerializer(
                    data=self.valid_payload(plan=plan)
                )

                self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_unknown_business_type_is_rejected_before_database_writes(self):
        serializer = RegisterSerializer(
            data=self.valid_payload(business_type="unknown-business")
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("business_type", serializer.errors)
        self.assertFalse(CustomUser.objects.exists())
        self.assertFalse(Organisation.objects.exists())
        self.assertFalse(Membership.objects.exists())

    def test_unknown_plan_is_rejected_before_database_writes(self):
        serializer = RegisterSerializer(
            data=self.valid_payload(plan="unlimited-free")
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("plan", serializer.errors)
        self.assertFalse(CustomUser.objects.exists())
        self.assertFalse(Organisation.objects.exists())
        self.assertFalse(Membership.objects.exists())

    def test_blank_or_whitespace_organisation_name_is_rejected(self):
        for organisation_name in ("", "   ", "\t\n"):
            with self.subTest(organisation_name=repr(organisation_name)):
                serializer = RegisterSerializer(
                    data=self.valid_payload(
                        organisation_name=organisation_name
                    )
                )

                self.assertFalse(serializer.is_valid())
                self.assertIn("organisation_name", serializer.errors)

        self.assertFalse(CustomUser.objects.exists())
        self.assertFalse(Organisation.objects.exists())

    def test_email_duplicate_is_rejected_regardless_of_letter_case(self):
        CustomUser.objects.create_user(
            username="existing-integrity-owner",
            email="Integrity-Owner@Example.com",
            password="Strong-test-password-123",
        )
        serializer = RegisterSerializer(data=self.valid_payload())

        self.assertFalse(serializer.is_valid())
        self.assertIn("email", serializer.errors)
        self.assertEqual(CustomUser.objects.count(), 1)
        self.assertFalse(Organisation.objects.exists())


class RegistrationTransactionTests(TestCase):
    def valid_serializer(self):
        serializer = RegisterSerializer(
            data={
                "email": "rollback-owner@example.com",
                "username": "rollback-owner",
                "password": "Strong-test-password-123",
                "organisation_name": "Rollback Organisation",
                "business_type": "ticketing",
                "plan": "pro",
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return serializer

    def assert_no_partial_registration_records(self):
        self.assertFalse(CustomUser.objects.exists())
        self.assertFalse(Organisation.objects.exists())
        self.assertFalse(Membership.objects.exists())

    def test_organisation_creation_failure_rolls_back_created_user(self):
        serializer = self.valid_serializer()

        with patch(
            "accounts.serializers.Organisation.objects.create",
            side_effect=DatabaseError("simulated organisation failure"),
        ):
            with self.assertRaises(DatabaseError):
                serializer.save()

        self.assert_no_partial_registration_records()

    def test_membership_creation_failure_rolls_back_user_and_organisation(self):
        serializer = self.valid_serializer()

        with patch(
            "accounts.serializers.Membership.objects.create",
            side_effect=DatabaseError("simulated membership failure"),
        ):
            with self.assertRaises(DatabaseError):
                serializer.save()

        self.assert_no_partial_registration_records()
