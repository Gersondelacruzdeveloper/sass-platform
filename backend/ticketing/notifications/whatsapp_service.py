from __future__ import annotations

import json
import logging
import mimetypes
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, BinaryIO, Iterable, Mapping, Sequence

import requests
from django.conf import settings as django_settings
from django.utils import timezone

from ticketing.models import TicketingWhatsAppSettings


logger = logging.getLogger(__name__)


class WhatsAppConfigurationError(RuntimeError):
    """Raised when an organisation's WhatsApp integration is incomplete."""


class WhatsAppAPIError(RuntimeError):
    """Raised when Meta rejects or cannot process a WhatsApp API request."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        error_code: int | None = None,
        error_subcode: int | None = None,
        response_data: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.error_subcode = error_subcode
        self.response_data = dict(response_data or {})


@dataclass(frozen=True)
class WhatsAppSendResult:
    """Normalized result returned after Meta accepts a message."""

    message_id: str
    recipient: str
    raw_response: dict[str, Any]


class BookingWhatsAppService:
    """
    Meta WhatsApp Cloud API service for a single SaaS organisation.

    The connected organisation number is the sender. Recipient numbers come
    from Booking/Customer for customer messages and TicketingBusinessEntity or
    ProductBusinessAgreement for supplier messages.

    Meta endpoints used:
    - GET  /{phone-number-id}
    - POST /{phone-number-id}/messages
    - POST /{phone-number-id}/media
    """

    DEFAULT_GRAPH_API_VERSION = getattr(
        django_settings,
        "WHATSAPP_GRAPH_API_VERSION",
        "v23.0",
    )
    DEFAULT_TIMEOUT_SECONDS = int(
        getattr(django_settings, "WHATSAPP_HTTP_TIMEOUT_SECONDS", 30)
    )
    GRAPH_BASE_URL = "https://graph.facebook.com"

    def __init__(
        self,
        whatsapp_settings: TicketingWhatsAppSettings,
        *,
        session: requests.Session | None = None,
        timeout: int | None = None,
        graph_api_version: str | None = None,
    ) -> None:
        self.settings = whatsapp_settings
        self.session = session or requests.Session()
        self.timeout = timeout or self.DEFAULT_TIMEOUT_SECONDS
        self.graph_api_version = (
            graph_api_version or self.DEFAULT_GRAPH_API_VERSION
        ).strip("/")

    @classmethod
    def for_organisation(
        cls,
        organisation: Any,
        *,
        session: requests.Session | None = None,
    ) -> "BookingWhatsAppService":
        """
        Build the service from an Organisation instance.

        Raises WhatsAppConfigurationError when settings do not exist.
        """
        try:
            whatsapp_settings = organisation.ticketing_whatsapp_settings
        except TicketingWhatsAppSettings.DoesNotExist as exc:
            raise WhatsAppConfigurationError(
                "WhatsApp settings have not been created for this organisation."
            ) from exc

        return cls(whatsapp_settings, session=session)

    @property
    def phone_number_id(self) -> str:
        return str(self.settings.phone_number_id or "").strip()

    @property
    def access_token(self) -> str:
        return str(self.settings.access_token or "").strip()

    @property
    def messages_url(self) -> str:
        return self._graph_url(f"{self.phone_number_id}/messages")

    @property
    def media_url(self) -> str:
        return self._graph_url(f"{self.phone_number_id}/media")

    def _graph_url(self, endpoint: str) -> str:
        endpoint = str(endpoint or "").lstrip("/")
        return f"{self.GRAPH_BASE_URL}/{self.graph_api_version}/{endpoint}"

    def _headers(self, *, include_json: bool = True) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.access_token}",
        }
        if include_json:
            headers["Content-Type"] = "application/json"
        return headers

    def validate_configuration(self, *, require_connected: bool = True) -> None:
        missing: list[str] = []

        if not self.settings.is_active:
            missing.append("is_active")
        if not self.phone_number_id:
            missing.append("phone_number_id")
        if not self.access_token:
            missing.append("access_token")

        if missing:
            raise WhatsAppConfigurationError(
                "WhatsApp integration is incomplete. Missing or disabled: "
                + ", ".join(missing)
            )

        if require_connected and self.settings.connection_status != "connected":
            raise WhatsAppConfigurationError(
                "WhatsApp integration is not connected."
            )

        if (
            self.settings.token_expires_at
            and self.settings.token_expires_at <= timezone.now()
        ):
            raise WhatsAppConfigurationError(
                "The WhatsApp access token has expired."
            )

    @staticmethod
    def normalize_phone_number(phone_number: str) -> str:
        """
        Return an international number containing digits only.

        Examples:
            +1 (809) 555-0100 -> 18095550100
            1-809-555-0100   -> 18095550100

        The caller must provide a country code. This method intentionally does
        not guess one because organisations may send internationally.
        """
        raw_value = str(phone_number or "").strip()
        normalized = re.sub(r"\D", "", raw_value)

        if not normalized:
            raise ValueError("A WhatsApp recipient phone number is required.")

        if len(normalized) < 8 or len(normalized) > 15:
            raise ValueError(
                "WhatsApp phone numbers must include the country code and "
                "contain between 8 and 15 digits."
            )

        return normalized

    @staticmethod
    def _extract_api_error(
        response: requests.Response,
    ) -> WhatsAppAPIError:
        try:
            data = response.json()
        except ValueError:
            data = {"raw": response.text}

        error = data.get("error") if isinstance(data, dict) else None
        error = error if isinstance(error, dict) else {}

        message = (
            error.get("error_user_msg")
            or error.get("message")
            or f"Meta WhatsApp API request failed with HTTP {response.status_code}."
        )

        return WhatsAppAPIError(
            str(message),
            status_code=response.status_code,
            error_code=error.get("code"),
            error_subcode=error.get("error_subcode"),
            response_data=data if isinstance(data, dict) else {"data": data},
        )

    def _request(
        self,
        method: str,
        url: str,
        *,
        json_payload: Mapping[str, Any] | None = None,
        data: Mapping[str, Any] | None = None,
        files: Mapping[str, Any] | None = None,
        require_connected: bool = True,
    ) -> dict[str, Any]:
        self.validate_configuration(require_connected=require_connected)

        try:
            response = self.session.request(
                method=method.upper(),
                url=url,
                headers=self._headers(include_json=files is None),
                json=dict(json_payload) if json_payload is not None else None,
                data=dict(data) if data is not None else None,
                files=files,
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise WhatsAppAPIError(
                f"Could not reach the Meta WhatsApp API: {exc}"
            ) from exc

        if not response.ok:
            raise self._extract_api_error(response)

        if response.status_code == 204 or not response.content:
            return {}

        try:
            payload = response.json()
        except ValueError as exc:
            raise WhatsAppAPIError(
                "Meta returned a non-JSON response.",
                status_code=response.status_code,
                response_data={"raw": response.text},
            ) from exc

        if not isinstance(payload, dict):
            raise WhatsAppAPIError(
                "Meta returned an unexpected response.",
                status_code=response.status_code,
                response_data={"data": payload},
            )

        return payload

    def test_connection(self, *, save_result: bool = True) -> dict[str, Any]:
        """
        Validate credentials and load sender-number metadata from Meta.

        This may run before connection_status becomes "connected".
        """
        self.validate_configuration(require_connected=False)

        try:
            payload = self._request(
                "GET",
                self._graph_url(self.phone_number_id),
                require_connected=False,
            )

            display_phone_number = str(
                payload.get("display_phone_number") or ""
            )
            verified_name = str(payload.get("verified_name") or "")

            self.settings.display_phone_number = display_phone_number
            self.settings.verified_business_name = verified_name
            self.settings.last_test_at = timezone.now()
            self.settings.last_error_message = ""
            self.settings.connection_status = "connected"
            self.settings.connected_at = (
                self.settings.connected_at or timezone.now()
            )

            if save_result:
                self.settings.save(
                    update_fields=[
                        "display_phone_number",
                        "verified_business_name",
                        "last_test_at",
                        "last_error_message",
                        "connection_status",
                        "connected_at",
                        "updated_at",
                    ]
                )

            return payload

        except Exception as exc:
            if save_result:
                self.settings.connection_status = "failed"
                self.settings.last_test_at = timezone.now()
                self.settings.last_error_message = str(exc)
                self.settings.save(
                    update_fields=[
                        "connection_status",
                        "last_test_at",
                        "last_error_message",
                        "updated_at",
                    ]
                )
            raise

    @staticmethod
    def text_parameter(value: Any) -> dict[str, Any]:
        return {
            "type": "text",
            "text": str(value if value is not None else ""),
        }

    @classmethod
    def body_component(cls, values: Sequence[Any]) -> dict[str, Any]:
        return {
            "type": "body",
            "parameters": [cls.text_parameter(value) for value in values],
        }

    @staticmethod
    def document_header_component(
        *,
        media_id: str | None = None,
        link: str | None = None,
        filename: str | None = None,
    ) -> dict[str, Any]:
        document: dict[str, Any] = {}

        if media_id:
            document["id"] = media_id
        elif link:
            document["link"] = link
        else:
            raise ValueError("A Meta media ID or public document link is required.")

        if filename:
            document["filename"] = filename

        return {
            "type": "header",
            "parameters": [
                {
                    "type": "document",
                    "document": document,
                }
            ],
        }

    @staticmethod
    def url_button_component(
        *,
        index: int,
        value: str,
    ) -> dict[str, Any]:
        return {
            "type": "button",
            "sub_type": "url",
            "index": str(index),
            "parameters": [
                {
                    "type": "text",
                    "text": str(value),
                }
            ],
        }

    def _send_message_payload(
        self,
        recipient: str,
        message_payload: Mapping[str, Any],
    ) -> WhatsAppSendResult:
        normalized_recipient = self.normalize_phone_number(recipient)

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": normalized_recipient,
            **dict(message_payload),
        }

        response = self._request(
            "POST",
            self.messages_url,
            json_payload=payload,
        )

        messages = response.get("messages") or []
        message_id = ""

        if isinstance(messages, list) and messages:
            first_message = messages[0]
            if isinstance(first_message, dict):
                message_id = str(first_message.get("id") or "")

        if not message_id:
            raise WhatsAppAPIError(
                "Meta accepted the request but did not return a message ID.",
                response_data=response,
            )

        return WhatsAppSendResult(
            message_id=message_id,
            recipient=normalized_recipient,
            raw_response=response,
        )

    def send_text(
        self,
        recipient: str,
        message: str,
        *,
        preview_url: bool = False,
    ) -> WhatsAppSendResult:
        """
        Send free-form text.

        Use only when the recipient's customer-service conversation window is
        open. For business-initiated booking notifications, use send_template.
        """
        text = str(message or "").strip()
        if not text:
            raise ValueError("WhatsApp text message cannot be empty.")

        return self._send_message_payload(
            recipient,
            {
                "type": "text",
                "text": {
                    "preview_url": bool(preview_url),
                    "body": text,
                },
            },
        )

    def send_template(
        self,
        recipient: str,
        *,
        template_name: str,
        language_code: str = "en_US",
        components: Sequence[Mapping[str, Any]] | None = None,
    ) -> WhatsAppSendResult:
        template_name = str(template_name or "").strip()
        language_code = str(language_code or "").strip()

        if not template_name:
            raise ValueError("An approved WhatsApp template name is required.")
        if not language_code:
            raise ValueError("A WhatsApp template language code is required.")

        template: dict[str, Any] = {
            "name": template_name,
            "language": {
                "code": language_code,
            },
        }

        if components:
            template["components"] = [dict(component) for component in components]

        return self._send_message_payload(
            recipient,
            {
                "type": "template",
                "template": template,
            },
        )

    def upload_media(
        self,
        file: str | Path | BinaryIO,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
    ) -> str:
        """
        Upload media to Meta and return its media ID.

        The service closes only files that it opens itself. Caller-owned streams
        remain open.
        """
        opened_here = False
        file_object: BinaryIO

        if isinstance(file, (str, Path)):
            path = Path(file)
            if not path.exists() or not path.is_file():
                raise FileNotFoundError(f"WhatsApp media file not found: {path}")
            file_object = path.open("rb")
            opened_here = True
            filename = filename or path.name
        else:
            file_object = file
            filename = filename or Path(
                str(getattr(file_object, "name", "document"))
            ).name

        mime_type = (
            mime_type
            or mimetypes.guess_type(filename or "")[0]
            or "application/octet-stream"
        )

        try:
            response = self._request(
                "POST",
                self.media_url,
                data={
                    "messaging_product": "whatsapp",
                    "type": mime_type,
                },
                files={
                    "file": (
                        filename or "document",
                        file_object,
                        mime_type,
                    )
                },
            )
        finally:
            if opened_here:
                file_object.close()

        media_id = str(response.get("id") or "")
        if not media_id:
            raise WhatsAppAPIError(
                "Meta uploaded the media but did not return a media ID.",
                response_data=response,
            )

        return media_id

    def send_document(
        self,
        recipient: str,
        *,
        media_id: str | None = None,
        link: str | None = None,
        filename: str | None = None,
        caption: str | None = None,
    ) -> WhatsAppSendResult:
        document: dict[str, Any] = {}

        if media_id:
            document["id"] = media_id
        elif link:
            document["link"] = link
        else:
            raise ValueError("A Meta media ID or public document link is required.")

        if filename:
            document["filename"] = filename
        if caption:
            document["caption"] = caption

        return self._send_message_payload(
            recipient,
            {
                "type": "document",
                "document": document,
            },
        )

    def upload_and_send_document(
        self,
        recipient: str,
        file: str | Path | BinaryIO,
        *,
        filename: str | None = None,
        mime_type: str | None = None,
        caption: str | None = None,
    ) -> WhatsAppSendResult:
        media_id = self.upload_media(
            file,
            filename=filename,
            mime_type=mime_type,
        )
        return self.send_document(
            recipient,
            media_id=media_id,
            filename=filename,
            caption=caption,
        )

    def send_customer_confirmation(
        self,
        recipient: str,
        *,
        body_values: Sequence[Any],
        document_media_id: str | None = None,
        document_link: str | None = None,
        document_filename: str | None = None,
        extra_components: Sequence[Mapping[str, Any]] | None = None,
    ) -> WhatsAppSendResult:
        """
        Send the organisation's configured customer-confirmation template.

        The exact number/order of body_values must match the approved Meta
        template configured for this organisation.
        """
        template_name = self.settings.customer_confirmation_template
        language = self.settings.customer_confirmation_language or "en_US"

        components: list[Mapping[str, Any]] = []

        if document_media_id or document_link:
            components.append(
                self.document_header_component(
                    media_id=document_media_id,
                    link=document_link,
                    filename=document_filename,
                )
            )

        if body_values:
            components.append(self.body_component(body_values))

        if extra_components:
            components.extend(extra_components)

        return self.send_template(
            recipient,
            template_name=template_name,
            language_code=language,
            components=components,
        )

    def send_supplier_booking(
        self,
        recipient: str,
        *,
        body_values: Sequence[Any],
        document_media_id: str | None = None,
        document_link: str | None = None,
        document_filename: str | None = None,
        extra_components: Sequence[Mapping[str, Any]] | None = None,
    ) -> WhatsAppSendResult:
        """
        Send the configured supplier reservation template.

        The exact number/order of body_values must match the approved Meta
        supplier template.
        """
        template_name = self.settings.supplier_booking_template
        language = self.settings.supplier_booking_language or "en_US"

        components: list[Mapping[str, Any]] = []

        if document_media_id or document_link:
            components.append(
                self.document_header_component(
                    media_id=document_media_id,
                    link=document_link,
                    filename=document_filename,
                )
            )

        if body_values:
            components.append(self.body_component(body_values))

        if extra_components:
            components.extend(extra_components)

        return self.send_template(
            recipient,
            template_name=template_name,
            language_code=language,
            components=components,
        )

    def send_customer_reminder(
        self,
        recipient: str,
        *,
        body_values: Sequence[Any],
        extra_components: Sequence[Mapping[str, Any]] | None = None,
    ) -> WhatsAppSendResult:
        template_name = self.settings.customer_reminder_template
        language = self.settings.customer_reminder_language or "en_US"

        components: list[Mapping[str, Any]] = []
        if body_values:
            components.append(self.body_component(body_values))
        if extra_components:
            components.extend(extra_components)

        return self.send_template(
            recipient,
            template_name=template_name,
            language_code=language,
            components=components,
        )

    @staticmethod
    def serialize_result(result: WhatsAppSendResult) -> dict[str, Any]:
        return {
            "message_id": result.message_id,
            "recipient": result.recipient,
            "provider_response": result.raw_response,
        }


# Backwards-compatible alias for code that may import a generic service name.
WhatsAppService = BookingWhatsAppService
