from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from organisations.models import Organisation
from training.models import (
    Outlet,
    Standard,
    TrainingSession,
    Evaluation,
    RoadmapItem,
    GuestFeedback,
    EvaluationTemplate,
    EvaluationQuestion,
    EmployeeEvaluation,
    EvaluationAnswer,
    TrainingResource,
    StandardRecoveryPlan,
    EmployeeAssignedTraining,
)


# Publicly named F&B venues for Moon Palace The Grand – Punta Cana.
# Venues announced as "late 2026" are seeded inactive so they cannot be
# accidentally used for live evaluations before they open.
MOON_PALACE_FNB_OUTLETS = [
    {
        "name": "La Cantina",
        "area": "Restaurant - Mexican",
        "description": "Mexican specialty restaurant.",
        "active": True,
    },
    {
        "name": "Fuego by The Grilling Bastards",
        "area": "Restaurant - Smokehouse",
        "description": "Open-flame smokehouse restaurant.",
        "active": True,
    },
    {
        "name": "JC Prime Room 84",
        "area": "Restaurant - Steakhouse",
        "description": "Adults-only American steakhouse. Announced for late 2026.",
        "active": False,
    },
    {
        "name": "Carvao",
        "area": "Restaurant - Brazilian Rodizio",
        "description": "Brazilian rodizio restaurant.",
        "active": True,
    },
    {
        "name": "Le Jiraf",
        "area": "Restaurant - French",
        "description": "French bistrosserie.",
        "active": True,
    },
    {
        "name": "Nikos by Athinagoras Kostakos",
        "area": "Restaurant - Greek",
        "description": "Greek specialty restaurant.",
        "active": True,
    },
    {
        "name": "The Grand Buffet",
        "area": "Buffet - International",
        "description": "International buffet.",
        "active": True,
    },
    {
        "name": "Tavola",
        "area": "Restaurant - Italian",
        "description": "Italian trattoria-style restaurant.",
        "active": True,
    },
    {
        "name": "Habibi",
        "area": "Restaurant - Middle Eastern",
        "description": "Middle Eastern mezze-style restaurant.",
        "active": True,
    },
    {
        "name": "Jade",
        "area": "Restaurant - Asian",
        "description": "Japanese Izakaya-style restaurant.",
        "active": True,
    },
    {
        "name": "Agra",
        "area": "Restaurant - Indian",
        "description": "Indian specialty restaurant.",
        "active": True,
    },
    {
        "name": "Teppan by Momo",
        "area": "Restaurant - Hibachi",
        "description": "Asian hibachi restaurant.",
        "active": True,
    },
    {
        "name": "Camino Street",
        "area": "Food Hall - International",
        "description": "Street-food alley with multiple food options.",
        "active": True,
    },
    {
        "name": "Madremía",
        "area": "Restaurant - Latin American",
        "description": "Latin American restaurant and after-dinner bar. Announced for late 2026.",
        "active": False,
    },
    {
        "name": "Casa Macao",
        "area": "Restaurant - International",
        "description": "International dining with hot, cold and live-cooking options.",
        "active": True,
    },
    {
        "name": "Wonderwoods",
        "area": "Restaurant - Kids",
        "description": "Family/kids themed restaurant. Announced for late 2026.",
        "active": False,
    },
    {
        "name": "Joe's Deck",
        "area": "Restaurant - Seafood",
        "description": "Beach-style seafood restaurant.",
        "active": True,
    },
    {
        "name": "Nativo Casa de Tueste",
        "area": "Cafe - Coffee & Pastry",
        "description": "Coffee roasting house, cacao, beverages and desserts.",
        "active": True,
    },
    {
        "name": "Boulangerie",
        "area": "Cafe - Coffee & Pastry",
        "description": "Crepes, coffee, paninis, chocolates, cookies and pastries.",
        "active": True,
    },
    {
        "name": "League's",
        "area": "Sports Bar - Snacks",
        "description": "Sports bar with beverages and snacks.",
        "active": True,
    },
    {
        "name": "The Ninth Pin",
        "area": "Snack Bar - Bowling",
        "description": "Bowling-alley snack outlet.",
        "active": True,
    },
    {
        "name": "19th Hole",
        "area": "Lounge Bar - Golf",
        "description": "Golf-course lounge bar serving breakfast and lunch.",
        "active": True,
    },
    {
        "name": "Snack Bar",
        "area": "Snack Bar - Poolside",
        "description": "Poolside snacks and beverages.",
        "active": True,
    },
    {
        "name": "Unique Nightclub",
        "area": "Nightclub - Bar",
        "description": "Nightlife venue. Announced for late 2026.",
        "active": False,
    },
    {
        "name": "Unique Day Club",
        "area": "Pool Club - Bar",
        "description": "Adults-only pool club with snacks and premium beverages.",
        "active": True,
    },
    {
        "name": "Speakeasy",
        "area": "Bar - Themed",
        "description": "1920s-inspired jazz and cocktail bar. Announced for late 2026.",
        "active": False,
    },
    {
        "name": "Waitiki",
        "area": "Bar - Themed",
        "description": "Polynesian-inspired cocktail bar. Announced for late 2026.",
        "active": False,
    },
    {
        "name": "Kassette",
        "area": "Karaoke Bar",
        "description": "Karaoke/nightlife venue. Announced for late 2026.",
        "active": False,
    },
    {
        "name": "Lobby Bar",
        "area": "Bar - Lobby",
        "description": "Lobby cocktails and beverages.",
        "active": True,
    },
    {
        "name": "Jungle Pool Bar",
        "area": "Bar - Pool",
        "description": "Swim-up/pool bar.",
        "active": True,
    },
    {
        "name": "Fuego Bar",
        "area": "Bar - Pool/Beach",
        "description": "Poolside/beach-area bar.",
        "active": True,
    },
]


# Exact records created by the repository's old seed_training_demo.py.
# These are deliberately matched by known demo names rather than deleting
# every organisation=NULL record in the database.
LEGACY_DEMO_OUTLETS = [
    "Toro Steakhouse",
    "Zen Asian Restaurant",
    "Eclipse Bar",
    "The Market Buffet",
]

LEGACY_DEMO_TEMPLATES = [
    "Wine & Premium Upselling Audit",
    "Bar Speed & Cocktail Consistency Audit",
    "Buffet Cleanliness & Refill Audit",
    "Guest Recovery Observation",
]

LEGACY_DEMO_STANDARDS = [
    "Greeting within 10 seconds",
    "Use guest name when possible",
    "Recommend premium option",
    "Explain menu confidently",
    "Recover guest complaint professionally",
    "Maintain Hard Rock energy",
    "Keep buffet area clean and replenished",
    "Cocktail consistency",
]

LEGACY_DEMO_SESSIONS = [
    "Premium Wine Recommendation Workshop",
    "Cocktail Consistency Refresh",
]

LEGACY_DEMO_ROADMAP = [
    "Improve wine and premium upselling consistency",
    "Build 50 facilitator structure",
    "Launch monthly A&B standards audit",
]


class Command(BaseCommand):
    help = (
        "Reset Moon Palace training configuration and seed the initial "
        "Moon Palace The Grand Punta Cana F&B outlets."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--organisation-id",
            type=int,
            required=True,
            help="Organisation ID that represents Moon Palace.",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually modify the database. Without this flag the command is preview-only.",
        )
        parser.add_argument(
            "--purge-legacy-demo",
            action="store_true",
            help=(
                "Also remove the exact tenant-less Hard Rock/demo records created by "
                "the old seed_training_demo.py command."
            ),
        )

    def handle(self, *args, **options):
        organisation_id = options["organisation_id"]
        apply_changes = options["apply"]
        purge_legacy_demo = options["purge_legacy_demo"]

        try:
            organisation = Organisation.objects.get(pk=organisation_id)
        except Organisation.DoesNotExist as exc:
            raise CommandError(
                f"Organisation with id={organisation_id} does not exist."
            ) from exc

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("Moon Palace Training Reset"))
        self.stdout.write(
            f"Target organisation: id={organisation.id} | "
            f"name={organisation.name!r} | slug={organisation.slug!r}"
        )
        self.stdout.write(f"Mode: {'APPLY' if apply_changes else 'PREVIEW ONLY'}")
        self.stdout.write(f"Purge old demo seed: {purge_legacy_demo}")
        self.stdout.write("")

        counts = self._current_counts(organisation)
        self.stdout.write("Current target-organisation training data:")
        for label, count in counts.items():
            self.stdout.write(f"  - {label}: {count}")

        self.stdout.write("")
        self.stdout.write(
            f"F&B outlets to create: {len(MOON_PALACE_FNB_OUTLETS)} "
            f"({sum(1 for item in MOON_PALACE_FNB_OUTLETS if item['active'])} active, "
            f"{sum(1 for item in MOON_PALACE_FNB_OUTLETS if not item['active'])} future/inactive)"
        )

        if not apply_changes:
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    "PREVIEW COMPLETE: no database records were changed. "
                    "Run again with --apply after confirming the organisation above."
                )
            )
            return

        with transaction.atomic():
            deleted = self._clear_target_training_data(organisation)

            legacy_deleted = {}
            if purge_legacy_demo:
                legacy_deleted = self._purge_legacy_demo_data()

            created = 0
            updated = 0
            for item in MOON_PALACE_FNB_OUTLETS:
                _, was_created = Outlet.objects.update_or_create(
                    organisation=organisation,
                    name=item["name"],
                    defaults={
                        "area": item["area"],
                        "manager": "",
                        "description": item["description"],
                        "active": item["active"],
                    },
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Moon Palace training reset completed."))
        self.stdout.write("Deleted from target organisation:")
        for label, count in deleted.items():
            self.stdout.write(f"  - {label}: {count}")

        if purge_legacy_demo:
            self.stdout.write("Removed from exact legacy demo seed:")
            for label, count in legacy_deleted.items():
                self.stdout.write(f"  - {label}: {count}")

        self.stdout.write(
            f"Moon Palace F&B outlets: {created} created, {updated} updated."
        )
        self.stdout.write(
            self.style.SUCCESS(
                "Users, memberships, employees/collaborators and facilitators were preserved."
            )
        )

    def _current_counts(self, organisation):
        return {
            "outlets": Outlet.objects.filter(organisation=organisation).count(),
            "standards": Standard.objects.filter(organisation=organisation).count(),
            "templates": EvaluationTemplate.objects.filter(organisation=organisation).count(),
            "questions": EvaluationQuestion.objects.filter(organisation=organisation).count(),
            "employee evaluations": EmployeeEvaluation.objects.filter(organisation=organisation).count(),
            "evaluation answers": EvaluationAnswer.objects.filter(organisation=organisation).count(),
            "legacy evaluations": Evaluation.objects.filter(organisation=organisation).count(),
            "training sessions": TrainingSession.objects.filter(organisation=organisation).count(),
            "roadmap/objectives": RoadmapItem.objects.filter(organisation=organisation).count(),
            "guest feedback": GuestFeedback.objects.filter(organisation=organisation).count(),
            "training resources": TrainingResource.objects.filter(organisation=organisation).count(),
            "recovery plans": StandardRecoveryPlan.objects.filter(organisation=organisation).count(),
            "assigned recovery training": EmployeeAssignedTraining.objects.filter(organisation=organisation).count(),
        }

    def _delete_queryset(self, queryset):
        count = queryset.count()
        queryset.delete()
        return count

    def _clear_target_training_data(self, organisation):
        # Delete child/workflow data before configuration parents for clarity.
        deleted = {}
        deleted["assigned recovery training"] = self._delete_queryset(
            EmployeeAssignedTraining.objects.filter(organisation=organisation)
        )
        deleted["recovery plans"] = self._delete_queryset(
            StandardRecoveryPlan.objects.filter(organisation=organisation)
        )
        deleted["training resources"] = self._delete_queryset(
            TrainingResource.objects.filter(organisation=organisation)
        )
        deleted["evaluation answers"] = self._delete_queryset(
            EvaluationAnswer.objects.filter(organisation=organisation)
        )
        deleted["employee evaluations"] = self._delete_queryset(
            EmployeeEvaluation.objects.filter(organisation=organisation)
        )
        deleted["evaluation questions"] = self._delete_queryset(
            EvaluationQuestion.objects.filter(organisation=organisation)
        )
        deleted["evaluation templates"] = self._delete_queryset(
            EvaluationTemplate.objects.filter(organisation=organisation)
        )
        deleted["legacy evaluations"] = self._delete_queryset(
            Evaluation.objects.filter(organisation=organisation)
        )
        deleted["training sessions"] = self._delete_queryset(
            TrainingSession.objects.filter(organisation=organisation)
        )
        deleted["roadmap/objectives"] = self._delete_queryset(
            RoadmapItem.objects.filter(organisation=organisation)
        )
        deleted["guest feedback"] = self._delete_queryset(
            GuestFeedback.objects.filter(organisation=organisation)
        )
        deleted["standards"] = self._delete_queryset(
            Standard.objects.filter(organisation=organisation)
        )
        deleted["old outlets"] = self._delete_queryset(
            Outlet.objects.filter(organisation=organisation)
        )
        return deleted

    def _purge_legacy_demo_data(self):
        deleted = {}

        # Templates cascade to their questions and employee evaluations/answers.
        deleted["demo templates"] = self._delete_queryset(
            EvaluationTemplate.objects.filter(
                organisation__isnull=True,
                name__in=LEGACY_DEMO_TEMPLATES,
            )
        )

        deleted["demo sessions"] = self._delete_queryset(
            TrainingSession.objects.filter(
                organisation__isnull=True,
                title__in=LEGACY_DEMO_SESSIONS,
            )
        )

        deleted["demo roadmap/objectives"] = self._delete_queryset(
            RoadmapItem.objects.filter(
                organisation__isnull=True,
                title__in=LEGACY_DEMO_ROADMAP,
            )
        )

        deleted["demo standards"] = self._delete_queryset(
            Standard.objects.filter(
                organisation__isnull=True,
                title__in=LEGACY_DEMO_STANDARDS,
            )
        )

        # Do not delete demo employees/users. Their outlet FK becomes NULL when
        # the known demo outlets are removed, which preserves the collaborator record.
        deleted["demo outlets"] = self._delete_queryset(
            Outlet.objects.filter(
                organisation__isnull=True,
                name__in=LEGACY_DEMO_OUTLETS,
            )
        )

        return deleted
