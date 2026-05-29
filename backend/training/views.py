from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db.models import Avg, Count

from .models import (
    Outlet, Employee,
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
)



class OutletViewSet(viewsets.ModelViewSet):
    queryset = Outlet.objects.all().order_by("name")
    serializer_class = OutletSerializer


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all().order_by("-created_at")
    serializer_class = EmployeeSerializer



class TrainingSessionViewSet(viewsets.ModelViewSet):
    queryset = TrainingSession.objects.all().order_by("start_datetime")
    serializer_class = TrainingSessionSerializer


class EvaluationViewSet(viewsets.ModelViewSet):
    queryset = Evaluation.objects.all().order_by("-created_at")
    serializer_class = EvaluationSerializer


class RoadmapItemViewSet(viewsets.ModelViewSet):
    queryset = RoadmapItem.objects.all()
    serializer_class = RoadmapItemSerializer


@api_view(["GET"])
def training_dashboard(request):
    today = timezone.now().date()

    trainings_today = TrainingSession.objects.filter(start_datetime__date=today)
    next_training = (
        TrainingSession.objects
        .filter(start_datetime__gte=timezone.now(), status="scheduled")
        .order_by("start_datetime")
        .first()
    )

    employees = Employee.objects.filter(active=True)
    top_employees = sorted(employees, key=lambda e: e.total_score, reverse=True)[:10]

    avg_score = 0
    if employees.exists():
        avg_score = round(sum([e.total_score for e in employees]) / employees.count(), 2)

    data = {
        "employees_total": employees.count(),
        "facilitators_total": Facilitator.objects.filter(active=True).count(),
        "trainings_today": trainings_today.count(),
        "people_training_today": sum([t.attendees.count() for t in trainings_today]),
        "next_training": TrainingSessionSerializer(next_training).data if next_training else None,
        "ab_performance_score": avg_score,
        "top_employees": EmployeeSerializer(top_employees, many=True, context={"request": request}).data,
        "roadmap_30": RoadmapItemSerializer(RoadmapItem.objects.filter(period="30_days"), many=True).data,
        "roadmap_60": RoadmapItemSerializer(RoadmapItem.objects.filter(period="60_days"), many=True).data,
        "roadmap_90": RoadmapItemSerializer(RoadmapItem.objects.filter(period="90_days"), many=True).data,
    }

    return Response(data)



@api_view(["GET"])
def analytics_dashboard(request):
    employees = Employee.objects.filter(active=True)
    evaluations = Evaluation.objects.all()
    trainings = TrainingSession.objects.all()

    employees_total = employees.count()
    facilitators_total = Facilitator.objects.filter(active=True).count()
    trainings_total = trainings.count()
    completed_trainings = trainings.filter(status="completed").count()

    training_completion = 0
    if trainings_total > 0:
        training_completion = round((completed_trainings / trainings_total) * 100, 2)

    avg_employee_score = 0
    if employees_total > 0:
        avg_employee_score = round(
            sum([employee.total_score for employee in employees]) / employees_total,
            2
        )

    avg_hard_rock_score = employees.aggregate(
        avg=Avg("hard_rock_standard_score")
    )["avg"] or 0

    top_outlets = []
    outlet_groups = (
        Employee.objects
        .filter(active=True, outlet__isnull=False)
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
        reverse=True
    )[:10]

    low_performers = sorted(
        employees,
        key=lambda employee: employee.total_score
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
            context={"request": request}
        ).data,
        "low_performers": EmployeeSerializer(
            low_performers,
            many=True,
            context={"request": request}
        ).data,
    }

    return Response(analytics)


class FacilitatorViewSet(viewsets.ModelViewSet):
    queryset = Facilitator.objects.select_related("employee").prefetch_related("assigned_employees")
    serializer_class = FacilitatorSerializer

class StandardViewSet(viewsets.ModelViewSet):
    queryset = Standard.objects.all().order_by("category", "title")
    serializer_class = StandardSerializer


class GuestFeedbackViewSet(viewsets.ModelViewSet):
    queryset = GuestFeedback.objects.select_related("employee", "outlet").order_by("-created_at")
    serializer_class = GuestFeedbackSerializer

class EvaluationTemplateViewSet(viewsets.ModelViewSet):
    queryset = EvaluationTemplate.objects.prefetch_related("questions").order_by("-created_at")
    serializer_class = EvaluationTemplateSerializer


class EvaluationQuestionViewSet(viewsets.ModelViewSet):
    queryset = EvaluationQuestion.objects.select_related("template", "standard").order_by("template", "order")
    serializer_class = EvaluationQuestionSerializer


class EmployeeEvaluationViewSet(viewsets.ModelViewSet):
    queryset = EmployeeEvaluation.objects.select_related(
        "employee",
        "template",
        "evaluator",
    ).prefetch_related("answers").order_by("-created_at")
    serializer_class = EmployeeEvaluationSerializer


class EvaluationAnswerViewSet(viewsets.ModelViewSet):
    queryset = EvaluationAnswer.objects.select_related(
        "evaluation",
        "question",
    )
    serializer_class = EvaluationAnswerSerializer