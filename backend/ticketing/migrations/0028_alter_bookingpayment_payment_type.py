from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ticketing", "0027_bookingpayment_provider_identifier_constraints"),
    ]

    operations = [
        migrations.AlterField(
            model_name="bookingpayment",
            name="payment_type",
            field=models.CharField(
                choices=[
                    ("full", "Full Payment"),
                    ("deposit", "Deposit"),
                    ("balance", "Balance"),
                    ("commission_only", "Commission Only"),
                    ("partial", "Partial"),
                    ("refund", "Refund"),
                    ("settlement", "Seller Settlement"),
                ],
                max_length=30,
            ),
        ),
    ]
