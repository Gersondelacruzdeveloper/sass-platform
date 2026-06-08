from datetime import timedelta
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from organisations.models import Organisation, Membership
from disco.models import (
    Category,
    Product,
    DiscoEmployee,
    DiscoTable,
    CashShift,
    DiscoReservation,
    Expense,
)

User = get_user_model()


@api_view(["POST", "GET"])
def seed_disco_demo(request):
    org, _ = Organisation.objects.get_or_create(
        slug="almond-brownie",
        defaults={
            "name": "Almond Brownie Disco",
            "business_type": "disco",
            "is_active": True,
        },
    )

    user, _ = User.objects.get_or_create(
        username="admin",
        defaults={"email": "admin@almondbrownie.com"},
    )
    user.set_password("Disco123!")
    user.save()

    Membership.objects.get_or_create(
        user=user,
        organisation=org,
        defaults={"role": "owner", "is_active": True},
    )

    employees = [
        ("Carlos Manager", "manager"),
        ("Maria Cashier", "cashier"),
        ("Juan Bartender", "bartender"),
        ("Ana Waitress", "waiter"),
        ("Luis Security", "security"),
    ]

    for name, role in employees:
        DiscoEmployee.objects.get_or_create(
            organisation=org,
            full_name=name,
            defaults={
                "role": role,
                "phone": "8095550000",
                "is_active": True,
            },
        )

    for i in range(1, 11):
        DiscoTable.objects.get_or_create(
            organisation=org,
            name=f"VIP-{i}",
            defaults={
                "floor": "Main Floor",
                "capacity": 6,
                "minimum_spend": 250,
                "status": "available",
                "is_vip": True,
            },
        )

    for i in range(11, 21):
        DiscoTable.objects.get_or_create(
            organisation=org,
            name=f"TABLE-{i}",
            defaults={
                "floor": "Main Floor",
                "capacity": 4,
                "minimum_spend": 0,
                "status": "available",
                "is_vip": False,
            },
        )

    categories = {}

    for name in ["Beer", "Vodka", "Whisky", "Rum", "Cocktails", "Soft Drinks"]:
        category, _ = Category.objects.get_or_create(
            organisation=org,
            name=name,
        )
        categories[name] = category

    products = [
        ("Presidente Beer", "Beer", 2, 5, 300),
        ("Corona", "Beer", 3, 6, 200),
        ("Grey Goose", "Vodka", 25, 55, 50),
        ("Absolut Vodka", "Vodka", 18, 45, 60),
        ("Johnnie Walker Black", "Whisky", 30, 75, 40),
        ("Jack Daniels", "Whisky", 28, 70, 35),
        ("Brugal XV", "Rum", 12, 35, 80),
        ("Bacardi", "Rum", 10, 30, 90),
        ("Mojito", "Cocktails", 2, 10, 100),
        ("Cuba Libre", "Cocktails", 2, 10, 100),
        ("Coca Cola", "Soft Drinks", 0.5, 3, 400),
        ("Sprite", "Soft Drinks", 0.5, 3, 350),
    ]

    for name, category_name, cost, sale, stock in products:
        Product.objects.get_or_create(
            organisation=org,
            name=name,
            defaults={
                "category": categories[category_name],
                "cost_price": cost,
                "sale_price": sale,
                "stock": stock,
                "minimum_stock": 20,
                "unit": "bottle",
                "is_alcohol": category_name != "Soft Drinks",
                "brand": category_name,
                "is_active": True,
            },
        )

    CashShift.objects.get_or_create(
        organisation=org,
        opening_cash=1000,
        defaults={
            "opened_by": user,
            "is_open": True,
        },
    )

    table = DiscoTable.objects.filter(organisation=org).first()

    for i in range(1, 6):
        DiscoReservation.objects.get_or_create(
            organisation=org,
            customer_name=f"Customer {i}",
            defaults={
                "customer_phone": "8095551234",
                "table": table,
                "people_count": i + 2,
                "deposit_amount": 100,
                "reservation_datetime": timezone.now() + timedelta(days=i),
                "status": "confirmed",
                "created_by": user,
            },
        )

    expenses = [
        ("Ice Purchase", "inventory", 50),
        ("DJ Payment", "staff", 300),
        ("Cleaning Supplies", "maintenance", 80),
        ("Instagram Ads", "marketing", 120),
    ]

    for title, category, amount in expenses:
        Expense.objects.get_or_create(
            organisation=org,
            title=title,
            defaults={
                "category": category,
                "amount": amount,
                "note": "Demo expense",
                "created_by": user,
            },
        )

    return Response({
        "message": "Disco demo data created successfully.",
        "login_url": "http://localhost:5173/disco/almond-brownie/login",
        "username": "admin",
        "password": "Disco123!",
        "organisation": "almond-brownie",
    })