from django.utils.text import slugify
from rest_framework import serializers

from organisations.models import Membership, Organisation

from .models import CustomUser


class RegisterSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(write_only=True)
    business_type = serializers.CharField(
        write_only=True,
        default="disco",
    )
    plan = serializers.CharField(
        write_only=True,
        default="basic",
    )
    password = serializers.CharField(
        write_only=True,
        min_length=8,
    )

    class Meta:
        model = CustomUser
        fields = [
            "id",
            "email",
            "username",
            "password",
            "organisation_name",
            "business_type",
            "plan",
        ]

    def create(self, validated_data):
        organisation_name = validated_data.pop(
            "organisation_name"
        )
        business_type = validated_data.pop(
            "business_type",
            "disco",
        )
        plan = validated_data.pop(
            "plan",
            "basic",
        )
        password = validated_data.pop("password")

        user = CustomUser(**validated_data)
        user.set_password(password)
        user.save()

        base_slug = slugify(organisation_name)
        slug = base_slug
        counter = 1

        while Organisation.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1

        organisation = Organisation.objects.create(
            name=organisation_name,
            slug=slug,
            business_type=business_type,
            plan=plan,
        )

        Membership.objects.create(
            user=user,
            organisation=organisation,
            role="owner",
        )

        return user


class UserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    profile_image_url = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = [
            "id",
            "email",
            "username",
            "first_name",
            "last_name",
            "phone",
            "avatar",
            "avatar_url",
            "profile_image_url",
            "preferred_language",
        ]
        read_only_fields = [
            "id",
            "email",
            "username",
            "avatar_url",
            "profile_image_url",
        ]

    def validate_preferred_language(self, value):
        supported_languages = {
            choice[0]
            for choice in CustomUser.ADMIN_LANGUAGE_CHOICES
        }

        if value not in supported_languages:
            raise serializers.ValidationError(
                "Unsupported administration language."
            )

        return value

    def get_avatar_url(self, obj):
        request = self.context.get("request")

        if obj.avatar:
            if request:
                return request.build_absolute_uri(obj.avatar.url)

            return obj.avatar.url

        return None

    def get_profile_image_url(self, obj):
        return self.get_avatar_url(obj)
