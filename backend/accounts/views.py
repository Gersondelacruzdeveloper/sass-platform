from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status


from django.contrib.auth import authenticate, login, logout
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

from .models import CustomUser
from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()


def get_active_membership(user):
    return (
        user.memberships
        .filter(
            is_active=True,
            organisation__is_active=True,
        )
        .select_related("organisation")
        .first()
    )


def has_valid_tenant_access(user):
    if user.is_superuser:
        return True

    memberships = user.memberships.all()

    if not memberships.exists():
        return True

    return memberships.filter(
        is_active=True,
        organisation__is_active=True,
    ).exists()


def build_file_url(request, file_field):
    if not file_field:
        return None

    try:
        url = file_field.url
    except Exception:
        return None

    return request.build_absolute_uri(url)


def build_current_user_payload(user, request):
    membership = get_active_membership(user)

    organisation_data = None
    role = None

    if membership:
        organisation = membership.organisation

        organisation_data = {
            "id": organisation.id,
            "name": organisation.name,
            "slug": organisation.slug,
            "business_type": organisation.business_type,
            "plan": organisation.plan,
            "is_active": organisation.is_active,
        }

        role = membership.role

    facilitator_data = None

    if membership and hasattr(user, "employee_profile"):
        employee = user.employee_profile

        if (
            employee.organisation_id == membership.organisation_id
            and hasattr(employee, "facilitator_profile")
        ):
            facilitator = employee.facilitator_profile

            if facilitator.organisation_id in (
                None,
                membership.organisation_id,
            ):
                facilitator_data = {
                    "id": facilitator.id,
                    "employee_id": employee.id,
                    "employee_name": employee.name,
                    "active": facilitator.active,
                    "can_create_employees": facilitator.can_create_employees,
                    "can_create_trainings": facilitator.can_create_trainings,
                    "can_create_evaluations": facilitator.can_create_evaluations,
                    "can_view_reports": facilitator.can_view_reports,
                }

    disco_employee_data = None

    disco_profile = None

    if membership:
        disco_profile = (
            user.disco_employee_profiles
            .filter(
                is_active=True,
                organisation_id=membership.organisation_id,
                organisation__is_active=True,
            )
            .select_related("organisation")
            .first()
        )

    user_avatar_url = build_file_url(request, user.avatar)

    if disco_profile:
        employee_photo_url = build_file_url(request, disco_profile.photo)

        profile_image_url = user_avatar_url or employee_photo_url

        disco_employee_data = {
            "id": disco_profile.id,
            "full_name": disco_profile.full_name,
            "role": disco_profile.role,
            "phone": disco_profile.phone,
            "organisation_id": disco_profile.organisation.id,
            "organisation_slug": disco_profile.organisation.slug,
            "organisation_name": disco_profile.organisation.name,
            "organisation_is_active": disco_profile.organisation.is_active,

            # Image fields for frontend
            "photo": employee_photo_url,
            "photo_url": employee_photo_url,
            "employee_photo_url": employee_photo_url,
            "user_avatar_url": user_avatar_url,
            "profile_image_url": profile_image_url,
        }

    profile_image_url = user_avatar_url

    if disco_employee_data and disco_employee_data.get("profile_image_url"):
        profile_image_url = disco_employee_data["profile_image_url"]

    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone": user.phone,
        "preferred_language": user.preferred_language,
        "avatar": user_avatar_url,
        "avatar_url": user_avatar_url,
        "user_avatar_url": user_avatar_url,
        "profile_image_url": profile_image_url,
        "is_platform_owner": user.is_superuser,
        "role": role,
        "organisation": organisation_data,
        "facilitator": facilitator_data,
        "disco_employee": disco_employee_data,
    }


class RegisterView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        login_value = request.data.get("login")
        password = request.data.get("password")

        user_obj = User.objects.filter(
            Q(email=login_value) |
            Q(username=login_value)
        ).first()

        if not user_obj:
            return Response(
                {"detail": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = authenticate(
            request,
            username=user_obj.username,
            password=password,
        )

        if not user:
            user = authenticate(
                request,
                username=user_obj.email,
                password=password,
            )

        if not user:
            return Response(
                {"detail": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not has_valid_tenant_access(user):
            return Response(
                {"detail": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        login(request, user)
        request.session.save()

        return Response({
            "detail": "Login successful",
            "user": build_current_user_payload(user, request),
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)

        return Response({
            "detail": "Logged out"
        })


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if not has_valid_tenant_access(user):
            return Response(
                {"detail": "Account unavailable"},
                status=status.HTTP_403_FORBIDDEN,
            )

        def build_file_url(file_field):
            if not file_field:
                return None

            try:
                url = file_field.url
            except Exception:
                return None

            return request.build_absolute_uri(url)

        user_avatar_url = build_file_url(user.avatar)

        membership = get_active_membership(user)

        organisation_data = None
        role = None

        if membership:
            organisation = membership.organisation

            organisation_data = {
                "id": organisation.id,
                "name": organisation.name,
                "slug": organisation.slug,
                "business_type": organisation.business_type,
                "plan": organisation.plan,
                "is_active": organisation.is_active,
            }

            role = membership.role

        facilitator_data = None

        if membership and hasattr(user, "employee_profile"):
            employee = user.employee_profile

            if (
                employee.organisation_id == membership.organisation_id
                and hasattr(employee, "facilitator_profile")
            ):
                facilitator = employee.facilitator_profile

                if facilitator.organisation_id in (
                    None,
                    membership.organisation_id,
                ):
                    facilitator_data = {
                        "id": facilitator.id,
                        "employee_id": employee.id,
                        "employee_name": employee.name,
                        "active": facilitator.active,
                        "can_create_employees": facilitator.can_create_employees,
                        "can_create_trainings": facilitator.can_create_trainings,
                        "can_create_evaluations": facilitator.can_create_evaluations,
                        "can_view_reports": facilitator.can_view_reports,
                    }

        disco_employee_data = None

        disco_profile = None

        if membership:
            disco_profile = (
                user.disco_employee_profiles
                .filter(
                    is_active=True,
                    organisation_id=membership.organisation_id,
                    organisation__is_active=True,
                )
                .select_related("organisation")
                .first()
            )

        disco_employee_photo_url = None

        if disco_profile:
            disco_employee_photo_url = build_file_url(disco_profile.photo)

            profile_image_url = user_avatar_url or disco_employee_photo_url

            disco_employee_data = {
                "id": disco_profile.id,
                "full_name": disco_profile.full_name,
                "role": disco_profile.role,
                "phone": disco_profile.phone,
                "organisation_id": disco_profile.organisation.id,
                "organisation_slug": disco_profile.organisation.slug,
                "organisation_name": disco_profile.organisation.name,
                "organisation_is_active": disco_profile.organisation.is_active,

                # Image fields
                "photo": disco_employee_photo_url,
                "photo_url": disco_employee_photo_url,
                "employee_photo_url": disco_employee_photo_url,
                "user_avatar_url": user_avatar_url,
                "profile_image_url": profile_image_url,
            }

        profile_image_url = user_avatar_url or disco_employee_photo_url

        return Response({
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone": user.phone,
            "preferred_language": user.preferred_language,

            # User image fields
            "avatar": user_avatar_url,
            "avatar_url": user_avatar_url,
            "user_avatar_url": user_avatar_url,
            "profile_image_url": profile_image_url,

            "is_platform_owner": user.is_superuser,
            "role": role,
            "organisation": organisation_data,
            "facilitator": facilitator_data,
            "disco_employee": disco_employee_data,
        })

    def patch(self, request):
        if not has_valid_tenant_access(request.user):
            return Response(
                {"detail": "Account unavailable"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = UserSerializer(
            request.user,
            data=request.data,
            partial=True,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(
            build_current_user_payload(request.user, request),
            status=status.HTTP_200_OK,
        )
