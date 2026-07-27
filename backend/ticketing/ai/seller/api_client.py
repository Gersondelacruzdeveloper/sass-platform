# ticketing/ai/seller/api_client.py

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Any, Mapping
from urllib.parse import urljoin

import requests
from django.conf import settings


logger = logging.getLogger(__name__)


class SellerApiError(Exception):
    """
    Raised when an existing Ticketing API rejects or cannot complete a request.
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        response_data: Any = None,
        method: str = "",
        endpoint: str = "",
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.response_data = response_data
        self.method = method
        self.endpoint = endpoint

    def to_dict(self) -> dict[str, Any]:
        return {
            "message": self.message,
            "status_code": self.status_code,
            "response_data": self.response_data,
            "method": self.method,
            "endpoint": self.endpoint,
        }


@dataclass(frozen=True)
class SellerApiCredentials:
    """
    Authentication details forwarded to the existing Ticketing APIs.

    Use the authenticated seller's access token or session cookie. The AI must
    never use an owner or administrator credential to act as a seller.
    """

    access_token: str = ""
    session_cookie: str = ""
    csrf_token: str = ""

    @classmethod
    def from_request(cls, request: Any) -> "SellerApiCredentials":
        authorization = str(
            request.headers.get("Authorization", "")
        ).strip()

        access_token = authorization
        if authorization.lower().startswith("bearer "):
            access_token = authorization[7:].strip()

        return cls(
            access_token=access_token,
            session_cookie=str(
                request.COOKIES.get(
                    getattr(settings, "SESSION_COOKIE_NAME", "sessionid"),
                    "",
                )
            ).strip(),
            csrf_token=str(
                request.COOKIES.get(
                    getattr(settings, "CSRF_COOKIE_NAME", "csrftoken"),
                    "",
                )
            ).strip(),
        )


class SellerBookingApiClient:
    """
    Thin HTTP client over the existing seller booking APIs.

    This class deliberately does not implement:

    - seller permission rules
    - product access rules
    - availability rules
    - pricing rules
    - discount rules
    - pickup rules
    - payment rules
    - booking validation

    Those rules remain inside the existing Ticketing API and serializers.
    """

    DEFAULT_TIMEOUT_SECONDS = 30

    def __init__(
        self,
        *,
        organisation_slug: str,
        credentials: SellerApiCredentials,
        base_url: str | None = None,
        timeout: int | float | None = None,
        extra_headers: Mapping[str, str] | None = None,
        session: requests.Session | None = None,
    ) -> None:
        slug = str(organisation_slug or "").strip()
        if not slug:
            raise ValueError("organisation_slug is required.")

        self.organisation_slug = slug
        self.credentials = credentials
        self.base_url = self._normalise_base_url(
            base_url or self._get_configured_base_url()
        )
        self.timeout = timeout or self.DEFAULT_TIMEOUT_SECONDS
        self.extra_headers = dict(extra_headers or {})
        self.session = session or requests.Session()

    # ------------------------------------------------------------------
    # Seller
    # ------------------------------------------------------------------

    def get_me(self) -> dict[str, Any]:
        """
        Return the authenticated seller and the permissions assigned to them.
        """

        return self._get("/ticketing/sellers/me/")

    # ------------------------------------------------------------------
    # Products
    # ------------------------------------------------------------------

    def get_products(
        self,
        *,
        is_active: bool = True,
        **filters: Any,
    ) -> list[dict[str, Any]]:
        """
        Return only products available to the authenticated seller.
        """

        params = {
            "is_active": is_active,
            **filters,
        }

        response = self._get(
            "/ticketing/seller/products/",
            params=params,
        )
        return self._normalise_list(response)

    def get_public_products(
        self,
        *,
        status: str = "active",
        **filters: Any,
    ) -> list[dict[str, Any]]:
        """
        Return public product information.

        This mirrors the existing seller booking page, which may use the public
        product response to obtain embedded pickup schedules and public payment
        configuration. Product access must still come from get_products().
        """

        params = {
            "status": status,
            **filters,
        }

        response = self._get(
            "/ticketing/public/products/",
            params=params,
        )
        return self._normalise_list(response)

    def get_product_by_id(
        self,
        product_id: int,
    ) -> dict[str, Any]:
        """
        Find a product inside the authenticated seller's product response.

        This does not call the unrestricted administrator product endpoint.
        """

        trusted_product_id = self._required_positive_int(
            product_id,
            "product_id",
        )

        for product in self.get_products(is_active=True):
            if self._safe_int(product.get("id")) == trusted_product_id:
                return product

        raise SellerApiError(
            "The selected product is not available to this seller.",
            status_code=404,
            response_data={"product_id": trusted_product_id},
            method="GET",
            endpoint="/ticketing/seller/products/",
        )

    # ------------------------------------------------------------------
    # Live product availability
    # ------------------------------------------------------------------

    def get_live_availability(
        self,
        *,
        product_slug: str,
        service_date: str,
    ) -> dict[str, Any]:
        """
        Load live options and prices for a public product such as Coco Bongo.
        """

        clean_product_slug = str(product_slug or "").strip()
        clean_service_date = str(service_date or "").strip()

        if not clean_product_slug:
            raise ValueError("product_slug is required.")

        if not clean_service_date:
            raise ValueError("service_date is required.")

        endpoint = (
            f"/ticketing/public/{self.organisation_slug}/"
            f"products/{clean_product_slug}/availability/"
        )

        response = self._get(
            endpoint,
            params={"date": clean_service_date},
            include_organisation_params=False,
        )

        if not isinstance(response, dict):
            raise SellerApiError(
                "The availability API returned an invalid response.",
                response_data=response,
                method="GET",
                endpoint=endpoint,
            )

        return response

    # ------------------------------------------------------------------
    # Pickup
    # ------------------------------------------------------------------

    def get_pickup_locations(
        self,
        *,
        is_active: bool = True,
        **filters: Any,
    ) -> list[dict[str, Any]]:
        params = {
            "is_active": is_active,
            **filters,
        }

        response = self._get(
            "/ticketing/pickup-locations/",
            params=params,
        )
        return self._normalise_list(response)

    def get_pickup_schedules(
        self,
        **filters: Any,
    ) -> list[dict[str, Any]]:
        response = self._get(
            "/ticketing/pickup-schedules/",
            params=filters,
        )
        return self._normalise_list(response)

    def resolve_public_pickup(
        self,
        *,
        product_id: int,
        pickup_location_id: int,
        service_date: str,
    ) -> dict[str, Any]:
        """
        Resolve pickup through the public endpoint.

        This method is kept for compatibility with installations that expose
        the resolver endpoint. The main ``resolve_pickup`` method below does
        not depend on this endpoint because some deployments do not register
        it in their URL configuration.
        """

        return self._get(
            "/ticketing/public/pickup-schedules/resolve/",
            params={
                "product": self._required_positive_int(
                    product_id,
                    "product_id",
                ),
                "pickup_location": self._required_positive_int(
                    pickup_location_id,
                    "pickup_location_id",
                ),
                "service_date": self._required_string(
                    service_date,
                    "service_date",
                ),
            },
        )

    def resolve_private_pickup(
        self,
        *,
        product_id: int,
        pickup_location_id: int,
        service_date: str,
    ) -> dict[str, Any]:
        """
        Resolve pickup through the authenticated endpoint.

        This method is retained for compatibility, but ``resolve_pickup`` uses
        the schedule list directly so AI bookings also work when this endpoint
        is not registered.
        """

        return self._get(
            "/ticketing/pickup-schedules/resolve/",
            params={
                "product": self._required_positive_int(
                    product_id,
                    "product_id",
                ),
                "pickup_location": self._required_positive_int(
                    pickup_location_id,
                    "pickup_location_id",
                ),
                "service_date": self._required_string(
                    service_date,
                    "service_date",
                ),
            },
        )

    def resolve_pickup(
        self,
        *,
        product_id: int,
        pickup_location_id: int,
        service_date: str,
    ) -> dict[str, Any]:
        """
        Resolve a pickup schedule from the existing schedule-list API.

        This mirrors the working manual seller booking page:

        1. Load the active pickup schedules.
        2. Keep schedules for the selected product and pickup location.
        3. Prefer an exact ``specific_date`` match.
        4. Otherwise use the matching Python ``day_of_week`` value.
        5. Otherwise use the default schedule with no date or weekday.

        The method deliberately avoids depending on the optional
        ``pickup-schedules/resolve/`` endpoints, which may not be registered.
        """

        trusted_product_id = self._required_positive_int(
            product_id,
            "product_id",
        )
        trusted_location_id = self._required_positive_int(
            pickup_location_id,
            "pickup_location_id",
        )
        clean_service_date = self._required_string(
            service_date,
            "service_date",
        )

        try:
            parsed_service_date = date.fromisoformat(clean_service_date)
        except ValueError as exc:
            raise ValueError(
                "service_date must be in YYYY-MM-DD format."
            ) from exc

        schedules = self.get_pickup_schedules()

        matching_schedules = [
            schedule
            for schedule in schedules
            if self._schedule_is_active(schedule)
            and self._schedule_product_id(schedule) == trusted_product_id
            and self._schedule_pickup_location_id(schedule)
            == trusted_location_id
        ]

        selected_schedule = next(
            (
                schedule
                for schedule in matching_schedules
                if self._normalise_optional_date(
                    schedule.get("specific_date")
                )
                == clean_service_date
            ),
            None,
        )

        if selected_schedule is None:
            selected_schedule = next(
                (
                    schedule
                    for schedule in matching_schedules
                    if self._normalise_optional_date(
                        schedule.get("specific_date")
                    )
                    is None
                    and self._safe_int(schedule.get("day_of_week"))
                    == parsed_service_date.weekday()
                ),
                None,
            )

        if selected_schedule is None:
            selected_schedule = next(
                (
                    schedule
                    for schedule in matching_schedules
                    if self._normalise_optional_date(
                        schedule.get("specific_date")
                    )
                    is None
                    and self._optional_weekday(
                        schedule.get("day_of_week")
                    )
                    is None
                ),
                None,
            )

        if selected_schedule is None:
            return {
                "found": False,
                "product": trusted_product_id,
                "pickup_location": trusted_location_id,
                "service_date": clean_service_date,
                "message": (
                    "No pickup schedule found for this product, "
                    "date and location."
                ),
            }

        schedule = dict(selected_schedule)

        pickup_location = self._find_pickup_location(
            pickup_location_id=trusted_location_id,
        )

        resolved_pickup_point = str(
            schedule.get("resolved_pickup_point")
            or schedule.get("pickup_point")
            or pickup_location.get("default_pickup_point")
            or ""
        ).strip()

        instructions = str(
            schedule.get("instructions")
            or pickup_location.get("default_instructions")
            or ""
        ).strip()

        schedule.update(
            {
                "product": trusted_product_id,
                "pickup_location": trusted_location_id,
                "pickup_location_name": str(
                    schedule.get("pickup_location_name")
                    or pickup_location.get("name")
                    or ""
                ).strip(),
                "resolved_pickup_point": resolved_pickup_point,
                "instructions": instructions,
            }
        )

        return {
            "found": True,
            "schedule": schedule,
        }

    def _find_pickup_location(
        self,
        *,
        pickup_location_id: int,
    ) -> dict[str, Any]:
        """
        Return trusted active pickup-location data when available.

        The schedule API normally already includes the resolved pickup point.
        Loading the location provides the same fallback used by the manual page
        for default pickup points and instructions.
        """

        for location in self.get_pickup_locations(is_active=True):
            if self._safe_int(location.get("id")) == pickup_location_id:
                return location

        return {}

    @classmethod
    def _schedule_product_id(
        cls,
        schedule: Mapping[str, Any],
    ) -> int | None:
        return cls._related_object_id(
            schedule.get("product")
            or schedule.get("product_id")
            or schedule.get("productId")
        )

    @classmethod
    def _schedule_pickup_location_id(
        cls,
        schedule: Mapping[str, Any],
    ) -> int | None:
        return cls._related_object_id(
            schedule.get("pickup_location")
            or schedule.get("pickup_location_id")
            or schedule.get("location")
        )

    @classmethod
    def _related_object_id(cls, value: Any) -> int | None:
        if isinstance(value, Mapping):
            return cls._safe_int(value.get("id") or value.get("pk"))

        return cls._safe_int(value)

    @staticmethod
    def _schedule_is_active(
        schedule: Mapping[str, Any],
    ) -> bool:
        value = schedule.get("is_active", True)

        if isinstance(value, str):
            return value.strip().lower() not in {
                "false",
                "0",
                "no",
                "off",
            }

        return value is not False

    @staticmethod
    def _normalise_optional_date(value: Any) -> str | None:
        clean_value = str(value or "").strip()
        if not clean_value:
            return None

        try:
            return date.fromisoformat(clean_value).isoformat()
        except ValueError:
            return clean_value

    @staticmethod
    def _optional_weekday(value: Any) -> int | None:
        if value in (None, ""):
            return None

        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None

        return parsed if 0 <= parsed <= 6 else None

    # ------------------------------------------------------------------
    # Seller bookings
    # ------------------------------------------------------------------

    def create_booking(
        self,
        payload: Mapping[str, Any],
    ) -> dict[str, Any]:
        """
        Create a booking through the existing seller booking serializer.
        """

        clean_payload = dict(payload or {})
        if not clean_payload:
            raise ValueError("Booking payload is required.")

        response = self._post(
            "/ticketing/seller/bookings/",
            json=clean_payload,
        )

        if not isinstance(response, dict):
            raise SellerApiError(
                "The booking API returned an invalid response.",
                response_data=response,
                method="POST",
                endpoint="/ticketing/seller/bookings/",
            )

        return response

    def add_payment(
        self,
        *,
        booking_id: int,
        payload: Mapping[str, Any],
    ) -> dict[str, Any]:
        """
        Add a payment through the existing seller payment endpoint.
        """

        trusted_booking_id = self._required_positive_int(
            booking_id,
            "booking_id",
        )
        clean_payload = dict(payload or {})

        if not clean_payload:
            raise ValueError("Payment payload is required.")

        return self._post(
            (
                f"/ticketing/seller/bookings/"
                f"{trusted_booking_id}/add-payment/"
            ),
            json=clean_payload,
        )

    def mark_ticket_generated(
        self,
        *,
        booking_id: int,
    ) -> dict[str, Any]:
        trusted_booking_id = self._required_positive_int(
            booking_id,
            "booking_id",
        )

        return self._post(
            (
                f"/ticketing/seller/bookings/"
                f"{trusted_booking_id}/mark-ticket-generated/"
            ),
            json={},
        )

    def cancel_booking(
        self,
        *,
        booking_id: int,
        reason: str = "",
    ) -> dict[str, Any]:
        trusted_booking_id = self._required_positive_int(
            booking_id,
            "booking_id",
        )

        return self._post(
            f"/ticketing/seller/bookings/{trusted_booking_id}/cancel/",
            json={"reason": str(reason or "").strip()},
        )

    # ------------------------------------------------------------------
    # HTTP helpers
    # ------------------------------------------------------------------

    def _get(
        self,
        endpoint: str,
        *,
        params: Mapping[str, Any] | None = None,
        include_organisation_params: bool = True,
    ) -> Any:
        return self._request(
            "GET",
            endpoint,
            params=params,
            include_organisation_params=include_organisation_params,
        )

    def _post(
        self,
        endpoint: str,
        *,
        json: Mapping[str, Any] | None = None,
        params: Mapping[str, Any] | None = None,
        include_organisation_params: bool = True,
    ) -> Any:
        return self._request(
            "POST",
            endpoint,
            params=params,
            json=json,
            include_organisation_params=include_organisation_params,
        )

    def _request(
        self,
        method: str,
        endpoint: str,
        *,
        params: Mapping[str, Any] | None = None,
        json: Mapping[str, Any] | None = None,
        include_organisation_params: bool = True,
    ) -> Any:
        clean_endpoint = f"/{str(endpoint or '').lstrip('/')}"
        url = urljoin(
            self.base_url,
            clean_endpoint.lstrip("/"),
        )

        request_params = self._clean_mapping(params or {})

        if include_organisation_params:
            request_params.update(
                {
                    "slug": self.organisation_slug,
                    "organisation_slug": self.organisation_slug,
                }
            )

        try:
            response = self.session.request(
                method=method.upper(),
                url=url,
                params=request_params,
                json=dict(json) if json is not None else None,
                headers=self._build_headers(),
                cookies=self._build_cookies(),
                timeout=self.timeout,
            )
        except requests.Timeout as exc:
            raise SellerApiError(
                "The Ticketing API request timed out.",
                method=method.upper(),
                endpoint=clean_endpoint,
            ) from exc
        except requests.RequestException as exc:
            logger.exception(
                "Could not connect to the Ticketing API.",
                extra={
                    "method": method.upper(),
                    "endpoint": clean_endpoint,
                    "organisation_slug": self.organisation_slug,
                },
            )
            raise SellerApiError(
                "Could not connect to the Ticketing API.",
                method=method.upper(),
                endpoint=clean_endpoint,
            ) from exc

        response_data = self._decode_response(response)

        if not response.ok:
            message = self._extract_error_message(
                response_data,
                fallback=(
                    f"Ticketing API request failed "
                    f"with status {response.status_code}."
                ),
            )

            raise SellerApiError(
                message,
                status_code=response.status_code,
                response_data=response_data,
                method=method.upper(),
                endpoint=clean_endpoint,
            )

        return response_data

    def _build_headers(self) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Organisation-Slug": self.organisation_slug,
            **self.extra_headers,
        }

        if self.credentials.access_token:
            token = self.credentials.access_token

            if not token.lower().startswith(
                ("bearer ", "token ")
            ):
                token = f"Bearer {token}"

            headers["Authorization"] = token

        if self.credentials.csrf_token:
            headers["X-CSRFToken"] = self.credentials.csrf_token

        return headers

    def _build_cookies(self) -> dict[str, str]:
        cookies: dict[str, str] = {}

        if self.credentials.session_cookie:
            session_cookie_name = getattr(
                settings,
                "SESSION_COOKIE_NAME",
                "sessionid",
            )
            cookies[session_cookie_name] = (
                self.credentials.session_cookie
            )

        if self.credentials.csrf_token:
            csrf_cookie_name = getattr(
                settings,
                "CSRF_COOKIE_NAME",
                "csrftoken",
            )
            cookies[csrf_cookie_name] = self.credentials.csrf_token

        return cookies

    @staticmethod
    def _decode_response(response: requests.Response) -> Any:
        if response.status_code == 204 or not response.content:
            return {}

        content_type = str(
            response.headers.get("Content-Type", "")
        ).lower()

        if "application/json" in content_type:
            try:
                return response.json()
            except ValueError:
                return {
                    "detail": "The API returned invalid JSON.",
                    "raw_response": response.text[:1000],
                }

        try:
            return response.json()
        except ValueError:
            return response.text

    @classmethod
    def _extract_error_message(
        cls,
        response_data: Any,
        *,
        fallback: str,
    ) -> str:
        if isinstance(response_data, str):
            return response_data.strip() or fallback

        if not isinstance(response_data, dict):
            return fallback

        for key in ("detail", "message", "error"):
            value = response_data.get(key)
            if value:
                return cls._stringify_error_value(value)

        for key, value in response_data.items():
            if value in (None, "", [], {}):
                continue

            readable_value = cls._stringify_error_value(value)
            return f"{key}: {readable_value}"

        return fallback

    @classmethod
    def _stringify_error_value(cls, value: Any) -> str:
        if isinstance(value, list):
            return ", ".join(
                cls._stringify_error_value(item)
                for item in value
            )

        if isinstance(value, dict):
            parts = [
                f"{key}: {cls._stringify_error_value(item)}"
                for key, item in value.items()
            ]
            return "; ".join(parts)

        return str(value)

    @staticmethod
    def _normalise_list(response_data: Any) -> list[dict[str, Any]]:
        if isinstance(response_data, list):
            return [
                item
                for item in response_data
                if isinstance(item, dict)
            ]

        if isinstance(response_data, dict):
            results = response_data.get("results")

            if isinstance(results, list):
                return [
                    item
                    for item in results
                    if isinstance(item, dict)
                ]

        return []

    @staticmethod
    def _clean_mapping(
        values: Mapping[str, Any],
    ) -> dict[str, Any]:
        return {
            str(key): value
            for key, value in values.items()
            if value is not None and value != ""
        }

    @staticmethod
    def _required_positive_int(
        value: Any,
        field_name: str,
    ) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"{field_name} must be a valid integer."
            ) from exc

        if parsed <= 0:
            raise ValueError(
                f"{field_name} must be greater than zero."
            )

        return parsed

    @staticmethod
    def _safe_int(value: Any) -> int | None:
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _required_string(
        value: Any,
        field_name: str,
    ) -> str:
        clean_value = str(value or "").strip()

        if not clean_value:
            raise ValueError(f"{field_name} is required.")

        return clean_value

    @staticmethod
    def _normalise_base_url(value: str) -> str:
        clean_value = str(value or "").strip()

        if not clean_value:
            raise ValueError(
                "The Ticketing API base URL is not configured."
            )

        return f"{clean_value.rstrip('/')}/"

    @staticmethod
    def _get_configured_base_url() -> str:
        configured_url = str(
            getattr(settings, "TICKETING_INTERNAL_API_URL", "")
            or getattr(settings, "BACKEND_API_URL", "")
            or getattr(settings, "API_BASE_URL", "")
            or ""
        ).strip()

        if configured_url:
            return configured_url

        allowed_hosts = getattr(settings, "ALLOWED_HOSTS", [])
        development_hosts = {
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "testserver",
        }

        if settings.DEBUG or development_hosts.intersection(
            set(allowed_hosts)
        ):
            return "http://127.0.0.1:8000/api/"

        raise ValueError(
            "Set TICKETING_INTERNAL_API_URL to the backend API root, "
            "for example: https://api.example.com/api/"
        )