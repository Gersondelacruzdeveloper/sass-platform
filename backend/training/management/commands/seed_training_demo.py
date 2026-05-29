from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

from training.models import (
    Outlet,
    Employee,
    Facilitator,
    Standard,
    EvaluationTemplate,
    EvaluationQuestion,
    EmployeeEvaluation,
    EvaluationAnswer,
    TrainingSession,
    RoadmapItem,
)

User = get_user_model()


class Command(BaseCommand):
    help = "Seed realistic A&B training demo data"

    def handle(self, *args, **kwargs):
        user = User.objects.filter(is_superuser=True).first()

        toro, _ = Outlet.objects.get_or_create(
            name="Toro Steakhouse",
            defaults={
                "area": "Restaurant",
                "manager": "Carlos Méndez",
                "description": "High-volume steakhouse. Focus: wine service, speed, upselling.",
            },
        )

        zen, _ = Outlet.objects.get_or_create(
            name="Zen Asian Restaurant",
            defaults={
                "area": "Restaurant",
                "manager": "María Torres",
                "description": "Asian restaurant. Focus: menu knowledge, guest engagement, timing.",
            },
        )

        eclipse, _ = Outlet.objects.get_or_create(
            name="Eclipse Bar",
            defaults={
                "area": "Bar",
                "manager": "Luis Peña",
                "description": "Busy evening bar. Focus: cocktail consistency, premium liquor upselling.",
            },
        )

        market, _ = Outlet.objects.get_or_create(
            name="The Market Buffet",
            defaults={
                "area": "Buffet",
                "manager": "Ana Rodríguez",
                "description": "Buffet operation. Focus: cleanliness, refill speed, guest flow.",
            },
        )

        # Supervisors
        sup_carlos, _ = Employee.objects.get_or_create(
            name="Carlos Reyes",
            defaults={
                "employee_code": "AB-SUP-001",
                "department": "A&B",
                "outlet": toro,
                "position": "Restaurant Supervisor",
                "languages": ["Spanish", "English"],
                "strengths": ["Leadership", "Wine knowledge", "Guest recovery"],
                "weaknesses": ["Documentation follow-up"],
                "service_score": 91,
                "leadership_score": 94,
                "attitude_score": 90,
                "upselling_score": 87,
                "hard_rock_standard_score": 92,
                "potential_level": "future_leader",
                "promotion_ready": True,
                "career_goal": "Assistant A&B Manager",
                "notes": "Strong supervisor profile. Good candidate to lead wine service training.",
            },
        )

        sup_maria, _ = Employee.objects.get_or_create(
            name="María Gómez",
            defaults={
                "employee_code": "AB-SUP-002",
                "department": "A&B",
                "outlet": zen,
                "position": "Restaurant Supervisor",
                "languages": ["Spanish", "English", "French"],
                "strengths": ["Team coaching", "Guest connection", "Menu knowledge"],
                "weaknesses": ["Needs stronger upselling routines"],
                "service_score": 88,
                "leadership_score": 92,
                "attitude_score": 93,
                "upselling_score": 79,
                "hard_rock_standard_score": 89,
                "potential_level": "high",
                "promotion_ready": True,
                "career_goal": "Training Coordinator",
                "notes": "Excellent with staff motivation and guest interaction.",
            },
        )

        employees_data = [
            ("Juan Pérez", toro, "Waiter", sup_carlos, 86, 75, 91, 72, 88, ["Smile", "Fast service"], ["Wine upselling"]),
            ("Ana Castillo", toro, "Hostess", sup_carlos, 92, 70, 95, 65, 91, ["Greeting", "Guest name usage"], ["Premium recommendations"]),
            ("Pedro Martínez", eclipse, "Bartender", None, 84, 76, 89, 91, 83, ["Cocktails", "Energy"], ["Consistency during rush hour"]),
            ("Rosa Jiménez", market, "Buffet Attendant", None, 78, 68, 86, 55, 76, ["Cleanliness", "Teamwork"], ["Guest engagement", "English"]),
            ("Daniel Santos", zen, "Waiter", sup_maria, 73, 65, 78, 58, 70, ["Polite attitude"], ["Menu knowledge", "Speed"]),
            ("Laura Mejía", zen, "Captain", sup_maria, 90, 88, 94, 82, 90, ["Leadership", "Guest recovery"], ["Report follow-up"]),
            ("Miguel Núñez", eclipse, "Bartender", None, 69, 62, 74, 66, 68, ["Friendly"], ["Premium liquor knowledge", "Speed"]),
            ("Sofía Ramírez", market, "Waitress", None, 81, 72, 89, 60, 80, ["Smile", "Guest care"], ["Upselling", "English"]),
        ]

        created_employees = []

        for name, outlet, position, supervisor, service, leadership, attitude, upselling, hr, strengths, weaknesses in employees_data:
            emp, _ = Employee.objects.get_or_create(
                name=name,
                defaults={
                    "employee_code": f"AB-{name[:2].upper()}",
                    "department": "A&B",
                    "outlet": outlet,
                    "position": position,
                    "supervisor": supervisor,
                    "languages": ["Spanish", "English"],
                    "strengths": strengths,
                    "weaknesses": weaknesses,
                    "service_score": service,
                    "leadership_score": leadership,
                    "attitude_score": attitude,
                    "upselling_score": upselling,
                    "hard_rock_standard_score": hr,
                    "potential_level": "high" if service >= 85 else "medium",
                    "promotion_ready": service >= 88,
                    "career_goal": "Supervisor" if service >= 85 else "Improve current role",
                    "notes": "Demo profile created for A&B training flow.",
                },
            )
            created_employees.append(emp)

        # Facilitators
        fac1, _ = Facilitator.objects.get_or_create(
            employee=sup_carlos,
            defaults={
                "specialties": ["Wine Service", "Guest Recovery", "Leadership", "Hard Rock Standards"],
                "active": True,
            },
        )
        fac1.assigned_employees.set(created_employees[:4])

        fac2, _ = Facilitator.objects.get_or_create(
            employee=sup_maria,
            defaults={
                "specialties": ["Menu Knowledge", "Guest Engagement", "Service Culture"],
                "active": True,
            },
        )
        fac2.assigned_employees.set(created_employees[4:])

        # Standards
        standards = {}
        standards_data = [
            ("Greeting within 10 seconds", "service", "Employee greets guest quickly with warm energy.", "critical"),
            ("Use guest name when possible", "luxury", "Employee creates personalized guest interaction.", "high"),
            ("Recommend premium option", "beverage", "Employee offers wine, premium liquor, dessert, or upgrade.", "high"),
            ("Explain menu confidently", "culinary", "Employee can explain dishes, allergens, and recommendations.", "critical"),
            ("Recover guest complaint professionally", "service", "Employee listens, apologizes, solves or escalates.", "critical"),
            ("Maintain Hard Rock energy", "hard_rock", "Employee shows positive, energetic, brand-aligned attitude.", "high"),
            ("Keep buffet area clean and replenished", "culinary", "Buffet stations stay clean, full, and visually attractive.", "critical"),
            ("Cocktail consistency", "beverage", "Drinks follow recipe, garnish, presentation, and timing standards.", "critical"),
        ]

        for title, category, description, priority in standards_data:
            standard, _ = Standard.objects.get_or_create(
                title=title,
                defaults={
                    "category": category,
                    "description": description,
                    "priority": priority,
                    "active": True,
                },
            )
            standards[title] = standard

        # Templates
        wine_template, _ = EvaluationTemplate.objects.get_or_create(
            name="Wine & Premium Upselling Audit",
            defaults={
                "description": "Use when guests complain about weak wine recommendations or low premium sales.",
                "outlet": toro,
                "active": True,
            },
        )

        pool_bar_template, _ = EvaluationTemplate.objects.get_or_create(
            name="Bar Speed & Cocktail Consistency Audit",
            defaults={
                "description": "Use when drinks are slow or cocktail quality is inconsistent.",
                "outlet": eclipse,
                "active": True,
            },
        )

        buffet_template, _ = EvaluationTemplate.objects.get_or_create(
            name="Buffet Cleanliness & Refill Audit",
            defaults={
                "description": "Use when guests complain about buffet cleanliness, refill speed, or presentation.",
                "outlet": market,
                "active": True,
            },
        )

        guest_recovery_template, _ = EvaluationTemplate.objects.get_or_create(
            name="Guest Recovery Observation",
            defaults={
                "description": "Use when evaluating how staff handles complaints and emotional guest situations.",
                "outlet": None,
                "active": True,
            },
        )

        def add_question(template, standard_title, question, score_type="score", weight=1, order=0):
            EvaluationQuestion.objects.get_or_create(
                template=template,
                question=question,
                defaults={
                    "standard": standards.get(standard_title),
                    "score_type": score_type,
                    "weight": weight,
                    "order": order,
                },
            )

        add_question(wine_template, "Greeting within 10 seconds", "Did the employee greet the guest with confidence?", "score", 1, 1)
        add_question(wine_template, "Explain menu confidently", "Did the employee explain wine or pairing options correctly?", "score", 2, 2)
        add_question(wine_template, "Recommend premium option", "Did the employee recommend a premium wine or bottle?", "yes_no", 2, 3)
        add_question(wine_template, "Maintain Hard Rock energy", "Did the employee maintain positive brand energy?", "score", 1, 4)

        add_question(pool_bar_template, "Cocktail consistency", "Was the cocktail prepared according to standard?", "score", 2, 1)
        add_question(pool_bar_template, "Recommend premium option", "Did the bartender offer premium liquor?", "yes_no", 2, 2)
        add_question(pool_bar_template, "Greeting within 10 seconds", "Was the guest acknowledged quickly?", "score", 1, 3)
        add_question(pool_bar_template, "Maintain Hard Rock energy", "Did the bartender create fun guest interaction?", "score", 1, 4)

        add_question(buffet_template, "Keep buffet area clean and replenished", "Was the station clean and organized?", "score", 2, 1)
        add_question(buffet_template, "Keep buffet area clean and replenished", "Were food items replenished on time?", "score", 2, 2)
        add_question(buffet_template, "Greeting within 10 seconds", "Did the attendant interact with guests warmly?", "score", 1, 3)

        add_question(guest_recovery_template, "Recover guest complaint professionally", "Did the employee listen without interrupting?", "yes_no", 2, 1)
        add_question(guest_recovery_template, "Recover guest complaint professionally", "Did the employee apologize and show empathy?", "score", 2, 2)
        add_question(guest_recovery_template, "Recover guest complaint professionally", "What was the resolution or next step?", "text", 1, 3)

        # Training sessions
        TrainingSession.objects.get_or_create(
            title="Premium Wine Recommendation Workshop",
            topic="Wine upselling and guest confidence",
            defaults={
                "description": "Focused on improving wine recommendations after guest feedback.",
                "facilitator": fac1,
                "outlet": toro,
                "start_datetime": timezone.now() + timedelta(days=1, hours=2),
                "end_datetime": timezone.now() + timedelta(days=1, hours=3),
                "expected_attendees": 18,
                "attendance_percentage": 0,
                "status": "scheduled",
            },
        )

        TrainingSession.objects.get_or_create(
            title="Cocktail Consistency Refresh",
            topic="Speed, garnish, premium liquor and drink standards",
            defaults={
                "description": "For Eclipse Bar team based on recent quality inconsistency.",
                "facilitator": fac1,
                "outlet": eclipse,
                "start_datetime": timezone.now(),
                "end_datetime": timezone.now() + timedelta(hours=1),
                "expected_attendees": 12,
                "attendance_percentage": 85,
                "status": "in_progress",
            },
        )

        # Sample evaluations
        juan = Employee.objects.get(name="Juan Pérez")
        pedro = Employee.objects.get(name="Pedro Martínez")
        rosa = Employee.objects.get(name="Rosa Jiménez")

        def create_evaluation(employee, template, scores):
            evaluation, created = EmployeeEvaluation.objects.get_or_create(
                employee=employee,
                template=template,
                defaults={
                    "evaluator": user,
                    "notes": "Demo evaluation based on current A&B focus areas.",
                },
            )

            if created:
                questions = template.questions.all().order_by("order")

                for question in questions:
                    value = scores.get(question.question, 7)

                    answer = EvaluationAnswer(
                        evaluation=evaluation,
                        question=question,
                    )

                    if question.score_type == "score":
                        answer.score = float(value)

                    elif question.score_type == "yes_no":
                        answer.yes_no_answer = bool(value)
                        answer.score = 10 if value else 0

                    else:
                        answer.text_answer = str(value)
                        answer.score = 0

                    answer.save()

        create_evaluation(
            juan,
            wine_template,
            {
                "Did the employee greet the guest with confidence?": 9,
                "Did the employee explain wine or pairing options correctly?": 7,
                "Did the employee recommend a premium wine or bottle?": False,
                "Did the employee maintain positive brand energy?": 9,
            },
        )

        create_evaluation(
            pedro,
            pool_bar_template,
            {
                "Was the cocktail prepared according to standard?": 8,
                "Did the bartender offer premium liquor?": True,
                "Was the guest acknowledged quickly?": 9,
                "Did the bartender create fun guest interaction?": 8,
            },
        )

        create_evaluation(
            rosa,
            buffet_template,
            {
                "Was the station clean and organized?": 8,
                "Were food items replenished on time?": 6,
                "Did the attendant interact with guests warmly?": 7,
            },
        )

        # Roadmap
        RoadmapItem.objects.get_or_create(
            title="Improve wine and premium upselling consistency",
            defaults={
                "description": "Train waiters to recommend premium wine, dessert, and upgrades.",
                "period": "30_days",
                "priority": "high",
                "owner": user,
            },
        )

        RoadmapItem.objects.get_or_create(
            title="Build 50 facilitator structure",
            defaults={
                "description": "Identify internal trainers by outlet and skill specialty.",
                "period": "60_days",
                "priority": "high",
                "owner": user,
            },
        )

        RoadmapItem.objects.get_or_create(
            title="Launch monthly A&B standards audit",
            defaults={
                "description": "Use templates to audit standards by outlet and track improvement.",
                "period": "90_days",
                "priority": "critical",
                "owner": user,
            },
        )

        self.stdout.write(self.style.SUCCESS("A&B training demo data created successfully."))