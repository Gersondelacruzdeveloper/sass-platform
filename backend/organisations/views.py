from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Organisation, Membership
from .serializers import (
    OrganisationSerializer,
    MembershipSerializer,
)


class OrganisationViewSet(viewsets.ModelViewSet):
    queryset = Organisation.objects.all()
    serializer_class = OrganisationSerializer
    permission_classes = [IsAuthenticated]


class MembershipViewSet(viewsets.ModelViewSet):
    queryset = Membership.objects.all()
    serializer_class = MembershipSerializer
    permission_classes = [IsAuthenticated]