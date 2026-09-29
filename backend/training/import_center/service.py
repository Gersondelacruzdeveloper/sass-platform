from __future__ import annotations

from copy import deepcopy
from django.db import transaction
from django.utils import timezone

from training.models import Standard, EvaluationTemplate, EvaluationQuestion, TrainingResource
from .models import TrainingImportBinding, TrainingImportJob
from .parser import validate_payload


class ImportApplyError(Exception):
    pass


def _binding(org, entity_type, source_key):
    return TrainingImportBinding.objects.filter(
        organisation=org, entity_type=entity_type, source_key=source_key
    ).first()


def _model_for(entity_type):
    return {
        "standard": Standard,
        "template": EvaluationTemplate,
        "question": EvaluationQuestion,
        "procedure": TrainingResource,
    }[entity_type]


def _get_bound_object(org, entity_type, source_key):
    binding = _binding(org, entity_type, source_key)
    if not binding:
        return None, None
    obj = _model_for(entity_type).objects.filter(pk=binding.object_id, organisation=org).first()
    return binding, obj


def _snapshot(obj, fields):
    out = {}
    for f in fields:
        field = obj._meta.get_field(f)
        if getattr(field, "many_to_one", False):
            out[f] = getattr(obj, f"{f}_id")
        else:
            out[f] = getattr(obj, f)
    return out


def _record_change(changes, action, entity_type, source_key, obj, before=None):
    changes.append({
        "action": action,
        "entity_type": entity_type,
        "source_key": source_key,
        "object_id": obj.pk,
        "before": before or {},
    })


def _upsert_binding(org, entity_type, key, obj, source_priority=100, title="", metadata=None):
    return TrainingImportBinding.objects.update_or_create(
        organisation=org,
        entity_type=entity_type,
        source_key=key,
        defaults={
            "object_id": obj.pk,
            "source_priority": source_priority,
            "source_title": title or "",
            "metadata": metadata or {},
        },
    )[0]


def _find_standard(org, code):
    _, obj = _get_bound_object(org, "standard", code)
    return obj


def _find_template(org, key):
    _, obj = _get_bound_object(org, "template", key)
    return obj


@transaction.atomic
def apply_job(job: TrainingImportJob):
    if job.status == "applied":
        raise ImportApplyError("This import job has already been applied.")
    if job.status == "rolled_back":
        raise ImportApplyError("A rolled-back job cannot be applied again. Create a new preview.")

    report = validate_payload(job.payload)
    if not report["valid"]:
        raise ImportApplyError("The import has validation errors and cannot be applied.")

    org = job.organisation
    changes = []
    summary = {
        "standards": {"created": 0, "updated": 0, "protected": 0},
        "procedures": {"created": 0, "updated": 0, "protected": 0},
        "templates": {"created": 0, "updated": 0},
        "questions": {"created": 0, "updated": 0},
    }

    # 1) Standards
    for row in job.payload["standards"]:
        code = row["standard_code"]
        incoming_priority = int(row.get("source_priority") or 100)
        binding, obj = _get_bound_object(org, "standard", code)

        if obj is None:
            # Conservative de-duplication for pre-existing manual standards.
            obj = Standard.objects.filter(organisation=org, title=row["title"]).first()

        if binding and obj and incoming_priority > binding.source_priority:
            summary["standards"]["protected"] += 1
            continue

        defaults = {
            "title": row["title"],
            "category": row["category"],
            "description": row.get("description", ""),
            "priority": row["priority"],
            "active": bool(row.get("active", True)) and row.get("status", "ACTIVE") == "ACTIVE",
        }
        if obj:
            before = _snapshot(obj, defaults.keys())
            for k, v in defaults.items(): setattr(obj, k, v)
            obj.save(update_fields=list(defaults.keys()))
            _record_change(changes, "updated", "standard", code, obj, before)
            summary["standards"]["updated"] += 1
        else:
            obj = Standard.objects.create(organisation=org, **defaults)
            _record_change(changes, "created", "standard", code, obj)
            summary["standards"]["created"] += 1

        _upsert_binding(
            org, "standard", code, obj, incoming_priority, row["title"],
            metadata={k: row.get(k, "") for k in [
                "area_scope", "position_scope", "source", "status", "applicability",
                "version", "effective_date", "notes",
            ]},
        )

    # 2) Procedures -> facilitator-guide resources
    for row in job.payload["procedures"]:
        code = row["procedure_code"]
        incoming_priority = int(row.get("source_priority") or 100)
        binding, obj = _get_bound_object(org, "procedure", code)
        if binding and obj and incoming_priority > binding.source_priority:
            summary["procedures"]["protected"] += 1
            continue

        linked_standard = _find_standard(org, row.get("primary_standard_code")) if row.get("primary_standard_code") else None
        active = row.get("status") == "ACTIVE"
        title = f"{code} | {row['title']}"
        notes = "\n\n".join(filter(None, [
            f"Área: {row.get('area', '')}",
            f"Versión: {row.get('version', '')}",
            f"Pasos clave: {row.get('quick_steps', '')}",
        ]))
        defaults = {
            "title": title,
            "standard": linked_standard,
            "resource_type": "facilitator_guide",
            "short_explanation": row.get("purpose", ""),
            "facilitator_notes": notes,
            "estimated_minutes": 5,
            "active": active,
        }
        if obj:
            before = _snapshot(obj, defaults.keys())
            for k, v in defaults.items(): setattr(obj, k, v)
            obj.save(update_fields=list(defaults.keys()))
            _record_change(changes, "updated", "procedure", code, obj, before)
            summary["procedures"]["updated"] += 1
        else:
            obj = TrainingResource.objects.create(organisation=org, **defaults)
            _record_change(changes, "created", "procedure", code, obj)
            summary["procedures"]["created"] += 1

        _upsert_binding(
            org, "procedure", code, obj, incoming_priority, row["title"],
            metadata={k: row.get(k, "") for k in ["version", "area", "status", "source_class", "primary_standard_code"]},
        )

    # 3) Templates
    for row in job.payload["templates"]:
        key = row["template_key"]
        binding, obj = _get_bound_object(org, "template", key)
        if obj is None:
            obj = EvaluationTemplate.objects.filter(organisation=org, name=row["name"]).first()
        defaults = {
            "name": row["name"],
            "description": row.get("description", ""),
            "active": row.get("status") == "ACTIVE",
        }
        if obj:
            before = _snapshot(obj, defaults.keys())
            for k, v in defaults.items(): setattr(obj, k, v)
            obj.save(update_fields=list(defaults.keys()))
            _record_change(changes, "updated", "template", key, obj, before)
            summary["templates"]["updated"] += 1
        else:
            obj = EvaluationTemplate.objects.create(organisation=org, **defaults)
            _record_change(changes, "created", "template", key, obj)
            summary["templates"]["created"] += 1
        _upsert_binding(org, "template", key, obj, 100, row["name"], metadata={"area_scope": row.get("area_scope", "")})

    # 4) Questions
    for row in job.payload["questions"]:
        if not row.get("active", True):
            continue
        qkey = row["question_key"]
        template = _find_template(org, row["template_key"])
        if not template:
            raise ImportApplyError(f"Template binding not found: {row['template_key']}")
        standard = _find_standard(org, row.get("standard_code")) if row.get("standard_code") else None

        binding, obj = _get_bound_object(org, "question", qkey)
        if obj is None:
            obj = EvaluationQuestion.objects.filter(
                organisation=org, template=template, order=row["order"]
            ).first()

        defaults = {
            "template": template,
            "standard": standard,
            "question": row["question"],
            "score_type": row["score_type"],
            "weight": row["weight"],
            "order": row["order"],
        }
        if obj:
            before = _snapshot(obj, defaults.keys())
            for k, v in defaults.items(): setattr(obj, k, v)
            obj.save(update_fields=list(defaults.keys()))
            _record_change(changes, "updated", "question", qkey, obj, before)
            summary["questions"]["updated"] += 1
        else:
            obj = EvaluationQuestion.objects.create(organisation=org, **defaults)
            _record_change(changes, "created", "question", qkey, obj)
            summary["questions"]["created"] += 1
        _upsert_binding(
            org, "question", qkey, obj, 100, row["question"],
            metadata={"template_key": row["template_key"], "standard_code": row.get("standard_code", ""), "observer_guidance": row.get("observer_guidance", "")},
        )

    job.status = "applied"
    job.applied_at = timezone.now()
    job.result = {"summary": summary, "changes": changes, "warnings": report["warnings"]}
    job.error_message = ""
    job.save(update_fields=["status", "applied_at", "result", "error_message"])
    return job.result


@transaction.atomic
def rollback_job(job: TrainingImportJob):
    if job.status != "applied":
        raise ImportApplyError("Only an applied job can be rolled back.")

    org = job.organisation
    changes = list(job.result.get("changes", []))
    restored = deleted = skipped = 0

    # Reverse order so questions/resources are handled before templates/standards.
    for change in reversed(changes):
        entity_type = change["entity_type"]
        model = _model_for(entity_type)
        obj = model.objects.filter(pk=change["object_id"], organisation=org).first()
        binding = _binding(org, entity_type, change["source_key"])

        if change["action"] == "created":
            if obj:
                obj.delete()
                deleted += 1
            if binding:
                binding.delete()
            continue

        if change["action"] == "updated":
            if not obj:
                skipped += 1
                continue
            before = deepcopy(change.get("before", {}))
            # FK snapshots are serialized by Django JSON as ids only if represented so.
            for field, value in before.items():
                if field in {"standard", "template"}:
                    setattr(obj, f"{field}_id", value if isinstance(value, int) or value is None else getattr(value, "pk", None))
                else:
                    setattr(obj, field, value)
            obj.save()
            restored += 1

    job.status = "rolled_back"
    job.rolled_back_at = timezone.now()
    result = dict(job.result)
    result["rollback"] = {"deleted": deleted, "restored": restored, "skipped": skipped}
    job.result = result
    job.save(update_fields=["status", "rolled_back_at", "result"])
    return result["rollback"]
