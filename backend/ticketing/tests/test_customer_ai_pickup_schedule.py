from datetime import date, time

from django.test import TestCase

from organisations.models import Organisation
from ticketing.ai.customer.django_tool_adapters import (
    DjangoCustomerPickupRepository,
    PublicProduct,
)
from ticketing.ai.customer.pickup_tools import (
    PickupLocationSearch,
    PickupScheduleRequest,
)
from ticketing.ai.customer.schemas import SEARCH_PICKUP_LOCATIONS_TOOL
from ticketing.models import (
    ExperienceProduct,
    PickupLocation,
    ProductPickupSchedule,
)


class CustomerAIPickupScheduleTests(TestCase):
    def create_product(self, *, organisation, name, slug):
        return ExperienceProduct.objects.create(
            organisation=organisation,
            name=name,
            slug=slug,
            product_type="excursion",
            status="active",
        )

    def create_public_product(self, product):
        return PublicProduct(
            model=product,
            public_url=None,
            currency="USD",
        )

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

    def test_pickup_location_search_is_scoped_to_selected_product(self):
        organisation = Organisation.objects.create(
            name="Pickup tenant",
            slug="pickup-tenant-product-scope",
            is_active=True,
        )
        saona = self.create_product(
            organisation=organisation,
            name="Saona",
            slug="saona-product-scope",
        )
        horse_riding = self.create_product(
            organisation=organisation,
            name="Horse Riding",
            slug="horse-riding-product-scope",
        )
        saona_location = PickupLocation.objects.create(
            organisation=organisation,
            name="Dreams Macao Beach",
        )
        horse_riding_location = PickupLocation.objects.create(
            organisation=organisation,
            name="Dreams Macao",
        )
        ProductPickupSchedule.objects.create(
            product=saona,
            pickup_location=saona_location,
            pickup_time=time(7, 20),
        )
        ProductPickupSchedule.objects.create(
            product=horse_riding,
            pickup_location=horse_riding_location,
            pickup_time=time(8, 20),
        )

        results = list(
            DjangoCustomerPickupRepository().search_active_pickup_locations(
                organisation=organisation,
                product=self.create_public_product(saona),
                search=PickupLocationSearch(query="Dreams Macao", limit=10),
            )
        )

        self.assertEqual([location.pk for location in results], [saona_location.pk])
        self.assertNotIn(horse_riding_location, results)

    def test_pickup_search_schema_requires_product_id(self):
        parameters = SEARCH_PICKUP_LOCATIONS_TOOL["parameters"]

        self.assertIn("product_id", parameters["properties"])
        self.assertIn("product_id", parameters["required"])
        self.assertEqual(
            parameters["properties"]["product_id"],
            {"type": "integer", "minimum": 1},
        )

    def test_schedule_resolution_never_uses_another_products_location(self):
        organisation = Organisation.objects.create(
            name="Pickup tenant",
            slug="pickup-tenant-unrelated-product",
            is_active=True,
        )
        saona = self.create_product(
            organisation=organisation,
            name="Saona",
            slug="saona-unrelated-product",
        )
        horse_riding = self.create_product(
            organisation=organisation,
            name="Horse Riding",
            slug="horse-riding-unrelated-product",
        )
        location = PickupLocation.objects.create(
            organisation=organisation,
            name="Dreams Macao",
        )
        ProductPickupSchedule.objects.create(
            product=horse_riding,
            pickup_location=location,
            pickup_time=time(8, 20),
        )

        result = DjangoCustomerPickupRepository().resolve_pickup_schedule(
            organisation=organisation,
            product=self.create_public_product(saona),
            pickup_location=location,
            request=PickupScheduleRequest(
                product_id=saona.pk,
                pickup_location_id=location.pk,
                service_date=date(2026, 8, 30),
            ),
        )

        self.assertIsNone(result)

    def test_same_location_can_have_different_times_for_different_products(self):
        organisation = Organisation.objects.create(
            name="Pickup tenant",
            slug="pickup-tenant-product-times",
            is_active=True,
        )
        saona = self.create_product(
            organisation=organisation,
            name="Saona",
            slug="saona-product-times",
        )
        horse_riding = self.create_product(
            organisation=organisation,
            name="Horse Riding",
            slug="horse-riding-product-times",
        )
        location = PickupLocation.objects.create(
            organisation=organisation,
            name="Dreams Macao Beach",
        )
        saona_schedule = ProductPickupSchedule.objects.create(
            product=saona,
            pickup_location=location,
            pickup_time=time(7, 20),
        )
        horse_riding_schedule = ProductPickupSchedule.objects.create(
            product=horse_riding,
            pickup_location=location,
            pickup_time=time(8, 20),
        )

        repository = DjangoCustomerPickupRepository()
        service_date = date(2026, 8, 30)
        saona_result = repository.resolve_pickup_schedule(
            organisation=organisation,
            product=self.create_public_product(saona),
            pickup_location=location,
            request=PickupScheduleRequest(
                product_id=saona.pk,
                pickup_location_id=location.pk,
                service_date=service_date,
            ),
        )
        horse_riding_result = repository.resolve_pickup_schedule(
            organisation=organisation,
            product=self.create_public_product(horse_riding),
            pickup_location=location,
            request=PickupScheduleRequest(
                product_id=horse_riding.pk,
                pickup_location_id=location.pk,
                service_date=service_date,
            ),
        )

        self.assertEqual(saona_result["schedule_id"], saona_schedule.pk)
        self.assertEqual(saona_result["pickup_time"], time(7, 20))
        self.assertEqual(
            horse_riding_result["schedule_id"], horse_riding_schedule.pk
        )
        self.assertEqual(horse_riding_result["pickup_time"], time(8, 20))