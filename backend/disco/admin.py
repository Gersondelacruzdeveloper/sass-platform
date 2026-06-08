from django.contrib import admin
from .models import Category, Product, StockMovement, Sale, SaleItem, Expense, DiscoEmployee, DiscoTable, CashShift, DiscoReservation, DiscoActivityLog

admin.site.register(Category)
admin.site.register(Product)
admin.site.register(StockMovement)
admin.site.register(Sale)
admin.site.register(SaleItem)
admin.site.register(Expense)
admin.site.register(DiscoEmployee)
admin.site.register(DiscoTable)
admin.site.register(CashShift)
admin.site.register(DiscoReservation)
admin.site.register(DiscoActivityLog)
