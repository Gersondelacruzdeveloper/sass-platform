from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from organisations.models import Membership, Organisation
from rest_framework import status
from rest_framework.test import APIClient

from training.models import (
    Employee,
    EmployeeAssignedTraining,
    EmployeeEvaluation,
    Evaluation,
    EvaluationAnswer,
    EvaluationQuestion,
    EvaluationTemplate,
    Facilitator,
    GuestFeedback,
    Outlet,
    Standard,
    StandardRecoveryPlan,
    TrainingResource,
    TrainingSession,
)
from training.serializers import EmployeeEvaluationSerializer

User = get_user_model()


class TrainingAPITestBase(TestCase):
    """Shared, realistic two-tenant training fixture."""

    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(
            name="Training Hotel A",
            slug="training-hotel-a",
            business_type="hotel",
            plan="pro",
            is_active=True,
        )
        cls.other_org = Organisation.objects.create(
            name="Training Hotel B",
            slug="training-hotel-b",
            business_type="hotel",
            plan="pro",
            is_active=True,
        )

        cls.manager = User.objects.create_user(
            username="training-manager",
            email="training-manager@example.com",
            password="Strong-test-password-123",
        )
        Membership.objects.create(
            user=cls.manager,
            organisation=cls.org,
            role="manager",
            is_active=True,
        )

        cls.staff_user = User.objects.create_user(
            username="training-staff",
            email="training-staff@example.com",
            password="Strong-test-password-123",
        )
        Membership.objects.create(
            user=cls.staff_user,
            organisation=cls.org,
            role="staff",
            is_active=True,
        )

        cls.other_manager = User.objects.create_user(
            username="other-training-manager",
            email="other-training-manager@example.com",
            password="Strong-test-password-123",
        )
        Membership.objects.create(
            user=cls.other_manager,
            organisation=cls.other_org,
            role="manager",
            is_active=True,
        )

        cls.outlet = Outlet.objects.create(
            organisation=cls.org,
            name="Toro",
            area="A&B",
            manager="Manager A",
        )
        cls.other_outlet = Outlet.objects.create(
            organisation=cls.other_org,
            name="Foreign Outlet",
            area="A&B",
            manager="Manager B",
        )

        cls.employee = Employee.objects.create(
            organisation=cls.org,
            name="Ana Collaborator",
            employee_code="A-001",
            outlet=cls.outlet,
            position="Server",
            service_score=8,
            leadership_score=7,
            attitude_score=9,
            upselling_score=6,
            hard_rock_standard_score=10,
        )
        cls.unassigned_employee = Employee.objects.create(
            organisation=cls.org,
            name="Luis Unassigned",
            employee_code="A-002",
            outlet=cls.outlet,
            position="Bartender",
        )
        cls.other_employee = Employee.objects.create(
            organisation=cls.other_org,
            name="Foreign Collaborator",
            employee_code="B-001",
            outlet=cls.other_outlet,
            position="Server",
        )

        cls.facilitator_user = User.objects.create_user(
            username="training-facilitator",
            email="training-facilitator@example.com",
            password="Strong-test-password-123",
        )
        Membership.objects.create(
            user=cls.facilitator_user,
            organisation=cls.org,
            role="facilitator",
            is_active=True,
        )
        cls.facilitator_employee = Employee.objects.create(
            organisation=cls.org,
            name="Facilitator One",
            employee_code="F-001",
            user=cls.facilitator_user,
            outlet=cls.outlet,
            position="A&B Facilitator",
        )
        cls.facilitator = Facilitator.objects.create(
            organisation=cls.org,
            employee=cls.facilitator_employee,
            can_create_employees=True,
            can_create_trainings=True,
            can_create_evaluations=True,
            can_view_reports=True,
        )
        cls.facilitator.assigned_employees.add(cls.employee)
        cls.facilitator.assigned_outlets.add(cls.outlet)

        cls.standard = Standard.objects.create(
            organisation=cls.org,
            title="Greeting Standard",
            category="service",
            description="Greet the guest correctly.",
            priority="high",
        )
        cls.second_standard = Standard.objects.create(
            organisation=cls.org,
            title="Upselling Standard",
            category="service",
            description="Offer an appropriate premium option.",
            priority="medium",
        )
        cls.other_standard = Standard.objects.create(
            organisation=cls.other_org,
            title="Foreign Standard",
            category="service",
            priority="high",
        )

        cls.template = EvaluationTemplate.objects.create(
            organisation=cls.org,
            name="Service Standards Template",
            outlet=cls.outlet,
            active=True,
        )
        cls.other_template_same_org = EvaluationTemplate.objects.create(
            organisation=cls.org,
            name="Different Local Template",
            outlet=cls.outlet,
            active=True,
        )
        cls.foreign_template = EvaluationTemplate.objects.create(
            organisation=cls.other_org,
            name="Foreign Template",
            outlet=cls.other_outlet,
            active=True,
        )

        cls.score_question = EvaluationQuestion.objects.create(
            organisation=cls.org,
            template=cls.template,
            standard=cls.standard,
            question="Was the greeting performed correctly?",
            score_type="score",
            weight=1,
            order=1,
        )
        cls.yes_no_question = EvaluationQuestion.objects.create(
            organisation=cls.org,
            template=cls.template,
            standard=cls.second_standard,
            question="Was a premium option offered?",
            score_type="yes_no",
            weight=2,
            order=2,
        )
        cls.wrong_template_question = EvaluationQuestion.objects.create(
            organisation=cls.org,
            template=cls.other_template_same_org,
            standard=cls.standard,
            question="Question from another template",
            score_type="score",
            weight=1,
            order=1,
        )
        cls.foreign_question = EvaluationQuestion.objects.create(
            organisation=cls.other_org,
            template=cls.foreign_template,
            standard=cls.other_standard,
            question="Foreign question",
            score_type="score",
            weight=1,
            order=1,
        )

        cls.resource = TrainingResource.objects.create(
            organisation=cls.org,
            title="Greeting Microtraining",
            standard=cls.standard,
            resource_type="microlearning",
            short_explanation="Review the greeting standard.",
            estimated_minutes=5,
        )
        cls.second_resource = TrainingResource.objects.create(
            organisation=cls.org,
            title="Upselling Microtraining",
            standard=cls.second_standard,
            resource_type="microlearning",
            short_explanation="Review the upselling standard.",
            estimated_minutes=5,
        )
        cls.other_resource = TrainingResource.objects.create(
            organisation=cls.other_org,
            title="Foreign Resource",
            standard=cls.other_standard,
            resource_type="microlearning",
        )

        cls.recovery_plan = StandardRecoveryPlan.objects.create(
            organisation=cls.org,
            standard=cls.standard,
            resource=cls.resource,
            trigger_fail_count=1,
            reevaluation_after_days=5,
            active=True,
        )
        cls.second_recovery_plan = StandardRecoveryPlan.objects.create(
            organisation=cls.org,
            standard=cls.second_standard,
            resource=cls.second_resource,
            trigger_fail_count=1,
            reevaluation_after_days=4,
            active=True,
        )

    def setUp(self):
        self.client = APIClient(raise_request_exception=False)

    def authenticate(self, user=None):
        self.client.force_authenticate(user or self.manager)

    def create_evaluation(self, employee=None, template=None, evaluator=None):
        return EmployeeEvaluation.objects.create(
            organisation=self.org,
            employee=employee or self.employee,
            template=template or self.template,
            evaluator=evaluator or self.manager,
        )


class TrainingModelAndScoringTests(TrainingAPITestBase):
    def test_employee_total_score_is_average_of_five_score_dimensions(self):
        self.assertEqual(self.employee.total_score, 8.0)

    def test_legacy_evaluation_final_score_is_average_of_seven_dimensions(self):
        evaluation = Evaluation.objects.create(
            organisation=self.org,
            employee=self.employee,
            evaluator=self.manager,
            standard=self.standard,
            smile=10,
            eye_contact=8,
            speed_of_service=6,
            product_knowledge=4,
            attitude=10,
            upselling=8,
            hard_rock_standards=10,
        )
        self.assertEqual(evaluation.final_score, 8.0)

    def test_template_final_score_honours_question_weights(self):
        weighted_question = EvaluationQuestion.objects.create(
            organisation=self.org,
            template=self.template,
            standard=self.second_standard,
            question="Heavily weighted service question",
            score_type="score",
            weight=3,
            order=3,
        )
        evaluation = self.create_evaluation()
        EvaluationAnswer.objects.create(
            organisation=self.org,
            evaluation=evaluation,
            question=self.score_question,
            score=10,
        )
        EvaluationAnswer.objects.create(
            organisation=self.org,
            evaluation=evaluation,
            question=weighted_question,
            score=2,
        )

        data = EmployeeEvaluationSerializer(evaluation).data

        self.assertEqual(data["final_score"], 40.0)

    def test_yes_no_question_contributes_to_weighted_score_as_ten_or_zero(self):
        evaluation = self.create_evaluation()
        EvaluationAnswer.objects.create(
            organisation=self.org,
            evaluation=evaluation,
            question=self.score_question,
            score=10,
        )
        EvaluationAnswer.objects.create(
            organisation=self.org,
            evaluation=evaluation,
            question=self.yes_no_question,
            score=0,
            yes_no_answer=False,
        )

        data = EmployeeEvaluationSerializer(evaluation).data

        # (10 * weight 1 + 0 * weight 2) / total weight 3
        self.assertEqual(data["final_score"], 33.33)

    def test_single_score_question_is_returned_as_percentage(self):
        evaluation = self.create_evaluation()
        EvaluationAnswer.objects.create(
            organisation=self.org,
            evaluation=evaluation,
            question=self.score_question,
            score=8,
        )

        data = EmployeeEvaluationSerializer(evaluation).data

        self.assertEqual(data["final_score"], 80.0)

    def test_membership_role_contract_includes_facilitator(self):
        role_field = Membership._meta.get_field("role")
        roles = {value for value, _label in role_field.choices}
        self.assertIn("facilitator", roles)


class TrainingAuthenticationAndTenantTests(TrainingAPITestBase):
    def test_training_endpoints_require_authentication(self):
        urls = [
            reverse("employee-list"),
            reverse("standard-list"),
            reverse("evaluation-template-list"),
            reverse("employee-evaluation-list"),
            reverse("assigned-training-list"),
            "/api/training/dashboard/",
            "/api/training/analytics/",
        ]

        for url in urls:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertIn(response.status_code, (401, 403))

    def test_user_without_active_membership_cannot_enter_training_tenant(self):
        user = User.objects.create_user(
            username="no-training-tenant",
            email="no-training-tenant@example.com",
            password="Strong-test-password-123",
        )
        self.authenticate(user)

        response = self.client.get(reverse("standard-list"))

        self.assertEqual(response.status_code, 403)

    def test_manager_employee_list_is_tenant_isolated(self):
        self.authenticate()

        response = self.client.get(reverse("employee-list"))

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data}
        self.assertIn(self.employee.id, ids)
        self.assertNotIn(self.other_employee.id, ids)

    def test_standard_list_is_tenant_isolated(self):
        self.authenticate()

        response = self.client.get(reverse("standard-list"))

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data}
        self.assertIn(self.standard.id, ids)
        self.assertNotIn(self.other_standard.id, ids)

    def test_foreign_training_object_detail_is_not_visible(self):
        self.authenticate()

        response = self.client.get(
            reverse("standard-detail", args=[self.other_standard.id])
        )

        self.assertEqual(response.status_code, 404)

    def test_patch_cannot_move_standard_to_another_organisation(self):
        self.authenticate()

        response = self.client.patch(
            reverse("standard-detail", args=[self.standard.id]),
            {"organisation": self.other_org.id},
            format="json",
        )

        self.standard.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.standard.organisation_id, self.org.id)

    def test_question_cannot_reference_foreign_template_or_standard(self):
        self.authenticate()

        response = self.client.post(
            reverse("evaluation-question-list"),
            {
                "template": self.foreign_template.id,
                "standard": self.other_standard.id,
                "question": "Cross-tenant question",
                "score_type": "score",
                "weight": 1,
                "order": 99,
            },
            format="json",
        )

        self.assertIn(response.status_code, (400, 403, 404))
        self.assertFalse(
            EvaluationQuestion.objects.filter(question="Cross-tenant question").exists()
        )

    def test_employee_evaluation_cannot_reference_foreign_employee_or_template(self):
        self.authenticate()

        response = self.client.post(
            reverse("employee-evaluation-list"),
            {
                "employee": self.other_employee.id,
                "template": self.foreign_template.id,
                "notes": "Must be rejected",
            },
            format="json",
        )

        self.assertIn(response.status_code, (400, 403, 404))
        self.assertFalse(
            EmployeeEvaluation.objects.filter(
                organisation=self.org,
                employee=self.other_employee,
            ).exists()
        )

    def test_evaluation_answer_cannot_reference_foreign_evaluation_or_question(self):
        foreign_evaluation = EmployeeEvaluation.objects.create(
            organisation=self.other_org,
            employee=self.other_employee,
            template=self.foreign_template,
            evaluator=self.other_manager,
        )
        self.authenticate()

        response = self.client.post(
            reverse("evaluation-answer-list"),
            {
                "evaluation": foreign_evaluation.id,
                "question": self.foreign_question.id,
                "score": 1,
            },
            format="json",
        )

        self.assertIn(response.status_code, (400, 403, 404))
        self.assertFalse(
            EvaluationAnswer.objects.filter(
                organisation=self.org,
                evaluation=foreign_evaluation,
            ).exists()
        )

    def test_training_resource_cannot_reference_foreign_standard(self):
        self.authenticate()

        response = self.client.post(
            reverse("training-resource-list"),
            {
                "title": "Cross Tenant Resource",
                "standard": self.other_standard.id,
                "resource_type": "microlearning",
                "short_explanation": "Should not be created",
                "estimated_minutes": 5,
                "active": True,
            },
            format="json",
        )

        self.assertIn(response.status_code, (400, 403, 404))
        self.assertFalse(
            TrainingResource.objects.filter(title="Cross Tenant Resource").exists()
        )

    def test_recovery_plan_cannot_mix_tenants(self):
        # Use a foreign standard without a plan so OneToOne uniqueness does not
        # mask the tenant-boundary assertion.
        foreign_standard = Standard.objects.create(
            organisation=self.other_org,
            title="Foreign Standard Without Plan",
            category="service",
        )
        self.authenticate()

        response = self.client.post(
            reverse("standard-recovery-plan-list"),
            {
                "standard": foreign_standard.id,
                "resource": self.resource.id,
                "trigger_fail_count": 1,
                "reevaluation_after_days": 3,
                "instructions": "Should not cross tenants",
                "active": True,
            },
            format="json",
        )

        self.assertIn(response.status_code, (400, 403, 404))
        self.assertFalse(
            StandardRecoveryPlan.objects.filter(
                organisation=self.org,
                standard=foreign_standard,
            ).exists()
        )

    def test_assigned_training_cannot_reference_foreign_employee_or_standard(self):
        self.authenticate()

        response = self.client.post(
            reverse("assigned-training-list"),
            {
                "employee": self.other_employee.id,
                "standard": self.other_standard.id,
                "resource": self.other_resource.id,
                "reason": "Cross tenant assignment",
                "status": "assigned",
            },
            format="json",
        )

        self.assertIn(response.status_code, (400, 403, 404))
        self.assertFalse(
            EmployeeAssignedTraining.objects.filter(
                organisation=self.org,
                employee=self.other_employee,
            ).exists()
        )

    def test_training_session_cannot_reference_foreign_outlet_or_attendee(self):
        self.authenticate()
        start = timezone.now() + timedelta(days=1)

        response = self.client.post(
            reverse("training-session-list"),
            {
                "title": "Cross Tenant Session",
                "topic": "Security",
                "outlet": self.other_outlet.id,
                "start_datetime": start.isoformat(),
                "end_datetime": (start + timedelta(hours=1)).isoformat(),
                "attendees": [self.other_employee.id],
                "status": "scheduled",
            },
            format="json",
        )

        self.assertIn(response.status_code, (400, 403, 404))
        self.assertFalse(
            TrainingSession.objects.filter(title="Cross Tenant Session").exists()
        )

    def test_guest_feedback_cannot_mix_employee_and_outlet_from_other_tenant(self):
        self.authenticate()

        response = self.client.post(
            reverse("guest-feedback-list"),
            {
                "employee": self.other_employee.id,
                "outlet": self.other_outlet.id,
                "rating": 5,
                "comment": "Cross tenant feedback",
            },
            format="json",
        )

        self.assertIn(response.status_code, (400, 403, 404))
        self.assertFalse(
            GuestFeedback.objects.filter(comment="Cross tenant feedback").exists()
        )


class TrainingRoleAndFacilitatorPermissionTests(TrainingAPITestBase):
    def test_facilitator_sees_only_assigned_employees(self):
        self.authenticate(self.facilitator_user)

        response = self.client.get(reverse("employee-list"))

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data}
        self.assertEqual(ids, {self.employee.id})

    def test_facilitator_assigned_training_queue_only_contains_assigned_employees(self):
        visible = EmployeeAssignedTraining.objects.create(
            organisation=self.org,
            employee=self.employee,
            standard=self.standard,
            resource=self.resource,
            assigned_by=self.manager,
            status="assigned",
        )
        hidden = EmployeeAssignedTraining.objects.create(
            organisation=self.org,
            employee=self.unassigned_employee,
            standard=self.second_standard,
            resource=self.second_resource,
            assigned_by=self.manager,
            status="assigned",
        )
        self.authenticate(self.facilitator_user)

        response = self.client.get(reverse("assigned-training-list"))

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data}
        self.assertIn(visible.id, ids)
        self.assertNotIn(hidden.id, ids)

    def test_facilitator_cannot_change_training_for_unassigned_employee(self):
        assigned = EmployeeAssignedTraining.objects.create(
            organisation=self.org,
            employee=self.unassigned_employee,
            standard=self.second_standard,
            resource=self.second_resource,
            assigned_by=self.manager,
            status="assigned",
        )
        self.authenticate(self.facilitator_user)

        response = self.client.post(
            reverse("assigned-training-mark-completed", args=[assigned.id]),
            {},
            format="json",
        )

        self.assertIn(response.status_code, (403, 404))
        assigned.refresh_from_db()
        self.assertEqual(assigned.status, "assigned")

    def test_facilitator_cannot_delete_employee(self):
        self.authenticate(self.facilitator_user)

        response = self.client.delete(
            reverse("employee-detail", args=[self.employee.id])
        )

        self.assertEqual(response.status_code, 403)
        self.assertTrue(Employee.objects.filter(pk=self.employee.pk).exists())

    def test_facilitator_cannot_evaluate_unassigned_employee(self):
        self.authenticate(self.facilitator_user)

        response = self.client.post(
            reverse("employee-evaluation-list"),
            {
                "employee": self.unassigned_employee.id,
                "template": self.template.id,
                "notes": "Should be blocked",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            EmployeeEvaluation.objects.filter(
                employee=self.unassigned_employee,
                evaluator=self.facilitator_user,
            ).exists()
        )

    def test_facilitator_can_create_evaluation_for_assigned_employee(self):
        self.authenticate(self.facilitator_user)

        response = self.client.post(
            reverse("employee-evaluation-list"),
            {
                "employee": self.employee.id,
                "template": self.template.id,
                "notes": "Allowed evaluation",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        evaluation = EmployeeEvaluation.objects.get(pk=response.data["id"])
        self.assertEqual(evaluation.evaluator_id, self.facilitator_user.id)
        self.assertEqual(evaluation.organisation_id, self.org.id)

    def test_facilitator_can_create_evaluations_flag_is_enforced(self):
        self.facilitator.can_create_evaluations = False
        self.facilitator.save(update_fields=["can_create_evaluations"])
        self.authenticate(self.facilitator_user)

        response = self.client.post(
            reverse("employee-evaluation-list"),
            {
                "employee": self.employee.id,
                "template": self.template.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_facilitator_can_create_trainings_flag_is_enforced(self):
        self.facilitator.can_create_trainings = False
        self.facilitator.save(update_fields=["can_create_trainings"])
        self.authenticate(self.facilitator_user)
        start = timezone.now() + timedelta(days=1)

        response = self.client.post(
            reverse("training-session-list"),
            {
                "title": "Blocked Facilitator Session",
                "topic": "Service",
                "facilitator": self.facilitator.id,
                "outlet": self.outlet.id,
                "start_datetime": start.isoformat(),
                "end_datetime": (start + timedelta(hours=1)).isoformat(),
                "attendees": [self.employee.id],
                "status": "scheduled",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)

    def test_facilitator_training_session_must_use_assigned_outlet(self):
        unassigned_outlet = Outlet.objects.create(
            organisation=self.org,
            name="Unassigned Local Outlet",
            area="A&B",
        )
        self.authenticate(self.facilitator_user)
        start = timezone.now() + timedelta(days=1)

        response = self.client.post(
            reverse("training-session-list"),
            {
                "title": "Wrong Outlet Session",
                "topic": "Service",
                "facilitator": self.facilitator.id,
                "outlet": unassigned_outlet.id,
                "start_datetime": start.isoformat(),
                "end_datetime": (start + timedelta(hours=1)).isoformat(),
                "attendees": [self.employee.id],
                "status": "scheduled",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(TrainingSession.objects.filter(title="Wrong Outlet Session").exists())

    def test_facilitator_can_create_employees_flag_is_enforced(self):
        self.facilitator.can_create_employees = False
        self.facilitator.save(update_fields=["can_create_employees"])
        self.authenticate(self.facilitator_user)

        response = self.client.post(
            reverse("employee-list"),
            {
                "name": "Blocked Employee",
                "employee_code": "BLOCK-001",
                "department": "A&B",
                "outlet": self.outlet.id,
                "position": "Server",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(Employee.objects.filter(employee_code="BLOCK-001").exists())

    def test_regular_staff_cannot_create_standards_templates_or_recovery_plans(self):
        self.authenticate(self.staff_user)

        standard_response = self.client.post(
            reverse("standard-list"),
            {
                "title": "Staff Created Standard",
                "category": "service",
                "priority": "medium",
                "active": True,
            },
            format="json",
        )
        template_response = self.client.post(
            reverse("evaluation-template-list"),
            {
                "name": "Staff Created Template",
                "outlet": self.outlet.id,
                "active": True,
            },
            format="json",
        )

        new_standard = Standard.objects.create(
            organisation=self.org,
            title="Plan Permission Standard",
            category="service",
        )
        plan_response = self.client.post(
            reverse("standard-recovery-plan-list"),
            {
                "standard": new_standard.id,
                "resource": self.resource.id,
                "trigger_fail_count": 1,
                "reevaluation_after_days": 3,
                "active": True,
            },
            format="json",
        )

        self.assertEqual(standard_response.status_code, 403)
        self.assertEqual(template_response.status_code, 403)
        self.assertEqual(plan_response.status_code, 403)

    def test_regular_staff_cannot_create_facilitator_account(self):
        employee = Employee.objects.create(
            organisation=self.org,
            name="Potential Facilitator",
            employee_code="PF-001",
            outlet=self.outlet,
            position="Server",
        )
        self.authenticate(self.staff_user)

        response = self.client.post(
            reverse("facilitator-create-account"),
            {
                "employee": employee.id,
                "username": "potential-facilitator",
                "email": "potential-facilitator@example.com",
                "password": "Strong-test-password-123",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        employee.refresh_from_db()
        self.assertIsNone(employee.user_id)

    def test_manager_can_create_facilitator_account_with_assignments(self):
        employee = Employee.objects.create(
            organisation=self.org,
            name="New Facilitator",
            employee_code="NF-001",
            outlet=self.outlet,
            position="Supervisor",
        )
        self.authenticate()

        response = self.client.post(
            reverse("facilitator-create-account"),
            {
                "employee": employee.id,
                "username": "new-facilitator",
                "email": "new-facilitator@example.com",
                "password": "Strong-test-password-123",
                "assigned_employees": [self.employee.id],
                "assigned_outlets": [self.outlet.id],
                "can_create_evaluations": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        employee.refresh_from_db()
        self.assertIsNotNone(employee.user_id)
        membership = Membership.objects.get(
            user=employee.user,
            organisation=self.org,
        )
        self.assertEqual(membership.role, "facilitator")
        facilitator = Facilitator.objects.get(employee=employee)
        self.assertEqual(
            set(facilitator.assigned_employees.values_list("id", flat=True)),
            {self.employee.id},
        )
        self.assertEqual(
            set(facilitator.assigned_outlets.values_list("id", flat=True)),
            {self.outlet.id},
        )


class TrainingEvaluationRecoveryWorkflowTests(TrainingAPITestBase):
    def post_answer(
        self,
        *,
        evaluation,
        question=None,
        score_value=0,
        yes_no_answer=None,
        text_answer="",
        user=None,
    ):
        self.authenticate(user or self.manager)
        return self.client.post(
            reverse("evaluation-answer-list"),
            {
                "evaluation": evaluation.id,
                "question": (question or self.score_question).id,
                "score": score_value,
                "yes_no_answer": yes_no_answer,
                "text_answer": text_answer,
            },
            format="json",
        )

    def test_passing_score_does_not_assign_recovery_training(self):
        evaluation = self.create_evaluation()

        response = self.post_answer(evaluation=evaluation, score_value=8)

        self.assertEqual(response.status_code, 201)
        self.assertFalse(
            EmployeeAssignedTraining.objects.filter(
                employee=self.employee,
                standard=self.standard,
            ).exists()
        )

    def test_failing_score_assigns_correct_recovery_training(self):
        evaluation = self.create_evaluation()
        expected_due = timezone.now().date() + timedelta(days=5)

        response = self.post_answer(evaluation=evaluation, score_value=2)

        self.assertEqual(response.status_code, 201)
        assigned = EmployeeAssignedTraining.objects.get(
            employee=self.employee,
            standard=self.standard,
        )
        self.assertEqual(assigned.organisation_id, self.org.id)
        self.assertEqual(assigned.resource_id, self.resource.id)
        self.assertEqual(assigned.assigned_by_id, self.manager.id)
        self.assertEqual(assigned.status, "assigned")
        self.assertEqual(assigned.reevaluation_due_date, expected_due)
        self.assertIn(self.standard.title, assigned.reason)
        self.assertIn(self.template.name, assigned.reason)

    def test_score_three_is_not_failure_under_current_threshold_contract(self):
        evaluation = self.create_evaluation()

        response = self.post_answer(evaluation=evaluation, score_value=3)

        self.assertEqual(response.status_code, 201)
        self.assertFalse(
            EmployeeAssignedTraining.objects.filter(
                employee=self.employee,
                standard=self.standard,
            ).exists()
        )

    def test_failed_yes_no_answer_assigns_training(self):
        evaluation = self.create_evaluation()

        response = self.post_answer(
            evaluation=evaluation,
            question=self.yes_no_question,
            yes_no_answer=False,
        )

        self.assertEqual(response.status_code, 201)
        assigned = EmployeeAssignedTraining.objects.get(
            employee=self.employee,
            standard=self.second_standard,
        )
        self.assertEqual(assigned.resource_id, self.second_resource.id)

    def test_passing_yes_no_answer_does_not_assign_training(self):
        evaluation = self.create_evaluation()

        response = self.post_answer(
            evaluation=evaluation,
            question=self.yes_no_question,
            yes_no_answer=True,
        )

        self.assertEqual(response.status_code, 201)
        self.assertFalse(
            EmployeeAssignedTraining.objects.filter(
                employee=self.employee,
                standard=self.second_standard,
            ).exists()
        )

    def test_duplicate_failed_answers_do_not_create_duplicate_open_training(self):
        first_evaluation = self.create_evaluation()
        second_evaluation = self.create_evaluation()

        first = self.post_answer(evaluation=first_evaluation, score_value=1)
        second = self.post_answer(evaluation=second_evaluation, score_value=1)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(
            EmployeeAssignedTraining.objects.filter(
                employee=self.employee,
                standard=self.standard,
                status__in=["assigned", "in_progress", "reevaluation_pending"],
            ).count(),
            1,
        )

    def test_new_failure_can_open_new_training_after_previous_case_is_closed(self):
        previous = EmployeeAssignedTraining.objects.create(
            organisation=self.org,
            employee=self.employee,
            standard=self.standard,
            resource=self.resource,
            assigned_by=self.manager,
            status="closed",
            reevaluated_at=timezone.now(),
        )
        evaluation = self.create_evaluation()

        response = self.post_answer(evaluation=evaluation, score_value=1)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            EmployeeAssignedTraining.objects.filter(
                employee=self.employee,
                standard=self.standard,
            ).count(),
            2,
        )
        self.assertTrue(
            EmployeeAssignedTraining.objects.filter(
                employee=self.employee,
                standard=self.standard,
                status="assigned",
            )
            .exclude(pk=previous.pk)
            .exists()
        )

    def test_trigger_fail_count_requires_configured_number_of_failures(self):
        self.recovery_plan.trigger_fail_count = 2
        self.recovery_plan.save(update_fields=["trigger_fail_count"])
        first_evaluation = self.create_evaluation()
        second_evaluation = self.create_evaluation()

        first_response = self.post_answer(
            evaluation=first_evaluation,
            score_value=1,
        )
        self.assertEqual(first_response.status_code, 201)
        self.assertFalse(
            EmployeeAssignedTraining.objects.filter(
                employee=self.employee,
                standard=self.standard,
            ).exists()
        )

        second_response = self.post_answer(
            evaluation=second_evaluation,
            score_value=1,
        )
        self.assertEqual(second_response.status_code, 201)
        self.assertEqual(
            EmployeeAssignedTraining.objects.filter(
                employee=self.employee,
                standard=self.standard,
            ).count(),
            1,
        )

    def test_inactive_recovery_plan_does_not_assign_training(self):
        self.recovery_plan.active = False
        self.recovery_plan.save(update_fields=["active"])
        evaluation = self.create_evaluation()

        response = self.post_answer(evaluation=evaluation, score_value=1)

        self.assertEqual(response.status_code, 201)
        self.assertFalse(
            EmployeeAssignedTraining.objects.filter(
                employee=self.employee,
                standard=self.standard,
            ).exists()
        )

    def test_answer_question_must_belong_to_evaluations_template(self):
        evaluation = self.create_evaluation(template=self.template)

        response = self.post_answer(
            evaluation=evaluation,
            question=self.wrong_template_question,
            score_value=1,
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            EvaluationAnswer.objects.filter(
                evaluation=evaluation,
                question=self.wrong_template_question,
            ).exists()
        )

    def test_same_question_can_only_be_answered_once_per_evaluation(self):
        evaluation = self.create_evaluation()

        first = self.post_answer(evaluation=evaluation, score_value=8)
        second = self.post_answer(evaluation=evaluation, score_value=9)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 400)
        self.assertEqual(
            EvaluationAnswer.objects.filter(
                evaluation=evaluation,
                question=self.score_question,
            ).count(),
            1,
        )

    def test_score_answer_rejects_values_outside_one_to_ten(self):
        for bad_score in (0, -1, 11, 100):
            evaluation = self.create_evaluation()
            with self.subTest(score=bad_score):
                response = self.post_answer(
                    evaluation=evaluation,
                    score_value=bad_score,
                )
                self.assertEqual(response.status_code, 400)

    def test_yes_no_question_requires_yes_no_value(self):
        evaluation = self.create_evaluation()

        response = self.post_answer(
            evaluation=evaluation,
            question=self.yes_no_question,
            yes_no_answer=None,
        )

        self.assertEqual(response.status_code, 400)

    def test_recovery_plan_resource_must_match_the_same_standard(self):
        standard_without_plan = Standard.objects.create(
            organisation=self.org,
            title="Recovery Consistency Standard",
            category="service",
        )
        self.authenticate()

        response = self.client.post(
            reverse("standard-recovery-plan-list"),
            {
                "standard": standard_without_plan.id,
                "resource": self.resource.id,
                "trigger_fail_count": 1,
                "reevaluation_after_days": 3,
                "active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            StandardRecoveryPlan.objects.filter(standard=standard_without_plan).exists()
        )


class AssignedTrainingLifecycleTests(TrainingAPITestBase):
    def create_assigned(self, **overrides):
        values = {
            "organisation": self.org,
            "employee": self.employee,
            "standard": self.standard,
            "resource": self.resource,
            "assigned_by": self.manager,
            "reason": "Needs reinforcement",
            "status": "assigned",
        }
        values.update(overrides)
        return EmployeeAssignedTraining.objects.create(**values)

    def test_mark_completed_moves_case_to_reevaluation_pending(self):
        assigned = self.create_assigned(
            reevaluation_due_date=timezone.now().date() + timedelta(days=5)
        )
        original_due = assigned.reevaluation_due_date
        self.authenticate()

        response = self.client.post(
            reverse("assigned-training-mark-completed", args=[assigned.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        assigned.refresh_from_db()
        self.assertEqual(assigned.status, "reevaluation_pending")
        self.assertIsNotNone(assigned.completed_at)
        self.assertEqual(assigned.reevaluation_due_date, original_due)

    def test_mark_completed_uses_recovery_plan_reevaluation_days_when_due_date_missing(self):
        assigned = self.create_assigned(reevaluation_due_date=None)
        self.recovery_plan.reevaluation_after_days = 7
        self.recovery_plan.save(update_fields=["reevaluation_after_days"])
        self.authenticate()

        response = self.client.post(
            reverse("assigned-training-mark-completed", args=[assigned.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        assigned.refresh_from_db()
        self.assertEqual(
            assigned.reevaluation_due_date,
            timezone.now().date() + timedelta(days=7),
        )

    def test_case_cannot_be_closed_before_microtraining_is_completed(self):
        assigned = self.create_assigned(status="assigned")
        self.authenticate()

        response = self.client.post(
            reverse("assigned-training-close", args=[assigned.id]),
            {"supervisor_notes": "Trying to skip workflow"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        assigned.refresh_from_db()
        self.assertEqual(assigned.status, "assigned")
        self.assertIsNone(assigned.reevaluated_at)

    def test_closed_case_cannot_be_reopened_by_mark_completed(self):
        assigned = self.create_assigned(
            status="closed",
            reevaluated_at=timezone.now(),
        )
        self.authenticate()

        response = self.client.post(
            reverse("assigned-training-mark-completed", args=[assigned.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        assigned.refresh_from_db()
        self.assertEqual(assigned.status, "closed")

    def test_close_from_reevaluation_pending_stores_notes_and_timestamp(self):
        assigned = self.create_assigned(
            status="reevaluation_pending",
            completed_at=timezone.now(),
            reevaluation_due_date=timezone.now().date(),
        )
        self.authenticate()

        response = self.client.post(
            reverse("assigned-training-close", args=[assigned.id]),
            {"supervisor_notes": "Collaborator now meets the standard."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        assigned.refresh_from_db()
        self.assertEqual(assigned.status, "closed")
        self.assertIsNotNone(assigned.reevaluated_at)
        self.assertEqual(
            assigned.supervisor_notes,
            "Collaborator now meets the standard.",
        )

    def test_regular_staff_cannot_change_assigned_training_state(self):
        assigned = self.create_assigned()
        self.authenticate(self.staff_user)

        response = self.client.post(
            reverse("assigned-training-mark-completed", args=[assigned.id]),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        assigned.refresh_from_db()
        self.assertEqual(assigned.status, "assigned")


class TrainingInputValidationAndDashboardTests(TrainingAPITestBase):
    def test_question_weight_must_be_at_least_one(self):
        self.authenticate()

        response = self.client.post(
            reverse("evaluation-question-list"),
            {
                "template": self.template.id,
                "standard": self.standard.id,
                "question": "Invalid zero weight",
                "score_type": "score",
                "weight": 0,
                "order": 99,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    def test_training_session_end_must_be_after_start(self):
        self.authenticate()
        start = timezone.now() + timedelta(days=2)
        end = start - timedelta(hours=1)

        response = self.client.post(
            reverse("training-session-list"),
            {
                "title": "Invalid Date Session",
                "topic": "Timing",
                "outlet": self.outlet.id,
                "start_datetime": start.isoformat(),
                "end_datetime": end.isoformat(),
                "status": "scheduled",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            TrainingSession.objects.filter(title="Invalid Date Session").exists()
        )

    def test_dashboard_counts_only_current_tenant(self):
        now = timezone.now()
        start = now + timedelta(minutes=10)
        local_session = TrainingSession.objects.create(
            organisation=self.org,
            title="Today Local",
            topic="Service",
            outlet=self.outlet,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="scheduled",
        )
        local_session.attendees.add(self.employee)

        foreign_session = TrainingSession.objects.create(
            organisation=self.other_org,
            title="Today Foreign",
            topic="Service",
            outlet=self.other_outlet,
            start_datetime=start,
            end_datetime=start + timedelta(hours=1),
            status="scheduled",
        )
        foreign_session.attendees.add(self.other_employee)

        self.authenticate()
        response = self.client.get("/api/training/dashboard/")

        self.assertEqual(response.status_code, 200)
        # org has employee, unassigned_employee and facilitator_employee.
        self.assertEqual(response.data["employees_total"], 3)
        self.assertEqual(response.data["facilitators_total"], 1)
        self.assertEqual(response.data["trainings_today"], 1)
        self.assertEqual(response.data["people_training_today"], 1)
        self.assertEqual(response.data["next_training"]["id"], local_session.id)

    def test_analytics_counts_only_current_tenant(self):
        TrainingSession.objects.create(
            organisation=self.org,
            title="Completed Local",
            topic="Service",
            start_datetime=timezone.now() - timedelta(days=1),
            end_datetime=timezone.now() - timedelta(days=1, hours=-1),
            status="completed",
        )
        TrainingSession.objects.create(
            organisation=self.other_org,
            title="Foreign Completed",
            topic="Service",
            start_datetime=timezone.now() - timedelta(days=1),
            end_datetime=timezone.now() - timedelta(days=1, hours=-1),
            status="completed",
        )
        Evaluation.objects.create(
            organisation=self.org,
            employee=self.employee,
            evaluator=self.manager,
            standard=self.standard,
            smile=8,
        )
        Evaluation.objects.create(
            organisation=self.other_org,
            employee=self.other_employee,
            evaluator=self.other_manager,
            standard=self.other_standard,
            smile=10,
        )

        self.authenticate()
        response = self.client.get("/api/training/analytics/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["employees_total"], 3)
        self.assertEqual(response.data["facilitators_total"], 1)
        self.assertEqual(response.data["trainings_total"], 1)
        self.assertEqual(response.data["completed_trainings"], 1)
        self.assertEqual(response.data["evaluations_total"], 1)
