from django.test import SimpleTestCase

from subscriptions.serializers import CreateCheckoutSessionSerializer


class ColmadoCheckoutSerializerTests(SimpleTestCase):
    def build_payload(self, **overrides):
        payload = {
            "company_name": "Colmado La Esquina",
            "owner_name": "Juan Pérez",
            "email": "juan@example.com",
            "password": "ClaveSegura123",
            "app": "colmado",
            "business_type": "colmado",
            "plan": "basic",
        }
        payload.update(overrides)
        return payload

    def test_accepts_colmado_checkout_information(self):
        serializer = CreateCheckoutSessionSerializer(
            data=self.build_payload(
                store_name="Sucursal Principal",
                store_address="Calle Duarte número 10",
                store_phone="8095550101",
            )
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data["business_type"],
            "colmado",
        )
        self.assertEqual(
            serializer.validated_data["store_name"],
            "Sucursal Principal",
        )
        self.assertEqual(
            serializer.validated_data["store_address"],
            "Calle Duarte número 10",
        )
        self.assertEqual(
            serializer.validated_data["store_phone"],
            "8095550101",
        )

    def test_uses_company_name_when_store_name_is_missing(self):
        serializer = CreateCheckoutSessionSerializer(
            data=self.build_payload()
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data["store_name"],
            "Colmado La Esquina",
        )

    def test_uses_company_name_when_store_name_is_blank(self):
        serializer = CreateCheckoutSessionSerializer(
            data=self.build_payload(store_name="   ")
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data["store_name"],
            "Colmado La Esquina",
        )

    def test_existing_business_types_keep_previous_behavior(self):
        serializer = CreateCheckoutSessionSerializer(
            data=self.build_payload(
                business_type="ticketing",
                app="ticketing",
            )
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(
            serializer.validated_data["business_type"],
            "ticketing",
        )
        self.assertNotIn(
            "store_name",
            serializer.validated_data,
        )

    def test_rejects_unknown_business_type(self):
        serializer = CreateCheckoutSessionSerializer(
            data=self.build_payload(
                business_type="unknown-business",
            )
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("business_type", serializer.errors)

    def test_requires_password_with_at_least_eight_characters(self):
        serializer = CreateCheckoutSessionSerializer(
            data=self.build_payload(password="1234567")
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("password", serializer.errors)