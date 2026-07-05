"""
Future Celery tasks for ticketing.

Later:
from celery import shared_task

@shared_task(bind=True, max_retries=3)
def send_booking_notifications_task(self, booking_id):
    ...
"""
