from django.contrib import admin
from .models import Category, Product, StockMovement, Sale, SaleItem, Expense

admin.site.register(Category)
admin.site.register(Product)
admin.site.register(StockMovement)
admin.site.register(Sale)
admin.site.register(SaleItem)
admin.site.register(Expense)