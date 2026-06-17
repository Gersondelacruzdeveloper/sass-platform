from rest_framework import serializers
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


class OutletSerializer(serializers.ModelSerializer):
    employees_count = serializers.SerializerMethodField()
    average_score = serializers.SerializerMethodField()
    hard_rock_score = serializers.SerializerMethodField()

    class Meta:
        model = Outlet
        fields = [
            "id",
            "name",
            "area",
            "manager",
            "description",
            "active",
            "employees_count",
            "average_score",
            "hard_rock_score",
        ]

    def get_employees_count(self, obj):
        return obj.employee_set.filter(active=True).count()

    def get_average_score(self, obj):
        employees = obj.employee_set.filter(active=True)

        if not employees.exists():
            return 0

        total = sum([employee.total_score for employee in employees])
        return round(total / employees.count(), 2)

    def get_hard_rock_score(self, obj):
        employees = obj.employee_set.filter(active=True)

        if not employees.exists():
            return 0

        total = sum([employee.hard_rock_standard_score for employee in employees])
        return round(total / employees.count(), 2)


class StandardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Standard
        fields = "__all__"


class EmployeeSerializer(serializers.ModelSerializer):
    total_score = serializers.ReadOnlyField()
    outlet_name = serializers.CharField(source="outlet.name", read_only=True)
    supervisor_name = serializers.CharField(source="supervisor.name", read_only=True)

    class Meta:
        model = Employee
        fields = "__all__"


class FacilitatorSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    employee_position = serializers.CharField(source="employee.position", read_only=True)
    assigned_count = serializers.SerializerMethodField()

    class Meta:
        model = Facilitator
        fields = [
            "id",
            "employee",
            "employee_name",
            "employee_position",
            "assigned_employees",
            "assigned_outlets",
            "can_create_employees",
            "can_create_trainings",
            "can_create_evaluations",
            "assigned_count",
            "can_view_reports",
            "specialties",
            "active",
        ]

    def get_assigned_count(self, obj):
        return obj.assigned_employees.count()


class TrainingSessionSerializer(serializers.ModelSerializer):
    facilitator_name = serializers.CharField(
        source="facilitator.employee.name",
        read_only=True
    )
    outlet_name = serializers.CharField(source="outlet.name", read_only=True)

    class Meta:
        model = TrainingSession
        fields = "__all__"


class EvaluationSerializer(serializers.ModelSerializer):
    final_score = serializers.ReadOnlyField()
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    standard_title = serializers.CharField(source="standard.title", read_only=True)

    class Meta:
        model = Evaluation
        fields = "__all__"


class RoadmapItemSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.get_full_name", read_only=True)

    class Meta:
        model = RoadmapItem
        fields = "__all__"


class GuestFeedbackSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    outlet_name = serializers.CharField(source="outlet.name", read_only=True)

    class Meta:
        model = GuestFeedback
        fields = "__all__"


class EvaluationQuestionSerializer(serializers.ModelSerializer):
    standard_title = serializers.CharField(source="standard.title", read_only=True)

    class Meta:
        model = EvaluationQuestion
        fields = "__all__"


class EvaluationTemplateSerializer(serializers.ModelSerializer):
    questions = EvaluationQuestionSerializer(many=True, read_only=True)
    outlet_name = serializers.CharField(source="outlet.name", read_only=True)

    class Meta:
        model = EvaluationTemplate
        fields = "__all__"


class EvaluationAnswerSerializer(serializers.ModelSerializer):
    question_text = serializers.CharField(source="question.question", read_only=True)
    score_type = serializers.CharField(source="question.score_type", read_only=True)

    class Meta:
        model = EvaluationAnswer
        fields = "__all__"


class EmployeeEvaluationSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True)
    answers = EvaluationAnswerSerializer(many=True, read_only=True)
    final_score = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeEvaluation
        fields = "__all__"

    def get_final_score(self, obj):
        answers = obj.answers.all()

        score_answers = [
            answer.score
            for answer in answers
            if answer.question.score_type == "score"
        ]

        if not score_answers:
            return 0

        return round(sum(score_answers) / len(score_answers), 2)
    

class TrainingResourceSerializer(serializers.ModelSerializer):
    standard_title = serializers.CharField(source="standard.title", read_only=True)

    class Meta:
        model = TrainingResource
        fields = [
            "id",
            "organisation",
            "title",
            "standard",
            "standard_title",
            "resource_type",
            "incorrect_image",
            "correct_image",
            "short_explanation",
            "facilitator_notes",
            "estimated_minutes",
            "active",
            "created_at",
        ]
        read_only_fields = ["id", "organisation", "created_at"]


class StandardRecoveryPlanSerializer(serializers.ModelSerializer):
    standard_title = serializers.CharField(source="standard.title", read_only=True)
    resource_title = serializers.CharField(source="resource.title", read_only=True)

    class Meta:
        model = StandardRecoveryPlan
        fields = [
            "id",
            "organisation",
            "standard",
            "standard_title",
            "resource",
            "resource_title",
            "trigger_fail_count",
            "reevaluation_after_days",
            "instructions",
            "active",
        ]
        read_only_fields = ["id", "organisation"]


class EmployeeAssignedTrainingSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    standard_title = serializers.CharField(source="standard.title", read_only=True)
    resource_title = serializers.CharField(source="resource.title", read_only=True)
    incorrect_image = serializers.ImageField(
    source="resource.incorrect_image",
    read_only=True,
    )

    correct_image = serializers.ImageField(
        source="resource.correct_image",
        read_only=True,
    )

    short_explanation = serializers.CharField(
        source="resource.short_explanation",
        read_only=True,
    )

    facilitator_notes = serializers.CharField(
        source="resource.facilitator_notes",
        read_only=True,
    )

    estimated_minutes = serializers.IntegerField(
        source="resource.estimated_minutes",
        read_only=True,
    )
    assigned_by_name = serializers.CharField(source="assigned_by.get_full_name", read_only=True)

    class Meta:
        model = EmployeeAssignedTraining
        fields = [
            "id",
            "organisation",
            "employee",
            "employee_name",
            "standard",
            "standard_title",
            "resource",
            "resource_title",
            "assigned_by",
            "assigned_by_name",
            "reason",
            "status",
            "assigned_at",
            "completed_at",
            "reevaluation_due_date",
            "reevaluated_at",
            "incorrect_image",
            "correct_image",
            "short_explanation",
            "facilitator_notes",
            "estimated_minutes",
            "supervisor_notes",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "assigned_by",
            "assigned_at",
            "completed_at",
            "reevaluated_at",
        ]