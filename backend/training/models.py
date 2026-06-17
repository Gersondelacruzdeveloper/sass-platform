from django.db import models
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils import timezone
from datetime import timedelta

User = get_user_model()


class Outlet(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_outlets",
        null=True,
        blank=True,
    )

    name = models.CharField(max_length=150)
    area = models.CharField(max_length=150, blank=True)
    manager = models.CharField(max_length=150, blank=True)
    description = models.TextField(blank=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Standard(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_standards",
        null=True,
        blank=True,
    )

    CATEGORY_CHOICES = [
        ("service", "Service"),
        ("beverage", "Beverage"),
        ("culinary", "Culinary"),
        ("luxury", "Luxury"),
        ("leadership", "Leadership"),
        ("hard_rock", "Hard Rock Standard"),
    ]

    PRIORITY_CHOICES = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("critical", "Critical"),
    ]

    title = models.CharField(max_length=255)
    category = models.CharField(max_length=100, choices=CATEGORY_CHOICES)
    description = models.TextField(blank=True)
    priority = models.CharField(max_length=50, choices=PRIORITY_CHOICES, default="medium")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class Employee(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_employees",
        null=True,
        blank=True,
    )

    POTENTIAL_LEVELS = [
        ("low", "Low"),
        ("medium", "Medium"),
        ("high", "High"),
        ("future_leader", "Future Leader"),
    ]

    name = models.CharField(max_length=255)
    photo = models.ImageField(upload_to="employees/", blank=True, null=True)
    employee_code = models.CharField(max_length=100, blank=True)
    user = models.OneToOneField(
        User,
            on_delete=models.SET_NULL,
            null=True,
            blank=True,
            related_name="employee_profile",
        )
    
    department = models.CharField(max_length=150, default="A&B")
    outlet = models.ForeignKey(Outlet, on_delete=models.SET_NULL, null=True, blank=True)
    position = models.CharField(max_length=150)

    supervisor = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="team_members",
    )

    hire_date = models.DateField(null=True, blank=True)
    career_goal = models.CharField(max_length=255, blank=True)

    languages = models.JSONField(default=list, blank=True)
    strengths = models.JSONField(default=list, blank=True)
    weaknesses = models.JSONField(default=list, blank=True)

    service_score = models.FloatField(default=0)
    leadership_score = models.FloatField(default=0)
    attitude_score = models.FloatField(default=0)
    upselling_score = models.FloatField(default=0)
    hard_rock_standard_score = models.FloatField(default=0)

    potential_level = models.CharField(max_length=50, choices=POTENTIAL_LEVELS, default="medium")
    promotion_ready = models.BooleanField(default=False)
    active = models.BooleanField(default=True)

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def total_score(self):
        scores = [
            self.service_score,
            self.leadership_score,
            self.attitude_score,
            self.upselling_score,
            self.hard_rock_standard_score,
        ]
        return round(sum(scores) / len(scores), 2)

    def __str__(self):
        return self.name


class Facilitator(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_facilitators",
        null=True,
        blank=True,
    )

    employee = models.OneToOneField(
        Employee,
        on_delete=models.CASCADE,
        related_name="facilitator_profile",
    )
 
    assigned_employees = models.ManyToManyField(
        Employee,
        related_name="assigned_to_facilitators",
        blank=True,
    )
    assigned_outlets = models.ManyToManyField(
        Outlet,
        related_name="assigned_facilitators",
        blank=True,
    )

    specialties = models.JSONField(default=list, blank=True)
    can_create_employees = models.BooleanField(default=True)
    can_create_trainings = models.BooleanField(default=True)
    can_create_evaluations = models.BooleanField(default=True)
    can_view_reports = models.BooleanField(default=False)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.employee.name


class TrainingSession(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_sessions",
        null=True,
        blank=True,
    )

    STATUS_CHOICES = [
        ("scheduled", "Scheduled"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    title = models.CharField(max_length=255)
    topic = models.CharField(max_length=255)
    description = models.TextField(blank=True)

    facilitator = models.ForeignKey(Facilitator, on_delete=models.SET_NULL, null=True, blank=True)
    outlet = models.ForeignKey(Outlet, on_delete=models.SET_NULL, null=True, blank=True)

    start_datetime = models.DateTimeField()
    end_datetime = models.DateTimeField()

    expected_attendees = models.IntegerField(default=0)
    attendance_percentage = models.FloatField(default=0)

    attendees = models.ManyToManyField(Employee, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="scheduled")

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class Evaluation(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_evaluations",
        null=True,
        blank=True,
    )

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name="evaluations")
    evaluator = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

    standard = models.ForeignKey(
        Standard,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    smile = models.IntegerField(default=0)
    eye_contact = models.IntegerField(default=0)
    speed_of_service = models.IntegerField(default=0)
    product_knowledge = models.IntegerField(default=0)
    attitude = models.IntegerField(default=0)
    upselling = models.IntegerField(default=0)
    hard_rock_standards = models.IntegerField(default=0)

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def final_score(self):
        scores = [
            self.smile,
            self.eye_contact,
            self.speed_of_service,
            self.product_knowledge,
            self.attitude,
            self.upselling,
            self.hard_rock_standards,
        ]
        return round(sum(scores) / len(scores), 2)

    def __str__(self):
        return f"{self.employee.name} - {self.final_score}"


class RoadmapItem(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_roadmap_items",
        null=True,
        blank=True,
    )

    PERIOD_CHOICES = [
        ("30_days", "30 Days"),
        ("60_days", "60 Days"),
        ("90_days", "90 Days"),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    period = models.CharField(max_length=50, choices=PERIOD_CHOICES)
    priority = models.CharField(max_length=50, default="medium")
    completed = models.BooleanField(default=False)

    owner = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    def __str__(self):
        return self.title


class GuestFeedback(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_guest_feedback",
        null=True,
        blank=True,
    )

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
        related_name="guest_feedback",
    )
    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.CASCADE,
        related_name="guest_feedback",
    )

    rating = models.IntegerField(default=0)
    comment = models.TextField(blank=True)

    source = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.employee.name} - {self.rating}"


class EvaluationTemplate(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_evaluation_templates",
        null=True,
        blank=True,
    )

    name = models.CharField(max_length=255)

    description = models.TextField(blank=True)

    outlet = models.ForeignKey(
        Outlet,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class EvaluationQuestion(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_evaluation_questions",
        null=True,
        blank=True,
    )

    SCORE_TYPES = [
        ("score", "Score"),
        ("yes_no", "Yes / No"),
        ("text", "Text"),
    ]

    template = models.ForeignKey(
        EvaluationTemplate,
        on_delete=models.CASCADE,
        related_name="questions",
    )

    standard = models.ForeignKey(
        Standard,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    question = models.CharField(max_length=255)

    score_type = models.CharField(
        max_length=20,
        choices=SCORE_TYPES,
        default="score",
    )

    weight = models.IntegerField(default=1)

    order = models.IntegerField(default=0)

    def __str__(self):
        return self.question


class EmployeeEvaluation(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_employee_evaluations",
        null=True,
        blank=True,
    )

    employee = models.ForeignKey(
        Employee,
        on_delete=models.CASCADE,
    )

    template = models.ForeignKey(
        EvaluationTemplate,
        on_delete=models.CASCADE,
    )

    evaluator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
    )

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.employee.name}"


class EvaluationAnswer(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_evaluation_answers",
        null=True,
        blank=True,
    )

    evaluation = models.ForeignKey(
        EmployeeEvaluation,
        on_delete=models.CASCADE,
        related_name="answers",
    )

    question = models.ForeignKey(
        EvaluationQuestion,
        on_delete=models.CASCADE,
    )

    score = models.FloatField(default=0)

    text_answer = models.TextField(blank=True)

    yes_no_answer = models.BooleanField(
        null=True,
        blank=True,
    )



#------------------------------------------------------------TrainingResource
class TrainingResource(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="training_resources",
        null=True,
        blank=True,
    )

    RESOURCE_TYPES = [
        ("visual_poster", "Visual Poster"),
        ("microlearning", "Microlearning"),
        ("checklist", "Checklist"),
        ("facilitator_guide", "Facilitator Guide"),
    ]

    title = models.CharField(max_length=255)

    standard = models.ForeignKey(
        "Standard",
        on_delete=models.CASCADE,
        related_name="resources",
        null=True,
        blank=True,
    )

    resource_type = models.CharField(
        max_length=50,
        choices=RESOURCE_TYPES,
        default="visual_poster",
    )

    incorrect_image = models.ImageField(
        upload_to="training/resources/incorrect/",
        null=True,
        blank=True,
    )

    correct_image = models.ImageField(
        upload_to="training/resources/correct/",
        null=True,
        blank=True,
    )

    short_explanation = models.TextField(blank=True)
    facilitator_notes = models.TextField(blank=True)
    estimated_minutes = models.PositiveIntegerField(default=5)

    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class StandardRecoveryPlan(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="standard_recovery_plans",
        null=True,
        blank=True,
    )

    standard = models.OneToOneField(
        "Standard",
        on_delete=models.CASCADE,
        related_name="recovery_plan",
    )

    resource = models.ForeignKey(
        TrainingResource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recovery_plans",
    )

    trigger_fail_count = models.PositiveIntegerField(default=1)
    reevaluation_after_days = models.PositiveIntegerField(default=3)

    instructions = models.TextField(blank=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"Recovery Plan - {self.standard.title}"
class EmployeeAssignedTraining(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="employee_assigned_trainings",
        null=True,
        blank=True,
    )

    STATUS_CHOICES = [
        ("assigned", "Assigned"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("reevaluation_pending", "Re-evaluation Pending"),
        ("closed", "Closed"),
    ]

    employee = models.ForeignKey(
        "Employee",
        on_delete=models.CASCADE,
        related_name="assigned_trainings",
    )

    standard = models.ForeignKey(
        "Standard",
        on_delete=models.CASCADE,
        related_name="assigned_trainings",
    )

    resource = models.ForeignKey(
        TrainingResource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_trainings",
    )

    assigned_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_training_resources",
    )

    reason = models.TextField(blank=True)

    status = models.CharField(
        max_length=50,
        choices=STATUS_CHOICES,
        default="assigned",
    )

    assigned_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    reevaluation_due_date = models.DateField(null=True, blank=True)
    reevaluated_at = models.DateTimeField(null=True, blank=True)

    supervisor_notes = models.TextField(blank=True)

    def mark_completed(self):
        self.status = "reevaluation_pending"
        self.completed_at = timezone.now()

        if not self.reevaluation_due_date:
            self.reevaluation_due_date = timezone.now().date() + timedelta(days=3)

        self.save()

    def close_training(self):
        self.status = "closed"
        self.reevaluated_at = timezone.now()
        self.save()

    def __str__(self):
        return f"{self.employee.name} - {self.standard.title} - {self.status}"