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
from .serializers import RegisterSerializer

User = get_user_model()


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

        login(request, user)
        request.session.save()
        return Response({
            "detail": "Login successful",
            "user": {
                "id": user.id,
                "email": user.email,
                "username": user.username,
            }
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

        membership = (
            user.memberships
            .filter(is_active=True, organisation__is_active=True)
            .select_related("organisation")
            .first()
        )

        organisation_data = None
        role = None

        if membership:
            organisation_data = {
                "id": membership.organisation.id,
                "name": membership.organisation.name,
                "slug": membership.organisation.slug,
                "business_type": membership.organisation.business_type,
                "plan": membership.organisation.plan,
            }

            role = membership.role

        facilitator_data = None

        if hasattr(user, "employee_profile"):
            employee = user.employee_profile

            if hasattr(employee, "facilitator_profile"):
                facilitator = employee.facilitator_profile

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

        disco_profile = (
            user.disco_employee_profiles
            .filter(is_active=True)
            .select_related("organisation")
            .first()
        )

        if disco_profile:
            disco_employee_data = {
                "id": disco_profile.id,
                "full_name": disco_profile.full_name,
                "role": disco_profile.role,
                "organisation_id": disco_profile.organisation.id,
                "organisation_slug": disco_profile.organisation.slug,
                "organisation_name": disco_profile.organisation.name,
            }

        return Response({
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "is_platform_owner": user.is_superuser,
            "role": role,
            "organisation": organisation_data,
            "facilitator": facilitator_data,
            "disco_employee": disco_employee_data,
        })