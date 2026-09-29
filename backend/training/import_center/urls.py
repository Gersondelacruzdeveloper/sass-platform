from django.urls import path
from .views import (
    preview_import, import_jobs, import_job_detail, apply_import,
    rollback_import, download_template,
)

urlpatterns = [
    path("preview/", preview_import, name="training-import-preview"),
    path("jobs/", import_jobs, name="training-import-jobs"),
    path("jobs/<int:pk>/", import_job_detail, name="training-import-job-detail"),
    path("jobs/<int:pk>/apply/", apply_import, name="training-import-apply"),
    path("jobs/<int:pk>/rollback/", rollback_import, name="training-import-rollback"),
    path("template/", download_template, name="training-import-template"),
]
