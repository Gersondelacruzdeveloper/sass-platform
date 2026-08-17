from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ticketing", "0026_customeritinerarycart_converted_booking"),
    ]

    operations = [
        migrations.AddConstraint(
            model_name="bookingpayment",
            constraint=models.UniqueConstraint(
                fields=("provider", "provider_payment_id"),
                condition=~models.Q(provider_payment_id=""),
                name="tkt_pay_provider_payment_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="bookingpayment",
            constraint=models.UniqueConstraint(
                fields=("provider", "provider_checkout_id"),
                condition=~models.Q(provider_checkout_id=""),
                name="tkt_pay_provider_checkout_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="bookingpayment",
            constraint=models.UniqueConstraint(
                fields=("provider", "provider_order_id"),
                condition=~models.Q(provider_order_id=""),
                name="tkt_pay_provider_order_uniq",
            ),
        ),
        migrations.AddConstraint(
            model_name="bookingpayment",
            constraint=models.UniqueConstraint(
                fields=("provider", "provider_capture_id"),
                condition=~models.Q(provider_capture_id=""),
                name="tkt_pay_provider_capture_uniq",
            ),
        ),
    ]
