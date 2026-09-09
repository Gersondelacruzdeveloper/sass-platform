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


class TenantValidationMixin:
    """Shared validation helpers for organisation-owned training objects."""

    def get_request_organisation(self):
        request = self.context.get("request")
        if not request or not getattr(request, "user", None):
            return None

        membership = (
            request.user.memberships
            .filter(is_active=True, organisation__is_active=True)
            .select_related("organisation")
            .first()
        )
        return membership.organisation if membership else None

    def validate_same_organisation(self, obj, field_name, organisation=None):
        if obj is None:
            return

        organisation = organisation or self.get_request_organisation()
        if organisation is None:
            return

        if getattr(obj, "organisation_id", None) != organisation.id:
            raise serializers.ValidationError(
                {field_name: "This object does not belong to your organisation."}
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

        total = sum(employee.total_score for employee in employees)
        return round(total / employees.count(), 2)

    def get_hard_rock_score(self, obj):
        employees = obj.employee_set.filter(active=True)

        if not employees.exists():
            return 0

        total = sum(employee.hard_rock_standard_score for employee in employees)
        return round(total / employees.count(), 2)


class StandardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Standard
        fields = "__all__"
        read_only_fields = ["organisation"]


class EmployeeSerializer(TenantValidationMixin, serializers.ModelSerializer):
    total_score = serializers.ReadOnlyField()
    outlet_name = serializers.CharField(source="outlet.name", read_only=True)
    supervisor_name = serializers.CharField(source="supervisor.name", read_only=True)

    class Meta:
        model = Employee
        fields = "__all__"
        read_only_fields = ["organisation", "created_at"]

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        outlet = attrs.get("outlet", getattr(self.instance, "outlet", None))
        supervisor = attrs.get(
            "supervisor",
            getattr(self.instance, "supervisor", None),
        )

        self.validate_same_organisation(outlet, "outlet", organisation)
        self.validate_same_organisation(supervisor, "supervisor", organisation)
        return attrs


class FacilitatorSerializer(TenantValidationMixin, serializers.ModelSerializer):
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

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        employee = attrs.get("employee", getattr(self.instance, "employee", None))
        assigned_employees = attrs.get("assigned_employees", [])
        assigned_outlets = attrs.get("assigned_outlets", [])

        self.validate_same_organisation(employee, "employee", organisation)

        for assigned_employee in assigned_employees:
            self.validate_same_organisation(
                assigned_employee,
                "assigned_employees",
                organisation,
            )

        for outlet in assigned_outlets:
            self.validate_same_organisation(
                outlet,
                "assigned_outlets",
                organisation,
            )

        return attrs


class TrainingSessionSerializer(TenantValidationMixin, serializers.ModelSerializer):
    facilitator_name = serializers.CharField(
        source="facilitator.employee.name",
        read_only=True,
    )
    outlet_name = serializers.CharField(source="outlet.name", read_only=True)

    class Meta:
        model = TrainingSession
        fields = "__all__"
        read_only_fields = ["organisation", "created_at"]

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        facilitator = attrs.get(
            "facilitator",
            getattr(self.instance, "facilitator", None),
        )
        outlet = attrs.get("outlet", getattr(self.instance, "outlet", None))
        attendees = attrs.get("attendees")

        self.validate_same_organisation(facilitator, "facilitator", organisation)
        self.validate_same_organisation(outlet, "outlet", organisation)

        if attendees is not None:
            for attendee in attendees:
                self.validate_same_organisation(
                    attendee,
                    "attendees",
                    organisation,
                )

        start_datetime = attrs.get(
            "start_datetime",
            getattr(self.instance, "start_datetime", None),
        )
        end_datetime = attrs.get(
            "end_datetime",
            getattr(self.instance, "end_datetime", None),
        )

        if (
            start_datetime is not None
            and end_datetime is not None
            and end_datetime <= start_datetime
        ):
            raise serializers.ValidationError(
                {"end_datetime": "End time must be after start time."}
            )

        return attrs


class EvaluationSerializer(TenantValidationMixin, serializers.ModelSerializer):
    final_score = serializers.ReadOnlyField()
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    standard_title = serializers.CharField(source="standard.title", read_only=True)

    class Meta:
        model = Evaluation
        fields = "__all__"
        read_only_fields = ["organisation", "evaluator", "created_at"]

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        employee = attrs.get("employee", getattr(self.instance, "employee", None))
        standard = attrs.get("standard", getattr(self.instance, "standard", None))

        self.validate_same_organisation(employee, "employee", organisation)
        self.validate_same_organisation(standard, "standard", organisation)
        return attrs


class RoadmapItemSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source="owner.get_full_name", read_only=True)

    class Meta:
        model = RoadmapItem
        fields = "__all__"
        read_only_fields = ["organisation", "owner", "created_at"]


class GuestFeedbackSerializer(TenantValidationMixin, serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    outlet_name = serializers.CharField(source="outlet.name", read_only=True)

    class Meta:
        model = GuestFeedback
        fields = "__all__"
        read_only_fields = ["organisation", "created_at"]

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        employee = attrs.get("employee", getattr(self.instance, "employee", None))
        outlet = attrs.get("outlet", getattr(self.instance, "outlet", None))

        self.validate_same_organisation(employee, "employee", organisation)
        self.validate_same_organisation(outlet, "outlet", organisation)
        return attrs


class EvaluationQuestionSerializer(TenantValidationMixin, serializers.ModelSerializer):
    standard_title = serializers.CharField(source="standard.title", read_only=True)

    class Meta:
        model = EvaluationQuestion
        fields = "__all__"
        read_only_fields = ["organisation"]

    def validate_weight(self, value):
        if value < 1:
            raise serializers.ValidationError("Weight must be at least 1.")
        return value

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        template = attrs.get("template", getattr(self.instance, "template", None))
        standard = attrs.get("standard", getattr(self.instance, "standard", None))

        self.validate_same_organisation(template, "template", organisation)
        self.validate_same_organisation(standard, "standard", organisation)
        return attrs


class EvaluationTemplateSerializer(TenantValidationMixin, serializers.ModelSerializer):
    questions = EvaluationQuestionSerializer(many=True, read_only=True)
    outlet_name = serializers.CharField(source="outlet.name", read_only=True)

    class Meta:
        model = EvaluationTemplate
        fields = "__all__"
        read_only_fields = ["organisation", "created_at"]

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        outlet = attrs.get("outlet", getattr(self.instance, "outlet", None))
        self.validate_same_organisation(outlet, "outlet", organisation)
        return attrs


class EvaluationAnswerSerializer(TenantValidationMixin, serializers.ModelSerializer):
    question_text = serializers.CharField(source="question.question", read_only=True)
    score_type = serializers.CharField(source="question.score_type", read_only=True)

    class Meta:
        model = EvaluationAnswer
        fields = "__all__"
        read_only_fields = ["organisation"]

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        evaluation = attrs.get(
            "evaluation",
            getattr(self.instance, "evaluation", None),
        )
        question = attrs.get("question", getattr(self.instance, "question", None))

        self.validate_same_organisation(evaluation, "evaluation", organisation)
        self.validate_same_organisation(question, "question", organisation)

        if evaluation is not None and question is not None:
            if question.template_id != evaluation.template_id:
                raise serializers.ValidationError(
                    {
                        "question": (
                            "This question does not belong to the evaluation template."
                        )
                    }
                )

            duplicate_answers = EvaluationAnswer.objects.filter(
                evaluation=evaluation,
                question=question,
            )
            if self.instance is not None:
                duplicate_answers = duplicate_answers.exclude(pk=self.instance.pk)

            if duplicate_answers.exists():
                raise serializers.ValidationError(
                    {"question": "This question has already been answered."}
                )

            if question.score_type == "score":
                score = attrs.get("score")
                if score is None:
                    raise serializers.ValidationError(
                        {"score": "A score is required for this question."}
                    )
                if score < 1 or score > 10:
                    raise serializers.ValidationError(
                        {"score": "Score must be between 1 and 10."}
                    )

            elif question.score_type == "yes_no":
                yes_no_answer = attrs.get("yes_no_answer")
                if yes_no_answer is None:
                    raise serializers.ValidationError(
                        {
                            "yes_no_answer": (
                                "A yes/no answer is required for this question."
                            )
                        }
                    )

        return attrs


class EmployeeEvaluationSerializer(TenantValidationMixin, serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    template_name = serializers.CharField(source="template.name", read_only=True)
    answers = EvaluationAnswerSerializer(many=True, read_only=True)
    final_score = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeEvaluation
        fields = "__all__"
        read_only_fields = ["organisation", "evaluator", "created_at"]

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        employee = attrs.get("employee", getattr(self.instance, "employee", None))
        template = attrs.get("template", getattr(self.instance, "template", None))

        self.validate_same_organisation(employee, "employee", organisation)
        self.validate_same_organisation(template, "template", organisation)
        return attrs

    def get_final_score(self, obj):
        """
        Return a weighted percentage (0-100).

        Score questions use their 1-10 score.
        Yes/no questions contribute 10 for Yes and 0 for No.
        Text questions do not contribute to the numeric final score.
        """
        weighted_total = 0.0
        total_weight = 0

        for answer in obj.answers.select_related("question").all():
            question = answer.question
            weight = question.weight or 0

            if weight <= 0:
                continue

            if question.score_type == "score":
                value = answer.score
            elif question.score_type == "yes_no":
                if answer.yes_no_answer is None:
                    continue
                value = 10.0 if answer.yes_no_answer else 0.0
            else:
                continue

            weighted_total += float(value) * weight
            total_weight += weight

        if total_weight == 0:
            return 0

        score_out_of_ten = weighted_total / total_weight
        return round(score_out_of_ten * 10, 2)


class TrainingResourceSerializer(TenantValidationMixin, serializers.ModelSerializer):
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

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        standard = attrs.get("standard", getattr(self.instance, "standard", None))
        self.validate_same_organisation(standard, "standard", organisation)
        return attrs


class StandardRecoveryPlanSerializer(TenantValidationMixin, serializers.ModelSerializer):
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

    def validate_trigger_fail_count(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "Trigger failure count must be at least 1."
            )
        return value

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        standard = attrs.get("standard", getattr(self.instance, "standard", None))
        resource = attrs.get("resource", getattr(self.instance, "resource", None))

        self.validate_same_organisation(standard, "standard", organisation)
        self.validate_same_organisation(resource, "resource", organisation)

        if (
            standard is not None
            and resource is not None
            and resource.standard_id != standard.id
        ):
            raise serializers.ValidationError(
                {
                    "resource": (
                        "The recovery resource must belong to the same standard."
                    )
                }
            )

        return attrs


class EmployeeAssignedTrainingSerializer(TenantValidationMixin, serializers.ModelSerializer):
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
    assigned_by_name = serializers.CharField(
        source="assigned_by.get_full_name",
        read_only=True,
    )

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

    def validate(self, attrs):
        organisation = self.get_request_organisation()
        employee = attrs.get("employee", getattr(self.instance, "employee", None))
        standard = attrs.get("standard", getattr(self.instance, "standard", None))
        resource = attrs.get("resource", getattr(self.instance, "resource", None))

        self.validate_same_organisation(employee, "employee", organisation)
        self.validate_same_organisation(standard, "standard", organisation)
        self.validate_same_organisation(resource, "resource", organisation)

        if (
            standard is not None
            and resource is not None
            and resource.standard_id != standard.id
        ):
            raise serializers.ValidationError(
                {"resource": "The training resource must match the selected standard."}
            )

        return attrs
