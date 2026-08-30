from datetime import date, time

from django.test import TestCase

from organisations.models import Organisation
from ticketing.ai.customer.django_tool_adapters import (
    DjangoCustomerPickupRepository,
    PublicProduct,
)
from ticketing.ai.customer.pickup_tools import PickupScheduleRequest
from ticketing.models import (
    ExperienceProduct,
    PickupLocation,
    ProductPickupSchedule,
)


class CustomerAIPickupScheduleTests(TestCase):
    def test_generic_schedule_is_used_when_no_date_or_weekday_override_exists(self):
        organisation = Organisation.objects.create(
            name="Pickup tenant", slug="pickup-tenant", is_active=True
        )
        product_model = ExperienceProduct.objects.create(
            organisation=organisation,
            name="Saona",
            slug="saona",
            product_type="excursion",
            status="active",
        )
        location = PickupLocation.objects.create(
            organisation=organisation,
            name="Dreams Macao Beach",
            default_pickup_point="Lobby",
            default_instructions="Wait 10 minutes before pickup",
        )
        schedule = ProductPickupSchedule.objects.create(
            product=product_model,
            pickup_location=location,
            pickup_time=time(8, 20),
        )

        result = DjangoCustomerPickupRepository().resolve_pickup_schedule(
            organisation=organisation,
            product=PublicProduct(
                model=product_model,
                public_url=None,
                currency="USD",
            ),
            pickup_location=location,
            request=PickupScheduleRequest(
                product_id=product_model.pk,
                pickup_location_id=location.pk,
                service_date=date(2026, 8, 30),
            ),
        )

        self.assertIsNotNone(result)
        self.assertEqual(result["schedule_id"], schedule.pk)
        self.assertEqual(result["pickup_time"], time(8, 20))
        self.assertEqual(result["meeting_point"], "Lobby")
