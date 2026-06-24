// src/modules/disco/pages/DiscoReportsPage.tsx

import { useMemo } from "react";
import {
  AlertCircle,
  Banknote,
  BarChart3,
  CalendarDays,
  DollarSign,
  Package,
  ReceiptText,
  RefreshCcw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Utensils,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import KPIStatCard from "../components/KPIStatCard";
import SalesChart from "../components/SalesChart";

import useDiscoDashboard from "../hooks/useDiscoDashboard";
import useDiscoProducts from "../hooks/useDiscoProducts";
import useDiscoReservations from "../hooks/useDiscoReservations";
import useDiscoTables from "../hooks/useDiscoTables";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

function money(
  value?: string | number | null,
  language: DiscoLanguage = "en",
  currencySymbol = "RD$"
) {
  const locale = language === "es" ? "es-DO" : "en-US";

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

  return `${currencySymbol} ${formatted}`;
}

function numberValue(value?: string | number | null) {
  return Number(value || 0);
}

function label(
  language: DiscoLanguage,
  spanish: string,
  english: string
) {
  return language === "es" ? spanish : english;
}

export default function DiscoReportsPage() {
  const { language, t } = useDiscoTranslation();

  const {
    dashboard,
    stats,
    loading: dashboardLoading,
    error: dashboardError,
    refreshDashboard,
  } = useDiscoDashboard();

  const {
    products,
    loading: productsLoading,
    error: productsError,
    refreshProducts,
  } = useDiscoProducts();

  const {
    reservations,
    loading: reservationsLoading,
    error: reservationsError,
    refreshReservations,
  } = useDiscoReservations();

  const {
    tables,
    loading: tablesLoading,
    error: tablesError,
    refreshTables,
  } = useDiscoTables();

  const loading =
    dashboardLoading || productsLoading || reservationsLoading || tablesLoading;

  const error =
    dashboardError || productsError || reservationsError || tablesError;

  function refreshAll() {
    refreshDashboard();
    refreshProducts();
    refreshReservations();
    refreshTables();
  }

  const report = useMemo(() => {
    const activeProducts = products.filter((product: any) => product.is_active);

    const lowStockProducts = activeProducts.filter(
      (product: any) =>
        product.is_low_stock ||
        Number(product.stock || 0) <= Number(product.minimum_stock || 0)
    );

    const inventoryCost = activeProducts.reduce(
      (sum: number, product: any) =>
        sum + Number(product.cost_price || 0) * Number(product.stock || 0),
      0
    );

    const inventoryRetail = activeProducts.reduce(
      (sum: number, product: any) =>
        sum + Number(product.sale_price || 0) * Number(product.stock || 0),
      0
    );

    const pendingReservations = reservations.filter(
      (reservation: any) => reservation.status === "pending"
    ).length;

    const confirmedReservations = reservations.filter(
      (reservation: any) => reservation.status === "confirmed"
    ).length;

    const openTables = tables.filter((table: any) =>
      ["open", "occupied", "available"].includes(table.status)
    ).length;

    const reservedTables = tables.filter(
      (table: any) => table.status === "reserved"
    ).length;

    const vipTables = tables.filter((table: any) => table.is_vip).length;

    const dashboardData = (dashboard || {}) as any;
    const statsData = (stats || {}) as any;

    const currencySymbol =
      dashboardData.currency_symbol ||
      statsData.currency_symbol ||
      "RD$";

    const taxPercentage =
      dashboardData.tax_percentage ||
      statsData.tax_percentage ||
      "0.00";

    const salesToday =
      statsData.sales_today ??
      dashboardData.sales_today ??
      0;

    const salesMonth =
      statsData.sales_this_month ??
      statsData.sales_month ??
      dashboardData.sales_this_month ??
      dashboardData.sales_month ??
      0;

    const subtotalToday =
      statsData.subtotal_today ??
      dashboardData.subtotal_today ??
      0;

    const subtotalMonth =
      statsData.subtotal_this_month ??
      dashboardData.subtotal_this_month ??
      0;

    const taxToday =
      statsData.tax_today ??
      dashboardData.tax_today ??
      0;

    const taxMonth =
      statsData.tax_this_month ??
      dashboardData.tax_this_month ??
      0;

    const productCostToday =
      statsData.product_cost_today ??
      dashboardData.product_cost_today ??
      0;

    const productCostMonth =
      statsData.product_cost_this_month ??
      dashboardData.product_cost_this_month ??
      0;

    const grossProfitToday =
      statsData.gross_profit_today ??
      dashboardData.gross_profit_today ??
      0;

    const grossProfitMonth =
      statsData.gross_profit_this_month ??
      dashboardData.gross_profit_this_month ??
      0;

    const expensesToday =
      statsData.expenses_today ??
      dashboardData.expenses_today ??
      0;

    const expensesMonth =
      statsData.expenses_this_month ??
      dashboardData.expenses_this_month ??
      0;

    const payrollToday =
      statsData.payroll_today ??
      dashboardData.payroll_today ??
      0;

    const payrollMonth =
      statsData.payroll_this_month ??
      dashboardData.payroll_this_month ??
      0;

    const netProfitToday =
      statsData.net_profit_today ??
      dashboardData.net_profit_today ??
      0;

    const netProfitMonth =
      statsData.net_profit_this_month ??
      statsData.net_profit_month ??
      dashboardData.net_profit_this_month ??
      dashboardData.net_profit_month ??
      0;

    return {
      currencySymbol,
      taxPercentage,

      salesToday,
      salesMonth,
      subtotalToday,
      subtotalMonth,
      taxToday,
      taxMonth,

      productCostToday,
      productCostMonth,
      grossProfitToday,
      grossProfitMonth,

      expensesToday,
      expensesMonth,
      payrollToday,
      payrollMonth,

      netProfitToday,
      netProfitMonth,

      ordersToday: statsData.orders_today ?? dashboardData.orders_today ?? 0,
      openCashShifts:
        statsData.open_cash_shifts ?? dashboardData.open_cash_shifts ?? 0,
      employees:
        statsData.active_employees ?? dashboardData.active_employees ?? 0,

      activeProducts: activeProducts.length,
      lowStockProducts: lowStockProducts.length,
      inventoryCost,
      inventoryRetail,
      reservations: reservations.length,
      pendingReservations,
      confirmedReservations,
      tables: tables.length,
      openTables,
      reservedTables,
      vipTables,
    };
  }, [dashboard, stats, products, reservations, tables]);

  const monthProfitIsPositive = numberValue(report.netProfitMonth) >= 0;
  const todayProfitIsPositive = numberValue(report.netProfitToday) >= 0;

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title={t("reports.title")}
        subtitle={t("reports.subtitle")}
        icon={BarChart3}
        actionLabel={t("reports.refresh")}
        onAction={refreshAll}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-3xl bg-slate-100"
              />
            ))}
          </section>

          <div className="h-80 animate-pulse rounded-3xl bg-slate-100" />
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KPIStatCard
              title={label(language, "Ventas de hoy", "Sales today")}
              value={money(report.salesToday, language, report.currencySymbol)}
              change={`${report.ordersToday} ${label(
                language,
                "órdenes hoy",
                "orders today"
              )}`}
              icon={DollarSign}
            />

            <KPIStatCard
              title={label(language, "Ventas del mes", "Sales this month")}
              value={money(report.salesMonth, language, report.currencySymbol)}
              change={label(language, "Mes actual", "Current month")}
              icon={ShoppingCart}
            />

            <KPIStatCard
              title={label(language, "Ganancia neta hoy", "Net profit today")}
              value={money(
                report.netProfitToday,
                language,
                report.currencySymbol
              )}
              change={
                todayProfitIsPositive
                  ? label(language, "Resultado positivo", "Positive result")
                  : label(language, "Resultado negativo", "Negative result")
              }
              icon={todayProfitIsPositive ? TrendingUp : TrendingDown}
            />

            <KPIStatCard
              title={label(language, "Ganancia neta mes", "Net profit month")}
              value={money(
                report.netProfitMonth,
                language,
                report.currencySymbol
              )}
              change={
                monthProfitIsPositive
                  ? label(language, "Resultado positivo", "Positive result")
                  : label(language, "Resultado negativo", "Negative result")
              }
              icon={monthProfitIsPositive ? TrendingUp : TrendingDown}
            />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {label(
                    language,
                    "Resumen financiero real",
                    "Real financial summary"
                  )}
                </h2>

                <p className="text-sm font-semibold text-slate-500">
                  {label(
                    language,
                    "Ventas menos costo de productos, gastos y nómina.",
                    "Sales minus product cost, expenses, and payroll."
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={refreshAll}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCcw className="h-4 w-4" />
                {t("reports.refresh")}
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DiscoStatCard
                title={label(language, "Subtotal vendido hoy", "Subtotal today")}
                value={money(
                  report.subtotalToday,
                  language,
                  report.currencySymbol
                )}
                icon={ReceiptText}
                helper={label(
                  language,
                  "Antes de impuesto",
                  "Before tax"
                )}
              />

              <DiscoStatCard
                title={label(language, "Impuesto hoy", "Tax today")}
                value={money(report.taxToday, language, report.currencySymbol)}
                icon={Banknote}
                helper={`${Number(report.taxPercentage || 0)}%`}
              />

              <DiscoStatCard
                title={label(
                  language,
                  "Costo vendido hoy",
                  "Product cost today"
                )}
                value={money(
                  report.productCostToday,
                  language,
                  report.currencySymbol
                )}
                icon={Package}
                helper={label(
                  language,
                  "Costo real de productos vendidos",
                  "Real cost of sold products"
                )}
              />

              <DiscoStatCard
                title={label(language, "Ganancia bruta hoy", "Gross profit today")}
                value={money(
                  report.grossProfitToday,
                  language,
                  report.currencySymbol
                )}
                icon={TrendingUp}
                helper={label(
                  language,
                  "Subtotal menos costo vendido",
                  "Subtotal minus sold cost"
                )}
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <DiscoStatCard
                title={label(language, "Gastos hoy", "Expenses today")}
                value={money(
                  report.expensesToday,
                  language,
                  report.currencySymbol
                )}
                icon={TrendingDown}
                helper={label(
                  language,
                  "Según fecha contable",
                  "By accounting date"
                )}
              />

              <DiscoStatCard
                title={label(language, "Nómina hoy", "Payroll today")}
                value={money(
                  report.payrollToday,
                  language,
                  report.currencySymbol
                )}
                icon={Users}
                helper={label(
                  language,
                  "Pago diario según empleados activos",
                  "Daily pay by active employees"
                )}
              />

              <DiscoStatCard
                title={label(language, "Gastos del mes", "Monthly expenses")}
                value={money(
                  report.expensesMonth,
                  language,
                  report.currencySymbol
                )}
                icon={CalendarDays}
                helper={label(
                  language,
                  "Gastos del mes actual",
                  "Current month expenses"
                )}
              />

              <DiscoStatCard
                title={label(language, "Nómina del mes", "Monthly payroll")}
                value={money(
                  report.payrollMonth,
                  language,
                  report.currencySymbol
                )}
                icon={Users}
                helper={label(
                  language,
                  "Calculada por fecha de inicio/salida",
                  "Calculated by start/end date"
                )}
              />
            </div>
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-slate-950">
                    {t("reports.salesAnalytics")}
                  </h2>

                  <p className="text-sm font-medium text-slate-500">
                    {t("reports.salesAnalyticsDescription")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={refreshAll}
                  className="rounded-2xl border border-slate-200 p-3 text-slate-600 transition hover:bg-slate-50"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>

              {(dashboard as any)?.sales_chart?.length ? (
                <SalesChart data={(dashboard as any).sales_chart} />
              ) : (
                <DiscoEmptyState
                  icon={BarChart3}
                  title={t("reports.noChartData")}
                  description={t("reports.noChartDataDescription")}
                />
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
              <h2 className="text-lg font-black">
                {label(language, "Fórmula de ganancia", "Profit formula")}
              </h2>

              <p className="mt-1 text-sm font-medium text-white/60">
                {label(
                  language,
                  "Así se calcula la ganancia real del mes.",
                  "This is how real monthly profit is calculated."
                )}
              </p>

              <div className="mt-5 space-y-3">
                <FormulaRow
                  label={label(language, "Ventas del mes", "Monthly sales")}
                  value={money(
                    report.subtotalMonth,
                    language,
                    report.currencySymbol
                  )}
                />

                <FormulaRow
                  label={label(language, "Costo de productos", "Product cost")}
                  value={`-${money(
                    report.productCostMonth,
                    language,
                    report.currencySymbol
                  )}`}
                />

                <FormulaRow
                  label={label(language, "Ganancia bruta", "Gross profit")}
                  value={money(
                    report.grossProfitMonth,
                    language,
                    report.currencySymbol
                  )}
                  strong
                />

                <FormulaRow
                  label={label(language, "Gastos", "Expenses")}
                  value={`-${money(
                    report.expensesMonth,
                    language,
                    report.currencySymbol
                  )}`}
                />

                <FormulaRow
                  label={label(language, "Nómina", "Payroll")}
                  value={`-${money(
                    report.payrollMonth,
                    language,
                    report.currencySymbol
                  )}`}
                />

                <div className="border-t border-white/10 pt-3">
                  <FormulaRow
                    label={label(
                      language,
                      "Ganancia neta real",
                      "Real net profit"
                    )}
                    value={money(
                      report.netProfitMonth,
                      language,
                      report.currencySymbol
                    )}
                    strong
                    large
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DiscoStatCard
              title={t("reports.inventoryCost")}
              value={money(report.inventoryCost, language, report.currencySymbol)}
              icon={Package}
              helper={t("reports.totalStockCost")}
            />

            <DiscoStatCard
              title={t("reports.retailValue")}
              value={money(
                report.inventoryRetail,
                language,
                report.currencySymbol
              )}
              icon={TrendingUp}
              helper={t("reports.potentialSalesValue")}
            />

            <DiscoStatCard
              title={t("reports.lowStock")}
              value={report.lowStockProducts}
              icon={TrendingDown}
              helper={t("reports.productsToRestock")}
            />

            <DiscoStatCard
              title={t("reports.employees")}
              value={report.employees}
              icon={Users}
              helper={t("reports.activeTeamMembers")}
            />
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-slate-500" />

                <h2 className="text-lg font-black text-slate-950">
                  {t("reports.reservations")}
                </h2>
              </div>

              <div className="mt-5 space-y-3">
                <ReportLine
                  label={t("reports.pending")}
                  value={report.pendingReservations}
                />

                <ReportLine
                  label={t("reports.confirmed")}
                  value={report.confirmedReservations}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <Utensils className="h-5 w-5 text-slate-500" />

                <h2 className="text-lg font-black text-slate-950">
                  {t("reports.tables")}
                </h2>
              </div>

              <div className="mt-5 space-y-3">
                <ReportLine
                  label={t("reports.openAvailable")}
                  value={report.openTables}
                />

                <ReportLine
                  label={t("reports.reserved")}
                  value={report.reservedTables}
                />

                <ReportLine label={t("reports.vip")} value={report.vipTables} />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-slate-500" />

                <h2 className="text-lg font-black text-slate-950">
                  {t("reports.inventoryHealth")}
                </h2>
              </div>

              <div className="mt-5 space-y-3">
                <ReportLine
                  label={t("reports.products")}
                  value={report.activeProducts}
                />

                <ReportLine
                  label={t("reports.lowStock")}
                  value={report.lowStockProducts}
                />
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function FormulaRow({
  label,
  value,
  strong = false,
  large = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  large?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl bg-white/10 p-4 ${
        large ? "text-lg" : "text-sm"
      }`}
    >
      <span className={strong ? "font-black text-white" : "font-bold text-white/70"}>
        {label}
      </span>

      <span className={strong ? "font-black text-white" : "font-bold text-white"}>
        {value}
      </span>
    </div>
  );
}

function ReportLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
      <span className="text-sm font-bold text-slate-600">{label}</span>

      <span className="text-xl font-black text-slate-950">{value}</span>
    </div>
  );
}
