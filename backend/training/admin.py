from django.contrib import admin

from .models import (
    Outlet,
    Standard,
    Employee,
    Facilitator,
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


@admin.register(Outlet)
class OutletAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "manager", "active")
    search_fields = ("name", "manager")


@admin.register(Standard)
class StandardAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "category", "priority", "active")
    list_filter = ("category", "priority", "active")


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "employee_code",
        "position",
        "department",
        "potential_level",
        "promotion_ready",
        "user",
        "active",
    )
    search_fields = ("name", "employee_code", "position")
    list_filter = ("department", "potential_level", "promotion_ready")


@admin.register(Facilitator)
class FacilitatorAdmin(admin.ModelAdmin):
    list_display = ("id", "employee", "active", "can_create_employees","can_create_trainings","can_create_evaluations", "can_view_reports")


@admin.register(TrainingSession)
class TrainingSessionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "topic",
        "status",
        "start_datetime",
    )
    list_filter = ("status",)


@admin.register(Evaluation)
class EvaluationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "employee",
        "evaluator",
        "final_score",
        "created_at",
    )


@admin.register(RoadmapItem)
class RoadmapItemAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "period",
        "priority",
        "completed",
    )


@admin.register(GuestFeedback)
class GuestFeedbackAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "employee",
        "outlet",
        "rating",
        "source",
    )


@admin.register(EvaluationTemplate)
class EvaluationTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "active",
        "created_at",
    )


@admin.register(EvaluationQuestion)
class EvaluationQuestionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "template",
        "question",
        "score_type",
        "weight",
        "order",
    )


@admin.register(EmployeeEvaluation)
class EmployeeEvaluationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "employee",
        "template",
        "evaluator",
        "created_at",
    )


@admin.register(EvaluationAnswer)
class EvaluationAnswerAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "evaluation",
        "question",
        "score",
    )

@admin.register(TrainingResource)
class TrainingResourceAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "standard",
        "title",
        "resource_type",
        "estimated_minutes",
        "active",
    )
    list_filter = ("active", "resource_type", "standard")
    search_fields = ("title", "standard__title", "short_explanation")

@admin.register(StandardRecoveryPlan)
class StandardRecoveryPlanAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "organisation",
        "standard",
        "resource",
        "trigger_fail_count",
        "reevaluation_after_days",
        "active",
    )
    list_filter = (
        "active",
        "organisation",
        "standard",
        "resource",
    )
    search_fields = (
        "standard__title",
        "resource__title",
        "instructions",
    )

@admin.register(EmployeeAssignedTraining)
class EmployeeAssignedTrainingAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "employee",
        "standard",
        "resource",
        "status",
        "assigned_by",
        "assigned_at",
        "completed_at",
        "reevaluation_due_date",
    )
    list_filter = (
        "status",
        "standard",
        "assigned_at",
        "completed_at",
    )
    search_fields = (
        "employee__name",
        "standard__title",
        "resource__title",
        "reason",
    )