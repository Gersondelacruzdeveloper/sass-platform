from datetime import timedelta

from django.utils import timezone
from django.db.models import Avg, Count, Q
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


def _active_facilitator_for(user):
    if not is_facilitator(user):
        return None

    facilitator = get_facilitator_profile(user)
    if facilitator is None or not facilitator.active:
        return None

    return facilitator


def _require_management(user, message="Management access is required."):
    if not is_management(user):
        raise PermissionDenied(message)


def _failed_answer_count(organisation, employee, standard, threshold=3):
    return (
        EvaluationAnswer.objects
        .filter(
            organisation=organisation,
            evaluation__employee=employee,
            question__standard=standard,
        )
        .filter(
            Q(question__score_type="score", score__lt=threshold)
            | Q(question__score_type="yes_no", yes_no_answer=False)
        )
        .count()
    )


class ManagementWriteMixin:
    """Keep standards/configuration writable only by management."""

    def create(self, request, *args, **kwargs):
        _require_management(request.user)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        _require_management(request.user)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        _require_management(request.user)
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        _require_management(request.user)
        return super().destroy(request, *args, **kwargs)


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

        facilitator = _active_facilitator_for(self.request.user)
        if facilitator:
            return facilitator.assigned_employees.filter(
                organisation=organisation
            ).order_by("name")

        return Employee.objects.none()

    def perform_create(self, serializer):
        organisation = self.get_organisation()

        if is_management(self.request.user):
            serializer.save(organisation=organisation)
            return

        facilitator = _active_facilitator_for(self.request.user)
        if not facilitator or not facilitator.can_create_employees:
            raise PermissionDenied("You cannot create employees.")

        outlet = serializer.validated_data.get("outlet")
        if outlet and not facilitator.assigned_outlets.filter(pk=outlet.pk).exists():
            raise PermissionDenied(
                "You can only create employees in outlets assigned to you."
            )

        employee = serializer.save(organisation=organisation)
        facilitator.assigned_employees.add(employee)

    def destroy(self, request, *args, **kwargs):
        if not is_management(request.user):
            raise PermissionDenied("You cannot delete employees.")

        return super().destroy(request, *args, **kwargs)

class TrainingSessionViewSet(TenantModelViewSet):
    serializer_class = TrainingSessionSerializer

    def get_queryset(self):
        organisation = self.get_organisation()
        queryset = (
            TrainingSession.objects
            .filter(organisation=organisation)
            .select_related("facilitator", "outlet")
            .prefetch_related("attendees")
            .order_by("start_datetime")
        )

        if is_management(self.request.user):
            return queryset

        facilitator = _active_facilitator_for(self.request.user)
        if facilitator:
            return queryset.filter(
                outlet__in=facilitator.assigned_outlets.all()
            ).distinct()

        return queryset.none()

    def perform_create(self, serializer):
        organisation = self.get_organisation()

        if is_management(self.request.user):
            serializer.save(organisation=organisation)
            return

        facilitator = _active_facilitator_for(self.request.user)
        if not facilitator or not facilitator.can_create_trainings:
            raise PermissionDenied("You cannot create training sessions.")

        requested_facilitator = serializer.validated_data.get("facilitator")
        if requested_facilitator and requested_facilitator.pk != facilitator.pk:
            raise PermissionDenied(
                "You can only create training sessions for your facilitator profile."
            )

        outlet = serializer.validated_data.get("outlet")
        if outlet and not facilitator.assigned_outlets.filter(pk=outlet.pk).exists():
            raise PermissionDenied(
                "You can only create training sessions in outlets assigned to you."
            )

        attendees = serializer.validated_data.get("attendees", [])
        allowed_employee_ids = set(
            facilitator.assigned_employees.values_list("id", flat=True)
        )
        if any(attendee.id not in allowed_employee_ids for attendee in attendees):
            raise PermissionDenied(
                "A training session can only include employees assigned to you."
            )

        serializer.save(
            organisation=organisation,
            facilitator=facilitator,
        )

class EvaluationViewSet(TenantModelViewSet):
    serializer_class = EvaluationSerializer

    def get_queryset(self):
        organisation = self.get_organisation()
        queryset = (
            Evaluation.objects
            .filter(organisation=organisation)
            .select_related("employee", "evaluator", "standard")
            .order_by("-created_at")
        )

        if is_management(self.request.user):
            return queryset

        facilitator = _active_facilitator_for(self.request.user)
        if facilitator:
            return queryset.filter(
                employee__in=facilitator.assigned_employees.all()
            )

        return queryset.none()

    def perform_create(self, serializer):
        organisation = self.get_organisation()

        if not is_management(self.request.user):
            facilitator = _active_facilitator_for(self.request.user)
            if not facilitator or not facilitator.can_create_evaluations:
                raise PermissionDenied("You cannot create evaluations.")

            employee = serializer.validated_data.get("employee")
            if not facilitator.assigned_employees.filter(pk=employee.pk).exists():
                raise PermissionDenied(
                    "You can only evaluate employees assigned to you."
                )

        serializer.save(
            organisation=organisation,
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
        organisation = self.get_organisation()
        queryset = (
            Facilitator.objects
            .filter(organisation=organisation)
            .select_related("employee")
            .prefetch_related(
                "assigned_employees",
                "assigned_outlets",
            )
        )

        if is_management(self.request.user):
            return queryset

        facilitator = _active_facilitator_for(self.request.user)
        if facilitator:
            return queryset.filter(pk=facilitator.pk)

        return queryset.none()

    def perform_create(self, serializer):
        _require_management(self.request.user)
        serializer.save(organisation=self.get_organisation())

    def perform_update(self, serializer):
        _require_management(self.request.user)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        _require_management(request.user)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=["post"])
    def create_account(self, request):
        _require_management(
            request.user,
            "Only management can create facilitator accounts.",
        )
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

        employee = Employee.objects.filter(
            id=employee_id,
            organisation=organisation,
        ).first()
        if employee is None:
            return Response(
                {"detail": "Employee was not found in your organisation."},
                status=status.HTTP_404_NOT_FOUND,
            )

        assigned_employee_ids = request.data.get("assigned_employees", [])
        assigned_outlet_ids = request.data.get("assigned_outlets", [])

        assigned_employees = Employee.objects.filter(
            organisation=organisation,
            id__in=assigned_employee_ids,
        )
        assigned_outlets = Outlet.objects.filter(
            organisation=organisation,
            id__in=assigned_outlet_ids,
        )

        if assigned_employees.count() != len(set(assigned_employee_ids)):
            return Response(
                {"assigned_employees": "One or more employees are invalid."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if assigned_outlets.count() != len(set(assigned_outlet_ids)):
            return Response(
                {"assigned_outlets": "One or more outlets are invalid."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if employee.user:
            user = employee.user
        else:
            if not username or not email or not password:
                return Response(
                    {"detail": "Username, email and password are required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
            )

            employee.user = user
            employee.save(update_fields=["user"])

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
                    "can_create_employees", True
                ),
                "can_create_trainings": request.data.get(
                    "can_create_trainings", True
                ),
                "can_create_evaluations": request.data.get(
                    "can_create_evaluations", True
                ),
                "can_view_reports": request.data.get(
                    "can_view_reports", False
                ),
                "active": request.data.get("active", True),
            },
        )

        if not created:
            facilitator.specialties = request.data.get(
                "specialties", facilitator.specialties
            )
            facilitator.can_create_employees = request.data.get(
                "can_create_employees", facilitator.can_create_employees
            )
            facilitator.can_create_trainings = request.data.get(
                "can_create_trainings", facilitator.can_create_trainings
            )
            facilitator.can_create_evaluations = request.data.get(
                "can_create_evaluations", facilitator.can_create_evaluations
            )
            facilitator.can_view_reports = request.data.get(
                "can_view_reports", facilitator.can_view_reports
            )
            facilitator.active = request.data.get("active", facilitator.active)
            facilitator.save()

        facilitator.assigned_employees.set(assigned_employees)
        facilitator.assigned_outlets.set(assigned_outlets)

        return Response(
            FacilitatorSerializer(
                facilitator,
                context={"request": request},
            ).data,
            status=(
                status.HTTP_201_CREATED
                if created
                else status.HTTP_200_OK
            ),
        )

class StandardViewSet(ManagementWriteMixin, TenantModelViewSet):
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


class EvaluationTemplateViewSet(ManagementWriteMixin, TenantModelViewSet):
    serializer_class = EvaluationTemplateSerializer

    def get_queryset(self):
        return (
            EvaluationTemplate.objects
            .filter(organisation=self.get_organisation())
            .prefetch_related("questions")
            .order_by("-created_at")
        )


class EvaluationQuestionViewSet(ManagementWriteMixin, TenantModelViewSet):
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
        organisation = self.get_organisation()
        queryset = (
            EmployeeEvaluation.objects
            .filter(organisation=organisation)
            .select_related("employee", "template", "evaluator")
            .prefetch_related(
                "answers",
                "answers__question",
                "answers__question__standard",
            )
            .order_by("-created_at")
        )

        if is_management(self.request.user):
            pass
        else:
            facilitator = _active_facilitator_for(self.request.user)
            if facilitator:
                queryset = queryset.filter(
                    employee__in=facilitator.assigned_employees.all()
                )
            else:
                return queryset.none()

        employee_id = self.request.query_params.get("employee")
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)

        return queryset

    def perform_create(self, serializer):
        organisation = self.get_organisation()
        employee = serializer.validated_data.get("employee")

        if not is_management(self.request.user):
            facilitator = _active_facilitator_for(self.request.user)
            if not facilitator or not facilitator.can_create_evaluations:
                raise PermissionDenied("You cannot create evaluations.")

            if not facilitator.assigned_employees.filter(pk=employee.pk).exists():
                raise PermissionDenied(
                    "You can only evaluate employees assigned to you."
                )

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

            failure_count = _failed_answer_count(
                organisation,
                evaluation.employee,
                standard,
                self.FAIL_SCORE_THRESHOLD,
            )
            if failure_count < recovery_plan.trigger_fail_count:
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
        organisation = self.get_organisation()
        queryset = (
            EvaluationAnswer.objects
            .filter(organisation=organisation)
            .select_related(
                "evaluation",
                "evaluation__employee",
                "evaluation__template",
                "question",
                "question__standard",
            )
        )

        if is_management(self.request.user):
            return queryset

        facilitator = _active_facilitator_for(self.request.user)
        if facilitator:
            return queryset.filter(
                evaluation__employee__in=facilitator.assigned_employees.all()
            )

        return queryset.none()

    def perform_create(self, serializer):
        organisation = self.get_organisation()
        evaluation = serializer.validated_data.get("evaluation")

        if not is_management(self.request.user):
            facilitator = _active_facilitator_for(self.request.user)
            if not facilitator or not facilitator.can_create_evaluations:
                raise PermissionDenied("You cannot record evaluation answers.")

            if not facilitator.assigned_employees.filter(
                pk=evaluation.employee_id
            ).exists():
                raise PermissionDenied(
                    "You can only evaluate employees assigned to you."
                )

        answer = serializer.save(organisation=organisation)
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

        failure_count = _failed_answer_count(
            organisation,
            answer.evaluation.employee,
            standard,
            self.FAIL_SCORE_THRESHOLD,
        )
        if failure_count < recovery_plan.trigger_fail_count:
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
class TrainingResourceViewSet(ManagementWriteMixin, TenantModelViewSet):
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


class StandardRecoveryPlanViewSet(ManagementWriteMixin, TenantModelViewSet):
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
        organisation = self.get_organisation()
        queryset = (
            EmployeeAssignedTraining.objects
            .filter(organisation=organisation)
            .select_related(
                "employee",
                "standard",
                "resource",
                "assigned_by",
            )
            .order_by("-assigned_at")
        )

        if is_management(self.request.user):
            pass
        else:
            facilitator = _active_facilitator_for(self.request.user)
            if facilitator:
                queryset = queryset.filter(
                    employee__in=facilitator.assigned_employees.all()
                )
            else:
                return queryset.none()

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

    def _require_training_actor(self, assigned_training=None):
        if is_management(self.request.user):
            return None

        facilitator = _active_facilitator_for(self.request.user)
        if not facilitator or not facilitator.can_create_trainings:
            raise PermissionDenied("You cannot manage assigned training.")

        if assigned_training is not None and not facilitator.assigned_employees.filter(
            pk=assigned_training.employee_id
        ).exists():
            raise PermissionDenied(
                "You can only manage training for employees assigned to you."
            )

        return facilitator

    def perform_create(self, serializer):
        organisation = self.get_organisation()
        facilitator = self._require_training_actor()
        employee = serializer.validated_data.get("employee")

        if facilitator and not facilitator.assigned_employees.filter(
            pk=employee.pk
        ).exists():
            raise PermissionDenied(
                "You can only assign training to employees assigned to you."
            )

        serializer.save(
            organisation=organisation,
            assigned_by=self.request.user,
        )

    @action(detail=True, methods=["post"])
    def mark_completed(self, request, pk=None):
        facilitator = self._require_training_actor()
        assigned_training = self.get_object()

        if facilitator and not facilitator.assigned_employees.filter(
            pk=assigned_training.employee_id
        ).exists():
            raise PermissionDenied(
                "You can only manage training for employees assigned to you."
            )

        if assigned_training.status not in {
            "assigned",
            "in_progress",
            "completed",
        }:
            return Response(
                {"detail": "Only active microtraining can be marked completed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        assigned_training.status = "reevaluation_pending"
        assigned_training.completed_at = timezone.now()

        if not assigned_training.reevaluation_due_date:
            recovery_plan = (
                StandardRecoveryPlan.objects
                .filter(
                    organisation=self.get_organisation(),
                    standard=assigned_training.standard,
                    active=True,
                )
                .first()
            )
            reevaluation_days = (
                recovery_plan.reevaluation_after_days
                if recovery_plan
                else 3
            )
            assigned_training.reevaluation_due_date = (
                timezone.now().date()
                + timedelta(days=reevaluation_days)
            )

        assigned_training.save(
            update_fields=[
                "status",
                "completed_at",
                "reevaluation_due_date",
            ]
        )

        return Response(
            self.get_serializer(assigned_training).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        assigned_training = self.get_object()

        if is_management(request.user):
            pass
        else:
            facilitator = _active_facilitator_for(request.user)
            if not facilitator or not facilitator.can_create_evaluations:
                raise PermissionDenied("You cannot close re-evaluation cases.")
            if not facilitator.assigned_employees.filter(
                pk=assigned_training.employee_id
            ).exists():
                raise PermissionDenied(
                    "You can only close cases for employees assigned to you."
                )

        if assigned_training.status != "reevaluation_pending":
            return Response(
                {
                    "detail": (
                        "Microtraining must be completed before this case can be closed."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        assigned_training.status = "closed"
        assigned_training.reevaluated_at = timezone.now()

        supervisor_notes = request.data.get("supervisor_notes")
        if supervisor_notes is not None:
            assigned_training.supervisor_notes = supervisor_notes

        assigned_training.save(
            update_fields=[
                "status",
                "reevaluated_at",
                "supervisor_notes",
            ]
        )

        return Response(
            self.get_serializer(assigned_training).data,
            status=status.HTTP_200_OK,
        )
