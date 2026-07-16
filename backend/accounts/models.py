from django.contrib.auth.models import AbstractUser
from django.db import models


class CustomUser(AbstractUser):
    ADMIN_LANGUAGE_CHOICES = (
        ("en", "English"),
        ("es", "Español"),
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )

    email = models.EmailField(unique=True)

    phone = models.CharField(
        max_length=30,
        blank=True,
        null=True,
    )

    avatar = models.ImageField(
        upload_to="avatars/",
        blank=True,
        null=True,
    )

    preferred_language = models.CharField(
        max_length=2,
        choices=ADMIN_LANGUAGE_CHOICES,
        default="en",
        help_text="Preferred language for the administration interface."
    )

    USERNAME_FIELD = "email"

    REQUIRED_FIELDS = ["username"]

    def __str__(self):
        return self.email
