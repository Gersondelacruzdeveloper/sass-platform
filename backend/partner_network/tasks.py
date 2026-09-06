"""Celery tasks for Partner Network follow-up and maintenance."""

from celery import shared_task
from django.utils import timezone

from partner_network.models import ReferralFeedbackRequest, ReferralSession


@shared_task(name="partner_network.expire_referral_sessions")
def expire_referral_sessions_task():
    return ReferralSession.objects.filter(
        status=ReferralSession.STATUS_ACTIVE,
        expires_at__lte=timezone.now(),
    ).update(status=ReferralSession.STATUS_EXPIRED)


@shared_task(
    bind=True,
    max_retries=3,
    name="partner_network.send_referral_feedback",
)
def send_referral_feedback_task(self, feedback_request_id: int):
    from partner_network.services.review_service import send_feedback_request

    try:
        result = send_feedback_request(feedback_request_id)
        if result.get("action") == "failed":
            raise RuntimeError("Referral feedback delivery failed.")
        return result
    except Exception as exc:
        raise self.retry(exc=exc, countdown=min(60 * (2 ** self.request.retries), 900))


@shared_task(name="partner_network.send_due_referral_feedback")
def send_due_referral_feedback_task():
    ids = list(
        ReferralFeedbackRequest.objects.filter(
            status=ReferralFeedbackRequest.STATUS_PENDING,
            scheduled_for__lte=timezone.now(),
        ).values_list("id", flat=True)[:500]
    )
    for request_id in ids:
        send_referral_feedback_task.delay(request_id)
    return len(ids)
