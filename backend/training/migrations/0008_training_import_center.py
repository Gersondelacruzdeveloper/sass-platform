from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("training", "0007_trainingresource_standardrecoveryplan_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("organisations", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="TrainingImportJob",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("file_name", models.CharField(max_length=255)),
                ("file_sha256", models.CharField(max_length=64)),
                ("dataset_key", models.CharField(blank=True, max_length=150)),
                ("dataset_version", models.CharField(blank=True, max_length=50)),
                ("status", models.CharField(choices=[("preview", "Preview"), ("applied", "Applied"), ("failed", "Failed"), ("rolled_back", "Rolled back")], default="preview", max_length=30)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("preview", models.JSONField(blank=True, default=dict)),
                ("result", models.JSONField(blank=True, default=dict)),
                ("error_message", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("applied_at", models.DateTimeField(blank=True, null=True)),
                ("rolled_back_at", models.DateTimeField(blank=True, null=True)),
                ("created_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="training_import_jobs", to=settings.AUTH_USER_MODEL)),
                ("organisation", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="training_import_jobs", to="organisations.organisation")),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="TrainingImportBinding",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("entity_type", models.CharField(choices=[("standard", "Standard"), ("procedure", "Procedure resource"), ("template", "Evaluation template"), ("question", "Evaluation question")], max_length=30)),
                ("source_key", models.CharField(max_length=255)),
                ("object_id", models.PositiveBigIntegerField()),
                ("source_priority", models.PositiveIntegerField(default=100)),
                ("source_title", models.CharField(blank=True, max_length=255)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organisation", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="training_import_bindings", to="organisations.organisation")),
            ],
        ),
        migrations.AddConstraint(
            model_name="trainingimportbinding",
            constraint=models.UniqueConstraint(fields=("organisation", "entity_type", "source_key"), name="uniq_training_import_binding"),
        ),
        migrations.AddIndex(
            model_name="trainingimportbinding",
            index=models.Index(fields=["organisation", "entity_type"], name="training_imp_organis_ded3da_idx"),
        ),
        migrations.AddIndex(
            model_name="trainingimportbinding",
            index=models.Index(fields=["organisation", "source_key"], name="training_imp_organis_62a777_idx"),
        ),
    ]
