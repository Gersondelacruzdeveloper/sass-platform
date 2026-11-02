from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        (
            "colmado",
            "0010_cashregistersession_sale_cash_register_session_and_more",
        ),
    ]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="user",
            field=models.ForeignKey(
                blank=True,
                help_text=(
                    "Cuenta utilizada por el empleado para entrar a Mi Colmado."
                ),
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="colmado_employee_records",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddConstraint(
            model_name="employee",
            constraint=models.UniqueConstraint(
                condition=models.Q(user__isnull=False),
                fields=("organisation", "user"),
                name="colmado_employee_unique_user_per_organisation",
            ),
        ),
    ]
