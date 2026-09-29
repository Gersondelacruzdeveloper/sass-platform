from django.conf import settings
from django.db import models


class TrainingImportJob(models.Model):
    STATUS_CHOICES = [
        ("preview", "Preview"),
        ("applied", "Applied"),
        ("failed", "Failed"),
        ("rolled_back", "Rolled back"),
    ]

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_import_jobs",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="training_import_jobs",
    )
    file_name = models.CharField(max_length=255)
    file_sha256 = models.CharField(max_length=64)
    dataset_key = models.CharField(max_length=150, blank=True)
    dataset_version = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="preview")
    payload = models.JSONField(default=dict, blank=True)
    preview = models.JSONField(default=dict, blank=True)
    result = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    applied_at = models.DateTimeField(null=True, blank=True)
    rolled_back_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.organisation_id} - {self.file_name} - {self.status}"


class TrainingImportBinding(models.Model):
    """Maps a stable source key from an import package to an existing Training object."""

    ENTITY_CHOICES = [
        ("standard", "Standard"),
        ("procedure", "Procedure resource"),
        ("template", "Evaluation template"),
        ("question", "Evaluation question"),
    ]

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_import_bindings",
    )
    entity_type = models.CharField(max_length=30, choices=ENTITY_CHOICES)
    source_key = models.CharField(max_length=255)
    object_id = models.PositiveBigIntegerField()
    source_priority = models.PositiveIntegerField(default=100)
    source_title = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "entity_type", "source_key"],
                name="uniq_training_import_binding",
            )
        ]
        indexes = [
            models.Index(fields=["organisation", "entity_type"]),
            models.Index(fields=["organisation", "source_key"]),
        ]

    def __str__(self):
        return f"{self.entity_type}:{self.source_key} -> {self.object_id}"
