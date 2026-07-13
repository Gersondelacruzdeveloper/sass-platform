import base64
import logging
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from django.conf import settings
from django.utils import timezone
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build


logger = logging.getLogger(__name__)


GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
]


GOOGLE_CLIENT_CONFIG = {
    "web": {
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}


class GoogleOAuthReconnectRequired(RuntimeError):
    """
    Raised when Google's saved refresh token has expired or been revoked.

    Retrying the same token will not work. The organisation must reconnect its
    Google account.
    """


def get_google_oauth_config():
    client_id = getattr(settings, "GOOGLE_CLIENT_ID", "")
    client_secret = getattr(settings, "GOOGLE_CLIENT_SECRET", "")
    redirect_uri = getattr(settings, "GOOGLE_OAUTH_REDIRECT_URI", "")

    if not client_id or not client_secret or not redirect_uri:
        raise ValueError("Google OAuth settings are missing.")

    return client_id, client_secret, redirect_uri


def build_google_flow(state=None):
    client_id, client_secret, redirect_uri = get_google_oauth_config()

    client_config = {
        "web": {
            **GOOGLE_CLIENT_CONFIG["web"],
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uris": [redirect_uri],
        }
    }

    flow = Flow.from_client_config(
        client_config,
        scopes=GMAIL_SCOPES,
        state=state,
        autogenerate_code_verifier=False,
    )
    flow.redirect_uri = redirect_uri

    return flow


def build_google_authorization_url(state):
    flow = build_google_flow(state=state)

    authorization_url, returned_state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )

    return authorization_url, returned_state


def exchange_google_code_for_credentials(code, state=None):
    flow = build_google_flow(state=state)
    flow.fetch_token(code=code)
    return flow.credentials


def mark_google_reconnect_required(email_settings, message):
    """
    Mark Google as disconnected and clear unusable tokens.

    The connected account email remains visible so the user knows which account
    needs to be reconnected.
    """
    email_settings.oauth_connected = False
    email_settings.oauth_access_token = ""
    email_settings.oauth_refresh_token = ""
    email_settings.oauth_token_expiry = None
    email_settings.oauth_last_refresh = timezone.now()
    email_settings.connection_status = "failed"
    email_settings.last_error_message = str(message or "")
    email_settings.save(
        update_fields=[
            "oauth_connected",
            "oauth_access_token",
            "oauth_refresh_token",
            "oauth_token_expiry",
            "oauth_last_refresh",
            "connection_status",
            "last_error_message",
            "updated_at",
        ]
    )


def refresh_google_credentials(email_settings):
    client_id, client_secret, _ = get_google_oauth_config()

    if not email_settings.oauth_refresh_token:
        message = (
            "Google is not connected or the saved refresh token is missing. "
            "Reconnect the Google account in Email Settings."
        )
        mark_google_reconnect_required(email_settings, message)
        raise GoogleOAuthReconnectRequired(message)

    credentials = Credentials(
        token=email_settings.oauth_access_token or None,
        refresh_token=email_settings.oauth_refresh_token or None,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=GMAIL_SCOPES,
    )

    if credentials.expired:
        try:
            credentials.refresh(Request())
        except RefreshError as exc:
            error_text = str(exc)
            message = (
                "Google authorization has expired or was revoked. "
                "Reconnect the Google account in Email Settings."
            )

            logger.warning(
                "Google OAuth refresh failed for organisation id=%s: %s",
                getattr(email_settings, "organisation_id", None),
                error_text,
            )

            mark_google_reconnect_required(
                email_settings,
                f"{message} Google response: {error_text}",
            )
            raise GoogleOAuthReconnectRequired(message) from exc

        email_settings.oauth_access_token = credentials.token or ""
        email_settings.oauth_token_expiry = credentials.expiry
        email_settings.oauth_last_refresh = timezone.now()
        email_settings.oauth_connected = True
        email_settings.connection_status = "connected"
        email_settings.last_error_message = ""
        email_settings.save(
            update_fields=[
                "oauth_access_token",
                "oauth_token_expiry",
                "oauth_last_refresh",
                "oauth_connected",
                "connection_status",
                "last_error_message",
                "updated_at",
            ]
        )

    return credentials


def get_google_user_email(credentials):
    service = build("gmail", "v1", credentials=credentials)
    profile = service.users().getProfile(userId="me").execute()
    return profile.get("emailAddress", "")


def store_google_credentials(email_settings, credentials):
    connected_email = get_google_user_email(credentials)

    email_settings.provider = "google_oauth"
    email_settings.is_active = True
    email_settings.oauth_connected = True
    email_settings.oauth_provider_account = connected_email
    email_settings.oauth_access_token = credentials.token or ""

    if credentials.refresh_token:
        email_settings.oauth_refresh_token = credentials.refresh_token

    email_settings.oauth_token_expiry = credentials.expiry
    email_settings.oauth_last_refresh = timezone.now()
    email_settings.oauth_scopes = list(credentials.scopes or GMAIL_SCOPES)

    if not email_settings.sender_email:
        email_settings.sender_email = connected_email

    if not email_settings.reply_to_email:
        email_settings.reply_to_email = connected_email

    email_settings.connection_status = "connected"
    email_settings.last_error_message = ""

    email_settings.save()
    return email_settings


def disconnect_google(email_settings):
    email_settings.oauth_connected = False
    email_settings.oauth_provider_account = ""
    email_settings.oauth_access_token = ""
    email_settings.oauth_refresh_token = ""
    email_settings.oauth_token_expiry = None
    email_settings.oauth_last_refresh = None
    email_settings.oauth_connection_id = ""
    email_settings.oauth_scopes = []
    email_settings.connection_status = "not_configured"
    email_settings.last_error_message = ""
    email_settings.save()
    return email_settings


def create_gmail_message(
    sender,
    to,
    subject,
    body,
    reply_to=None,
    html_body=None,
    attachments=None,
):
    attachments = attachments or []

    if html_body or attachments:
        message = MIMEMultipart("mixed")
        alternative = MIMEMultipart("alternative")
        alternative.attach(MIMEText(body or "", "plain", "utf-8"))

        if html_body:
            alternative.attach(MIMEText(html_body, "html", "utf-8"))

        message.attach(alternative)

        for attachment in attachments:
            filename = attachment.get("filename") or "attachment"
            content = attachment.get("content")

            if content is None:
                continue

            mime_type = attachment.get("mime_type") or "application/octet-stream"
            _, _, sub_type = mime_type.partition("/")

            part = MIMEApplication(
                content,
                _subtype=sub_type or "octet-stream",
            )
            part.add_header(
                "Content-Disposition",
                "attachment",
                filename=filename,
            )
            message.attach(part)
    else:
        message = MIMEText(body or "", "plain", "utf-8")

    message["to"] = to
    message["from"] = sender
    message["subject"] = subject

    if reply_to:
        message["reply-to"] = reply_to

    raw = base64.urlsafe_b64encode(
        message.as_bytes()
    ).decode("utf-8")

    return {"raw": raw}


def send_gmail_email(
    email_settings,
    to_email,
    subject,
    body,
    html_body=None,
    attachments=None,
):
    credentials = refresh_google_credentials(email_settings)
    service = build("gmail", "v1", credentials=credentials)

    sender_email = (
        email_settings.sender_email
        or email_settings.oauth_provider_account
    )

    if not sender_email:
        raise ValueError("Google sender email is not configured.")

    sender_name = email_settings.sender_name or ""
    sender = (
        f"{sender_name} <{sender_email}>"
        if sender_name
        else sender_email
    )
    reply_to = (
        email_settings.reply_to_email
        or email_settings.oauth_provider_account
    )

    message = create_gmail_message(
        sender=sender,
        to=to_email,
        subject=subject,
        body=body,
        reply_to=reply_to,
        html_body=html_body,
        attachments=attachments,
    )

    return service.users().messages().send(
        userId="me",
        body=message,
    ).execute()
