from __future__ import annotations

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from training.views import get_user_organisation
from .models import TrainingImportJob
from .parser import parse_training_workbook, validate_payload, build_blank_template_bytes
from .serializers import TrainingImportJobSerializer
from .service import apply_job, rollback_job, ImportApplyError


MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _management_or_403(request):
    from rest_framework.exceptions import PermissionDenied
    organisation = get_user_organisation(request.user)
    if request.user.is_superuser:
        return organisation
    membership = request.user.memberships.filter(
        organisation=organisation, is_active=True
    ).first()
    if not membership or membership.role not in {"owner", "admin", "manager"}:
        raise PermissionDenied("Management access is required for Training Import Center.")
    return organisation


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def preview_import(request):
    organisation = _management_or_403(request)
    upload = request.FILES.get("file")
    if not upload:
        return Response({"detail": "Upload an XLSX file using multipart field 'file'."}, status=status.HTTP_400_BAD_REQUEST)
    if not upload.name.lower().endswith(".xlsx"):
        return Response({"detail": "Only .xlsx files are supported."}, status=status.HTTP_400_BAD_REQUEST)
    if upload.size > MAX_UPLOAD_BYTES:
        return Response({"detail": "The workbook must be 10 MB or smaller."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        file_bytes = upload.read()
        payload = parse_training_workbook(file_bytes)
        preview = validate_payload(payload)
    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    manifest = payload.get("manifest", {})
    job = TrainingImportJob.objects.create(
        organisation=organisation,
        created_by=request.user,
        file_name=upload.name,
        file_sha256=payload.get("sha256", ""),
        dataset_key=str(manifest.get("dataset_key", "") or ""),
        dataset_version=str(manifest.get("dataset_version", "") or ""),
        status="preview",
        payload=payload,
        preview=preview,
    )
    data = TrainingImportJobSerializer(job).data
    data["sample"] = {
        "standards": payload["standards"][:5],
        "procedures": payload["procedures"][:5],
        "templates": payload["templates"][:5],
        "questions": payload["questions"][:5],
    }
    return Response(data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def import_jobs(request):
    organisation = _management_or_403(request)
    qs = TrainingImportJob.objects.filter(organisation=organisation)[:50]
    return Response(TrainingImportJobSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def import_job_detail(request, pk):
    organisation = _management_or_403(request)
    job = TrainingImportJob.objects.filter(organisation=organisation, pk=pk).first()
    if not job:
        return Response({"detail": "Import job not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(TrainingImportJobSerializer(job).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def apply_import(request, pk):
    organisation = _management_or_403(request)
    job = TrainingImportJob.objects.filter(organisation=organisation, pk=pk).first()
    if not job:
        return Response({"detail": "Import job not found."}, status=status.HTTP_404_NOT_FOUND)
    try:
        result = apply_job(job)
    except ImportApplyError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)
        job.save(update_fields=["status", "error_message"])
        return Response({"detail": "Import failed.", "error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"id": job.pk, "status": job.status, "result": result})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rollback_import(request, pk):
    organisation = _management_or_403(request)
    job = TrainingImportJob.objects.filter(organisation=organisation, pk=pk).first()
    if not job:
        return Response({"detail": "Import job not found."}, status=status.HTTP_404_NOT_FOUND)
    try:
        rollback = rollback_job(job)
    except ImportApplyError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    return Response({"id": job.pk, "status": job.status, "rollback": rollback})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_template(request):
    _management_or_403(request)
    content = build_blank_template_bytes()
    response = HttpResponse(
        content,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = 'attachment; filename="Training_Import_Template.xlsx"'
    return response
