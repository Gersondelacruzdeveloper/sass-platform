import base64
from email.mime.text import MIMEText

from django.conf import settings
from django.utils import timezone
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build


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

    # This is a confidential server-side OAuth flow. We disable automatic PKCE
    # because the callback is handled by Django and we are not storing a
    # code_verifier between connect() and callback(). Without this, Google can
    # return: invalid_grant / Missing code verifier.
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


def refresh_google_credentials(email_settings):
    credentials = Credentials(
        token=email_settings.oauth_access_token or None,
        refresh_token=email_settings.oauth_refresh_token or None,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=GMAIL_SCOPES,
    )

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())

        email_settings.oauth_access_token = credentials.token or ""
        email_settings.oauth_token_expiry = credentials.expiry
        email_settings.oauth_last_refresh = timezone.now()
        email_settings.save(
            update_fields=[
                "oauth_access_token",
                "oauth_token_expiry",
                "oauth_last_refresh",
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
    email_settings.save()
    return email_settings


def create_gmail_message(sender, to, subject, body, reply_to=None):
    message = MIMEText(body, "plain", "utf-8")
    message["to"] = to
    message["from"] = sender
    message["subject"] = subject

    if reply_to:
        message["reply-to"] = reply_to

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    return {"raw": raw}


def send_gmail_email(email_settings, to_email, subject, body):
    credentials = refresh_google_credentials(email_settings)
    service = build("gmail", "v1", credentials=credentials)
import base64
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from django.conf import settings
from django.utils import timezone
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build


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

    # This is a confidential server-side OAuth flow. We disable automatic PKCE
    # because the callback is handled by Django and we are not storing a
    # code_verifier between connect() and callback(). Without this, Google can
    # return: invalid_grant / Missing code verifier.
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


def refresh_google_credentials(email_settings):
    credentials = Credentials(
        token=email_settings.oauth_access_token or None,
        refresh_token=email_settings.oauth_refresh_token or None,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=GMAIL_SCOPES,
    )

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())

        email_settings.oauth_access_token = credentials.token or ""
        email_settings.oauth_token_expiry = credentials.expiry
        email_settings.oauth_last_refresh = timezone.now()
        email_settings.save(
            update_fields=[
                "oauth_access_token",
                "oauth_token_expiry",
                "oauth_last_refresh",
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
    """
    Build a Gmail API message.

    attachments format:
    [
        {
            "filename": "ticket-PCD-XXXX.pdf",
            "content": b"...",
            "mime_type": "application/pdf",
        }
    ]
    """
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
            content = attachment.get("content") or b""
            mime_type = attachment.get("mime_type") or "application/octet-stream"
            main_type, _, sub_type = mime_type.partition("/")

            if main_type == "application":
                part = MIMEApplication(content, _subtype=sub_type or "octet-stream")
            else:
                part = MIMEApplication(content, _subtype="octet-stream")

            part.add_header("Content-Disposition", "attachment", filename=filename)
            message.attach(part)
    else:
        message = MIMEText(body or "", "plain", "utf-8")

    message["to"] = to
    message["from"] = sender
    message["subject"] = subject

    if reply_to:
        message["reply-to"] = reply_to

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    return {"raw": raw}


def send_gmail_email(email_settings, to_email, subject, body, html_body=None, attachments=None):
    credentials = refresh_google_credentials(email_settings)
    service = build("gmail", "v1", credentials=credentials)

    sender_email = email_settings.sender_email or email_settings.oauth_provider_account
    sender_name = email_settings.sender_name or ""
    sender = f"{sender_name} <{sender_email}>" if sender_name else sender_email
    reply_to = email_settings.reply_to_email or email_settings.oauth_provider_account

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

    sender_email = (
        email_settings.sender_email
        or email_settings.oauth_provider_account
        or email_settings.oauth_provider_account
    )
    sender_name = email_settings.sender_name or ""
    sender = f"{sender_name} <{sender_email}>" if sender_name else sender_email
    reply_to = email_settings.reply_to_email or email_settings.oauth_provider_account

    message = create_gmail_message(
        sender=sender,
        to=to_email,
        subject=subject,
        body=body,
        reply_to=reply_to,
    )

    return service.users().messages().send(
        userId="me",
        body=message,
    ).execute()
