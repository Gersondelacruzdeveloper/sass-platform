from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    EmployeeAssignedTrainingViewSet,
    GuestFeedbackViewSet,
    OutletViewSet,
    EmployeeViewSet,
    FacilitatorViewSet,
    StandardViewSet,
    TrainingSessionViewSet,
    EvaluationViewSet,
    RoadmapItemViewSet,
    TrainingResourceViewSet,
    StandardRecoveryPlanViewSet,
    training_dashboard,
    analytics_dashboard,
    EvaluationTemplateViewSet,
    EvaluationQuestionViewSet,
    EmployeeEvaluationViewSet,
    EvaluationAnswerViewSet,
)

router = DefaultRouter()
router.register("outlets", OutletViewSet, basename="outlet")
router.register("employees", EmployeeViewSet, basename="employee")
router.register("training-sessions", TrainingSessionViewSet, basename="training-session")
router.register("evaluations", EvaluationViewSet, basename="evaluation")
router.register("roadmap", RoadmapItemViewSet, basename="roadmap")
router.register("facilitators", FacilitatorViewSet, basename="facilitator")
router.register("standards", StandardViewSet, basename="standard")
router.register("guest-feedback", GuestFeedbackViewSet, basename="guest-feedback")
router.register("evaluation-templates", EvaluationTemplateViewSet, basename="evaluation-template")
router.register("evaluation-questions", EvaluationQuestionViewSet, basename="evaluation-question")
router.register("employee-evaluations", EmployeeEvaluationViewSet, basename="employee-evaluation")
router.register("evaluation-answers", EvaluationAnswerViewSet, basename="evaluation-answer")
router.register(
    "training-resources",
    TrainingResourceViewSet,
    basename="training-resource",
)

router.register(
    "standard-recovery-plans",
    StandardRecoveryPlanViewSet,
    basename="standard-recovery-plan",
)

router.register(
    "assigned-trainings",
    EmployeeAssignedTrainingViewSet,
    basename="assigned-training",
)
urlpatterns = [
    path("", include(router.urls)),
    path("dashboard/", training_dashboard),
    path("analytics/", analytics_dashboard),
]