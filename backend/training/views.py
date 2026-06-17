from datetime import timedelta

from django.utils import timezone
from django.db.models import Avg, Count
from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.decorators import action
from organisations.models import Membership

User = get_user_model()


from .permissions import (
    is_management,
    is_facilitator,
    get_facilitator_profile,
)

from .models import (
    Outlet,
    Employee,
    Facilitator,
    TrainingSession,
    Evaluation,
    RoadmapItem,
    Standard,
    GuestFeedback,
    EvaluationTemplate,
    EvaluationQuestion,
    EmployeeEvaluation,
    EvaluationAnswer,
    TrainingResource,
    StandardRecoveryPlan,
    EmployeeAssignedTraining,
)
from .serializers import (
    GuestFeedbackSerializer,
    OutletSerializer,
    EmployeeSerializer,
    FacilitatorSerializer,
    StandardSerializer,
    TrainingSessionSerializer,
    EvaluationSerializer,
    RoadmapItemSerializer,
    EvaluationTemplateSerializer,
    EvaluationQuestionSerializer,
    EmployeeEvaluationSerializer,
    EvaluationAnswerSerializer,
    TrainingResourceSerializer,
    StandardRecoveryPlanSerializer,
    EmployeeAssignedTrainingSerializer,
)


def get_user_organisation(user):
    membership = (
        user.memberships
        .filter(is_active=True, organisation__is_active=True)
        .select_related("organisation")
        .first()
    )

    if not membership:
        raise PermissionDenied("No active organisation found.")

    return membership.organisation


class TenantModelViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_organisation(self):
        return get_user_organisation(self.request.user)

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation()
        )


class OutletViewSet(TenantModelViewSet):
    serializer_class = OutletSerializer

    def get_queryset(self):
        return Outlet.objects.filter(
            organisation=self.get_organisation()
        ).order_by("name")


class EmployeeViewSet(TenantModelViewSet):
    serializer_class = EmployeeSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if is_management(self.request.user):
            return Employee.objects.filter(
                organisation=organisation
            ).order_by("-created_at")

        if is_facilitator(self.request.user):
            facilitator = get_facilitator_profile(self.request.user)

            if facilitator:
                return facilitator.assigned_employees.filter(
                    organisation=organisation
                ).order_by("name")

        return Employee.objects.none()

    def destroy(self, request, *args, **kwargs):
        if not is_management(request.user):
            raise PermissionDenied("You cannot delete employees.")

        return super().destroy(request, *args, **kwargs)
    


class TrainingSessionViewSet(TenantModelViewSet):
    serializer_class = TrainingSessionSerializer

    def get_queryset(self):
        return (
            TrainingSession.objects
            .filter(organisation=self.get_organisation())
            .select_related("facilitator", "outlet")
            .prefetch_related("attendees")
            .order_by("start_datetime")
        )


class EvaluationViewSet(TenantModelViewSet):
    serializer_class = EvaluationSerializer

    def get_queryset(self):
        return (
            Evaluation.objects
            .filter(organisation=self.get_organisation())
            .select_related("employee", "evaluator", "standard")
            .order_by("-created_at")
        )

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation(),
            evaluator=self.request.user,
        )


class RoadmapItemViewSet(TenantModelViewSet):
    serializer_class = RoadmapItemSerializer

    def get_queryset(self):
        return RoadmapItem.objects.filter(
            organisation=self.get_organisation()
        )

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation(),
            owner=self.request.user,
        )

class FacilitatorViewSet(TenantModelViewSet):
    serializer_class = FacilitatorSerializer

    def get_queryset(self):
        return (
            Facilitator.objects
            .filter(organisation=self.get_organisation())
            .select_related("employee")
            .prefetch_related(
                "assigned_employees",
                "assigned_outlets",
            )
        )

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation()
        )

    @action(detail=False, methods=["post"])
    def create_account(self, request):
        organisation = self.get_organisation()

        employee_id = request.data.get("employee")
        username = request.data.get("username")
        email = request.data.get("email")
        password = request.data.get("password")

        if not employee_id:
            return Response(
                {"detail": "Employee is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employee = Employee.objects.get(
            id=employee_id,
            organisation=organisation,
        )

        if employee.user:
            user = employee.user
        else:
            if not username or not email or not password:
                return Response(
                    {
                        "detail": "Username, email and password are required."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
            )

            employee.user = user
            employee.save()

        Membership.objects.update_or_create(
            user=user,
            organisation=organisation,
            defaults={
                "role": "facilitator",
                "is_active": True,
            },
        )

        facilitator, created = Facilitator.objects.get_or_create(
            organisation=organisation,
            employee=employee,
            defaults={
                "specialties": request.data.get("specialties", []),
                "can_create_employees": request.data.get(
                    "can_create_employees",
                    True,
                ),
                "can_create_trainings": request.data.get(
                    "can_create_trainings",
                    True,
                ),
                "can_create_evaluations": request.data.get(
                    "can_create_evaluations",
                    True,
                ),
                "can_view_reports": request.data.get(
                    "can_view_reports",
                    False,
                ),
                "active": request.data.get("active", True),
            },
        )

        if not created:
            facilitator.specialties = request.data.get(
                "specialties",
                facilitator.specialties,
            )
            facilitator.can_create_employees = request.data.get(
                "can_create_employees",
                facilitator.can_create_employees,
            )
            facilitator.can_create_trainings = request.data.get(
                "can_create_trainings",
                facilitator.can_create_trainings,
            )
            facilitator.can_create_evaluations = request.data.get(
                "can_create_evaluations",
                facilitator.can_create_evaluations,
            )
            facilitator.can_view_reports = request.data.get(
                "can_view_reports",
                facilitator.can_view_reports,
            )
            facilitator.active = request.data.get(
                "active",
                facilitator.active,
            )
            facilitator.save()

        facilitator.assigned_employees.set(
            request.data.get("assigned_employees", [])
        )

        facilitator.assigned_outlets.set(
            request.data.get("assigned_outlets", [])
        )

        return Response(
            FacilitatorSerializer(facilitator).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
class StandardViewSet(TenantModelViewSet):
    serializer_class = StandardSerializer

    def get_queryset(self):
        return Standard.objects.filter(
            organisation=self.get_organisation()
        ).order_by("category", "title")


class GuestFeedbackViewSet(TenantModelViewSet):
    serializer_class = GuestFeedbackSerializer

    def get_queryset(self):
        return (
            GuestFeedback.objects
            .filter(organisation=self.get_organisation())
            .select_related("employee", "outlet")
            .order_by("-created_at")
        )


class EvaluationTemplateViewSet(TenantModelViewSet):
    serializer_class = EvaluationTemplateSerializer

    def get_queryset(self):
        return (
            EvaluationTemplate.objects
            .filter(organisation=self.get_organisation())
            .prefetch_related("questions")
            .order_by("-created_at")
        )


class EvaluationQuestionViewSet(TenantModelViewSet):
    serializer_class = EvaluationQuestionSerializer

    def get_queryset(self):
        return (
            EvaluationQuestion.objects
            .filter(organisation=self.get_organisation())
            .select_related("template", "standard")
            .order_by("template", "order")
        )
    

class EmployeeEvaluationViewSet(TenantModelViewSet):
    serializer_class = EmployeeEvaluationSerializer

    FAIL_SCORE_THRESHOLD = 3

    def get_queryset(self):
        queryset = (
            EmployeeEvaluation.objects
            .filter(organisation=self.get_organisation())
            .select_related("employee", "template", "evaluator")
            .prefetch_related(
                "answers",
                "answers__question",
                "answers__question__standard",
            )
            .order_by("-created_at")
        )

        employee_id = self.request.query_params.get("employee")

        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        return queryset

    def perform_create(self, serializer):
        organisation = self.get_organisation()

        evaluation = serializer.save(
            organisation=organisation,
            evaluator=self.request.user,
        )

        self.create_recovery_trainings(evaluation, organisation)

    def create_recovery_trainings(self, evaluation, organisation):
        answers = (
            EvaluationAnswer.objects
            .filter(
                organisation=organisation,
                evaluation=evaluation,
            )
            .select_related(
                "question",
                "question__standard",
            )
        )

        created_count = 0

        for answer in answers:
            question = answer.question
            standard = question.standard

            if not standard:
                continue

            failed = False

            if question.score_type == "score":
                failed = answer.score < self.FAIL_SCORE_THRESHOLD

            elif question.score_type == "yes_no":
                failed = answer.yes_no_answer is False

            if not failed:
                continue

            recovery_plan = (
                StandardRecoveryPlan.objects
                .filter(
                    organisation=organisation,
                    standard=standard,
                    active=True,
                )
                .select_related("resource")
                .first()
            )

            if not recovery_plan:
                continue

            existing_training = EmployeeAssignedTraining.objects.filter(
                organisation=organisation,
                employee=evaluation.employee,
                standard=standard,
                status__in=[
                    "assigned",
                    "in_progress",
                    "reevaluation_pending",
                ],
            ).first()

            if existing_training:
                continue

            EmployeeAssignedTraining.objects.create(
                organisation=organisation,
                employee=evaluation.employee,
                standard=standard,
                resource=recovery_plan.resource,
                assigned_by=self.request.user,
                reason=(
                    f"El colaborador no cumplió el estándar "
                    f"'{standard.title}' en la evaluación "
                    f"'{evaluation.template.name}'."
                ),
                status="assigned",
                reevaluation_due_date=(
                    timezone.now().date()
                    + timedelta(days=recovery_plan.reevaluation_after_days)
                ),
            )

            created_count += 1

        return created_count


class EvaluationAnswerViewSet(TenantModelViewSet):
    serializer_class = EvaluationAnswerSerializer
    FAIL_SCORE_THRESHOLD = 3

    def get_queryset(self):
        return (
            EvaluationAnswer.objects
            .filter(organisation=self.get_organisation())
            .select_related(
                "evaluation",
                "evaluation__employee",
                "evaluation__template",
                "question",
                "question__standard",
            )
        )

    def perform_create(self, serializer):
        organisation = self.get_organisation()

        answer = serializer.save(
            organisation=organisation,
        )

        self.create_recovery_training_from_answer(answer, organisation)

    def create_recovery_training_from_answer(self, answer, organisation):
        question = answer.question
        standard = question.standard

        if not standard:
            return None

        failed = False

        if question.score_type == "score":
            failed = answer.score < self.FAIL_SCORE_THRESHOLD

        elif question.score_type == "yes_no":
            failed = answer.yes_no_answer is False

        if not failed:
            return None

        recovery_plan = (
            StandardRecoveryPlan.objects
            .filter(
                organisation=organisation,
                standard=standard,
                active=True,
            )
            .select_related("resource")
            .first()
        )

        if not recovery_plan:
            return None

        existing_training = EmployeeAssignedTraining.objects.filter(
            organisation=organisation,
            employee=answer.evaluation.employee,
            standard=standard,
            status__in=[
                "assigned",
                "in_progress",
                "reevaluation_pending",
            ],
        ).first()

        if existing_training:
            return existing_training

        return EmployeeAssignedTraining.objects.create(
            organisation=organisation,
            employee=answer.evaluation.employee,
            standard=standard,
            resource=recovery_plan.resource,
            assigned_by=self.request.user,
            reason=(
                f"El colaborador no cumplió el estándar "
                f"'{standard.title}' en la evaluación "
                f"'{answer.evaluation.template.name}'."
            ),
            status="assigned",
            reevaluation_due_date=(
                timezone.now().date()
                + timedelta(days=recovery_plan.reevaluation_after_days)
            ),
        )

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def training_dashboard(request):
    organisation = get_user_organisation(request.user)
    today = timezone.now().date()

    trainings_today = TrainingSession.objects.filter(
        organisation=organisation,
        start_datetime__date=today,
    )

    next_training = (
        TrainingSession.objects
        .filter(
            organisation=organisation,
            start_datetime__gte=timezone.now(),
            status="scheduled",
        )
        .order_by("start_datetime")
        .first()
    )

    employees = Employee.objects.filter(
        organisation=organisation,
        active=True,
    )

    top_employees = sorted(
        employees,
        key=lambda e: e.total_score,
        reverse=True,
    )[:10]

    avg_score = 0
    if employees.exists():
        avg_score = round(
            sum([e.total_score for e in employees]) / employees.count(),
            2,
        )

    data = {
        "employees_total": employees.count(),
        "facilitators_total": Facilitator.objects.filter(
            organisation=organisation,
            active=True,
        ).count(),
        "trainings_today": trainings_today.count(),
        "people_training_today": sum(
            [t.attendees.count() for t in trainings_today]
        ),
        "next_training": TrainingSessionSerializer(
            next_training,
            context={"request": request},
        ).data if next_training else None,
        "ab_performance_score": avg_score,
        "top_employees": EmployeeSerializer(
            top_employees,
            many=True,
            context={"request": request},
        ).data,
        "roadmap_30": RoadmapItemSerializer(
            RoadmapItem.objects.filter(
                organisation=organisation,
                period="30_days",
            ),
            many=True,
            context={"request": request},
        ).data,
        "roadmap_60": RoadmapItemSerializer(
            RoadmapItem.objects.filter(
                organisation=organisation,
                period="60_days",
            ),
            many=True,
            context={"request": request},
        ).data,
        "roadmap_90": RoadmapItemSerializer(
            RoadmapItem.objects.filter(
                organisation=organisation,
                period="90_days",
            ),
            many=True,
            context={"request": request},
        ).data,
    }

    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def analytics_dashboard(request):
    organisation = get_user_organisation(request.user)

    employees = Employee.objects.filter(
        organisation=organisation,
        active=True,
    )

    evaluations = Evaluation.objects.filter(
        organisation=organisation,
    )

    trainings = TrainingSession.objects.filter(
        organisation=organisation,
    )

    employees_total = employees.count()
    facilitators_total = Facilitator.objects.filter(
        organisation=organisation,
        active=True,
    ).count()

    trainings_total = trainings.count()
    completed_trainings = trainings.filter(status="completed").count()

    training_completion = 0
    if trainings_total > 0:
        training_completion = round(
            (completed_trainings / trainings_total) * 100,
            2,
        )

    avg_employee_score = 0
    if employees_total > 0:
        avg_employee_score = round(
            sum([employee.total_score for employee in employees]) / employees_total,
            2,
        )

    avg_hard_rock_score = employees.aggregate(
        avg=Avg("hard_rock_standard_score")
    )["avg"] or 0

    top_outlets = []
    outlet_groups = (
        Employee.objects
        .filter(
            organisation=organisation,
            active=True,
            outlet__isnull=False,
        )
        .values("outlet__name")
        .annotate(
            employees_count=Count("id"),
            service_avg=Avg("service_score"),
            leadership_avg=Avg("leadership_score"),
            attitude_avg=Avg("attitude_score"),
            upselling_avg=Avg("upselling_score"),
            hard_rock_avg=Avg("hard_rock_standard_score"),
        )
        .order_by("-hard_rock_avg")
    )

    for item in outlet_groups:
        score = (
            (item["service_avg"] or 0)
            + (item["leadership_avg"] or 0)
            + (item["attitude_avg"] or 0)
            + (item["upselling_avg"] or 0)
            + (item["hard_rock_avg"] or 0)
        ) / 5

        top_outlets.append({
            "name": item["outlet__name"],
            "employees_count": item["employees_count"],
            "score": round(score, 2),
            "hard_rock_score": round(item["hard_rock_avg"] or 0, 2),
        })

    top_employees = sorted(
        employees,
        key=lambda employee: employee.total_score,
        reverse=True,
    )[:10]

    low_performers = sorted(
        employees,
        key=lambda employee: employee.total_score,
    )[:10]

    analytics = {
        "employees_total": employees_total,
        "facilitators_total": facilitators_total,
        "trainings_total": trainings_total,
        "completed_trainings": completed_trainings,
        "training_completion": training_completion,
        "ab_performance_score": avg_employee_score,
        "hard_rock_score": round(avg_hard_rock_score, 2),
        "evaluations_total": evaluations.count(),
        "top_outlets": top_outlets[:10],
        "bottom_outlets": list(reversed(top_outlets))[:10],
        "top_employees": EmployeeSerializer(
            top_employees,
            many=True,
            context={"request": request},
        ).data,
        "low_performers": EmployeeSerializer(
            low_performers,
            many=True,
            context={"request": request},
        ).data,
    }

    return Response(analytics)


# ------------------------------------------------TrainingResourceViewSet
class TrainingResourceViewSet(TenantModelViewSet):
    serializer_class = TrainingResourceSerializer

    def get_queryset(self):
        queryset = (
            TrainingResource.objects
            .filter(organisation=self.get_organisation())
            .select_related("standard")
            .order_by("-created_at")
        )

        standard_id = self.request.query_params.get("standard")
        resource_type = self.request.query_params.get("resource_type")
        active = self.request.query_params.get("active")

        if standard_id:
            queryset = queryset.filter(standard_id=standard_id)

        if resource_type:
            queryset = queryset.filter(resource_type=resource_type)

        if active is not None:
            queryset = queryset.filter(active=active.lower() == "true")

        return queryset


class StandardRecoveryPlanViewSet(TenantModelViewSet):
    serializer_class = StandardRecoveryPlanSerializer

    def get_queryset(self):
        queryset = (
            StandardRecoveryPlan.objects
            .filter(organisation=self.get_organisation())
            .select_related("standard", "resource")
            .order_by("standard__title")
        )

        standard_id = self.request.query_params.get("standard")
        active = self.request.query_params.get("active")

        if standard_id:
            queryset = queryset.filter(standard_id=standard_id)

        if active is not None:
            queryset = queryset.filter(active=active.lower() == "true")

        return queryset


class EmployeeAssignedTrainingViewSet(TenantModelViewSet):
    serializer_class = EmployeeAssignedTrainingSerializer

    def get_queryset(self):
        queryset = (
            EmployeeAssignedTraining.objects
            .filter(organisation=self.get_organisation())
            .select_related(
                "employee",
                "standard",
                "resource",
                "assigned_by",
            )
            .order_by("-assigned_at")
        )

        employee_id = self.request.query_params.get("employee")
        standard_id = self.request.query_params.get("standard")
        status_filter = self.request.query_params.get("status")

        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        if standard_id:
            queryset = queryset.filter(standard_id=standard_id)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        return queryset

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation(),
            assigned_by=self.request.user,
        )

    @action(detail=True, methods=["post"])
    def mark_completed(self, request, pk=None):
        assigned_training = self.get_object()

        assigned_training.status = "reevaluation_pending"
        assigned_training.completed_at = timezone.now()

        if not assigned_training.reevaluation_due_date:
            assigned_training.reevaluation_due_date = timezone.now().date() + timedelta(days=3)

        assigned_training.save()

        return Response(
            self.get_serializer(assigned_training).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        assigned_training = self.get_object()

        assigned_training.status = "closed"
        assigned_training.reevaluated_at = timezone.now()

        supervisor_notes = request.data.get("supervisor_notes")
        if supervisor_notes:
            assigned_training.supervisor_notes = supervisor_notes

        assigned_training.save()

        return Response(
            self.get_serializer(assigned_training).data,
            status=status.HTTP_200_OK,
        )