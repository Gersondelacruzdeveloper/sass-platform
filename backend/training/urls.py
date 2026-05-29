from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    GuestFeedbackViewSet,
    OutletViewSet,
    EmployeeViewSet,
    FacilitatorViewSet,
    StandardViewSet,
    TrainingSessionViewSet,
    EvaluationViewSet,
    RoadmapItemViewSet,
    training_dashboard,
    analytics_dashboard,
    EvaluationTemplateViewSet,
    EvaluationQuestionViewSet,
    EmployeeEvaluationViewSet,
    EvaluationAnswerViewSet,
)

router = DefaultRouter()
router.register("outlets", OutletViewSet)
router.register("employees", EmployeeViewSet)
router.register("facilitators", FacilitatorViewSet)
router.register("training-sessions", TrainingSessionViewSet)
router.register("evaluations", EvaluationViewSet)
router.register("roadmap", RoadmapItemViewSet)
router.register("standards", StandardViewSet)
router.register("guest-feedback", GuestFeedbackViewSet)
router.register("evaluation-templates", EvaluationTemplateViewSet)
router.register("evaluation-questions", EvaluationQuestionViewSet)
router.register("employee-evaluations", EmployeeEvaluationViewSet)
router.register("evaluation-answers", EvaluationAnswerViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("dashboard/", training_dashboard),
    path("analytics/", analytics_dashboard),
]