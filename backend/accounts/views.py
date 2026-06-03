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

        return Response({
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "is_platform_owner": user.is_superuser,
            "role": role,
            "organisation": organisation_data,
        })