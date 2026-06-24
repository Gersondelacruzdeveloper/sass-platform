// src/modules/disco/pages/DiscoExpensesPage.tsx

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  DollarSign,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  Tags,
  X,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import DiscoDataTable from "../components/DiscoDataTable";

import {
  createExpense,
  getExpenses,
  updateExpense,
} from "../api/expensesApi";

import {
  getDiscoSettings,
  type DiscoSettings,
} from "../api/settingsApi";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

type Expense = {
  id: number;
  title: string;
  category: string;
  amount: string | number;
  note?: string | null;
  expense_date?: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

type ExpenseForm = {
  title: string;
  category: string;
  amount: string;
  expense_date: string;
  note: string;
};

const categoryOptions = [
  { value: "general", translationKey: "expenses.category.general" },
  { value: "inventory", translationKey: "expenses.category.inventory" },
  { value: "maintenance", translationKey: "expenses.category.maintenance" },
  { value: "staff", translationKey: "expenses.category.staff" },
  { value: "marketing", translationKey: "expenses.category.marketing" },
  { value: "utilities", translationKey: "expenses.category.utilities" },
  { value: "rent", translationKey: "expenses.category.rent" },
  { value: "other", translationKey: "expenses.category.other" },
];

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function getExpenseAccountingDate(expense: Expense) {
  if (expense.expense_date) return expense.expense_date;

  if (expense.created_at) {
    return new Date(expense.created_at).toISOString().slice(0, 10);
  }

  return "";
}

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

function formatDate(value: string | undefined | null, language: DiscoLanguage) {
  if (!value) return "—";

  const locale = language === "es" ? "es-DO" : "en-US";
  const date = new Date(`${value}T00:00:00`);

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(date);
}

function categoryLabel(
  value: string,
  t: (key: string, fallback?: string) => string
) {
  const option = categoryOptions.find((category) => category.value === value);

  return option ? t(option.translationKey) : value;
}

const initialForm: ExpenseForm = {
  title: "",
  category: "general",
  amount: "",
  expense_date: todayISODate(),
  note: "",
};

export default function DiscoExpensesPage() {
  const { language, t } = useDiscoTranslation();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [discoSettings, setDiscoSettings] = useState<DiscoSettings | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(initialForm);

  const currencySymbol = discoSettings?.currency_symbol || "RD$";

  async function loadExpenses(isRefresh = false) {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError("");

      const data = await getExpenses();
      const expensesData = Array.isArray(data)
        ? data
        : (data as { results?: Expense[] }).results || [];

      setExpenses(expensesData);
    } catch (err) {
      console.error(err);
      setError(t("expenses.errorLoad"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await getDiscoSettings();
        setDiscoSettings(settings);
      } catch (err) {
        console.error("Could not load disco settings:", err);
      }
    }

    loadSettings();
    loadExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return expenses;

    return expenses.filter((expense) =>
      [
        expense.title,
        expense.category,
        categoryLabel(expense.category, t),
        expense.amount,
        expense.expense_date,
        expense.note,
        expense.created_by_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [expenses, search, t]);

  const stats = useMemo(() => {
    const total = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0
    );

    const categories = new Set(
      expenses.map((expense) => expense.category).filter(Boolean)
    ).size;

    const today = todayISODate();

    const todayTotal = expenses
      .filter((expense) => getExpenseAccountingDate(expense) === today)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const currentMonth = today.slice(0, 7);

    const monthTotal = expenses
      .filter((expense) =>
        getExpenseAccountingDate(expense).startsWith(currentMonth)
      )
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    return {
      total,
      categories,
      todayTotal,
      monthTotal,
      count: expenses.length,
    };
  }, [expenses]);

  function openCreateModal() {
    setEditingExpense(null);
    setForm({
      ...initialForm,
      expense_date: todayISODate(),
    });
    setModalOpen(true);
  }

  function openEditModal(expense: Expense) {
    setEditingExpense(expense);

    setForm({
      title: expense.title || "",
      category: expense.category || "general",
      amount: String(expense.amount || ""),
      expense_date: getExpenseAccountingDate(expense) || todayISODate(),
      note: expense.note || "",
    });

    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingExpense(null);
    setForm({
      ...initialForm,
      expense_date: todayISODate(),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

      const payload = {
        title: form.title.trim(),
        category: form.category,
        amount: Number(form.amount || 0),
        expense_date: form.expense_date || todayISODate(),
        note: form.note.trim(),
      };

      if (editingExpense) {
        await updateExpense(editingExpense.id, payload);
      } else {
        await createExpense(payload);
      }

      closeModal();
      await loadExpenses(true);
    } catch (err) {
      console.error(err);
      setError(t("expenses.errorSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title={t("expenses.title")}
        subtitle={t("expenses.subtitle")}
        icon={ReceiptText}
        actionLabel={t("expenses.newExpense")}
        onAction={openCreateModal}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title={t("expenses.totalExpenses")}
          value={money(stats.total, language, currencySymbol)}
          icon={DollarSign}
          helper={t("expenses.allRecordedExpenses")}
        />

        <DiscoStatCard
          title={t("expenses.today")}
          value={money(stats.todayTotal, language, currencySymbol)}
          icon={ReceiptText}
          helper="Según fecha contable del gasto"
        />

        <DiscoStatCard
          title="Este mes"
          value={money(stats.monthTotal, language, currencySymbol)}
          icon={CalendarDays}
          helper="Gastos del mes actual"
        />

        <DiscoStatCard
          title={t("expenses.categories")}
          value={stats.categories}
          icon={Tags}
          helper={t("expenses.activeCategories")}
        />
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("expenses.searchPlaceholder")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => loadExpenses(true)}
              disabled={refreshing}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCcw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              {t("pos.refresh")}
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              {t("expenses.add")}
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      ) : filteredExpenses.length === 0 ? (
        <DiscoEmptyState
          icon={ReceiptText}
          title={t("expenses.noExpensesFound")}
          description={t("expenses.noExpensesFoundDescription")}
        />
      ) : (
        <DiscoDataTable
          data={filteredExpenses}
          columns={[
            {
              label: t("expenses.expense"),
              key: "title",
              render: (expense: Expense) => (
                <div>
                  <p className="text-sm font-black text-slate-950">
                    {expense.title}
                  </p>

                  {expense.note && (
                    <p className="mt-1 max-w-md text-xs font-medium text-slate-500">
                      {expense.note}
                    </p>
                  )}
                </div>
              ),
            },
            {
              label: t("expenses.category"),
              key: "category",
              render: (expense: Expense) => (
                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-700">
                  {categoryLabel(expense.category, t)}
                </span>
              ),
            },
            {
              label: t("expenses.amount"),
              key: "amount",
              render: (expense: Expense) => (
                <span className="text-sm font-black text-slate-950">
                  {money(expense.amount, language, currencySymbol)}
                </span>
              ),
            },
            {
              label: "Fecha contable",
              key: "expense_date",
              render: (expense: Expense) => (
                <span className="text-sm font-bold text-slate-500">
                  {formatDate(getExpenseAccountingDate(expense), language)}
                </span>
              ),
            },
            {
              label: t("expenses.createdBy"),
              key: "created_by_name",
              render: (expense: Expense) => (
                <span className="text-sm font-bold text-slate-600">
                  {expense.created_by_name || t("expenses.system")}
                </span>
              ),
            },
            {
              label: t("expenses.actions"),
              key: "id",
              render: (expense: Expense) => (
                <button
                  type="button"
                  onClick={() => openEditModal(expense)}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                >
                  {t("expenses.edit")}
                </button>
              ),
            },
          ]}
        />
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center">
          <form
            onSubmit={handleSubmit}
            className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {editingExpense
                    ? t("expenses.editExpense")
                    : t("expenses.newExpense")}
                </h2>

                <p className="mt-1 text-sm font-medium text-slate-500">
                  {t("expenses.modalSubtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("expenses.titleField")}
                </span>

                <input
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  required
                  placeholder={t("expenses.titlePlaceholder")}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("expenses.category")}
                </span>

                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, category: e.target.value }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  {categoryOptions.map((category) => (
                    <option key={category.value} value={category.value}>
                      {t(category.translationKey)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Fecha contable del gasto
                </span>

                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      expense_date: e.target.value,
                    }))
                  }
                  required
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                />

                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Esta fecha se usará para reportes diarios, mensuales y cierre.
                </p>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("expenses.amount")}
                </span>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, amount: e.target.value }))
                  }
                  required
                  placeholder="0.00"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("expenses.note")}
                </span>

                <textarea
                  value={form.note}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  rows={4}
                  placeholder={t("expenses.notePlaceholder")}
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving
                ? t("expenses.saving")
                : editingExpense
                  ? t("expenses.saveChanges")
                  : t("expenses.createExpense")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
