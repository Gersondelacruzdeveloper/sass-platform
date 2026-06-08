import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
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

type Expense = {
  id: number;
  title: string;
  category: string;
  amount: string | number;
  note?: string | null;
  created_by?: number | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

const initialForm = {
  title: "",
  category: "general",
  amount: "",
  note: "",
};

const categoryOptions = [
  { value: "general", label: "General" },
  { value: "inventory", label: "Inventory" },
  { value: "maintenance", label: "Maintenance" },
  { value: "staff", label: "Staff" },
  { value: "marketing", label: "Marketing" },
  { value: "utilities", label: "Utilities" },
  { value: "rent", label: "Rent" },
  { value: "other", label: "Other" },
];

function money(value?: string | number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatDate(value?: string) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function categoryLabel(value: string) {
  return (
    categoryOptions.find((category) => category.value === value)?.label || value
  );
}

export default function DiscoExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState(initialForm);

  async function loadExpenses(isRefresh = false) {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError("");

      const data = await getExpenses();
      setExpenses(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error(err);
      setError("Could not load expenses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadExpenses();
  }, []);

  const filteredExpenses = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return expenses;

    return expenses.filter((expense) =>
      [
        expense.title,
        expense.category,
        categoryLabel(expense.category),
        expense.amount,
        expense.note,
        expense.created_by_name,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [expenses, search]);

  const stats = useMemo(() => {
    const total = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0
    );

    const categories = new Set(
      expenses.map((expense) => expense.category).filter(Boolean)
    ).size;

    const today = new Date().toDateString();
    const todayTotal = expenses
      .filter((expense) =>
        expense.created_at
          ? new Date(expense.created_at).toDateString() === today
          : false
      )
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    return {
      total,
      categories,
      todayTotal,
      count: expenses.length,
    };
  }, [expenses]);

  function openCreateModal() {
    setEditingExpense(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEditModal(expense: Expense) {
    setEditingExpense(expense);
    setForm({
      title: expense.title || "",
      category: expense.category || "general",
      amount: String(expense.amount || ""),
      note: expense.note || "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

      const payload = {
        title: form.title,
        category: form.category,
        amount: Number(form.amount || 0),
        note: form.note,
      };

      if (editingExpense) {
        await updateExpense(editingExpense.id, payload);
      } else {
        await createExpense(payload);
      }

      setModalOpen(false);
      setEditingExpense(null);
      setForm(initialForm);
      await loadExpenses(true);
    } catch (err) {
      console.error(err);
      setError("Could not save expense.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Expenses"
        subtitle="Track operational costs, purchases, maintenance, utilities, and daily spending."
        icon={ReceiptText}
        actionLabel="New Expense"
        onAction={openCreateModal}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title="Total Expenses"
          value={money(stats.total)}
          icon={DollarSign}
          helper="All recorded expenses"
        />

        <DiscoStatCard
          title="Today"
          value={money(stats.todayTotal)}
          icon={ReceiptText}
          helper="Expenses added today"
        />

        <DiscoStatCard
          title="Records"
          value={stats.count}
          icon={ReceiptText}
          helper="Expense entries"
        />

        <DiscoStatCard
          title="Categories"
          value={stats.categories}
          icon={Tags}
          helper="Active categories"
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
              placeholder="Search expenses..."
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
              Refresh
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Add
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
          title="No expenses found"
          description="Add your first expense to track costs for inventory, maintenance, staff, utilities, and operations."
        />
      ) : (
        <DiscoDataTable
          data={filteredExpenses}
          columns={[
            {
              header: "Expense",
              accessor: "title",
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
              header: "Category",
              accessor: "category",
              render: (expense: Expense) => (
                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-700">
                  {categoryLabel(expense.category)}
                </span>
              ),
            },
            {
              header: "Amount",
              accessor: "amount",
              render: (expense: Expense) => (
                <span className="text-sm font-black text-slate-950">
                  {money(expense.amount)}
                </span>
              ),
            },
            {
              header: "Created By",
              accessor: "created_by_name",
              render: (expense: Expense) => (
                <span className="text-sm font-bold text-slate-600">
                  {expense.created_by_name || "System"}
                </span>
              ),
            },
            {
              header: "Date",
              accessor: "created_at",
              render: (expense: Expense) => (
                <span className="text-sm font-bold text-slate-500">
                  {formatDate(expense.created_at)}
                </span>
              ),
            },
            {
              header: "Actions",
              accessor: "id",
              render: (expense: Expense) => (
                <button
                  type="button"
                  onClick={() => openEditModal(expense)}
                  className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                >
                  Edit
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
                  {editingExpense ? "Edit Expense" : "New Expense"}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Record spending for this disco organisation.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Title</span>
                <input
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  required
                  placeholder="Example: Ice purchase"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Category
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
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Amount
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
                <span className="text-sm font-bold text-slate-700">Note</span>
                <textarea
                  value={form.note}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  rows={4}
                  placeholder="Optional note..."
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
                ? "Saving..."
                : editingExpense
                  ? "Save Changes"
                  : "Create Expense"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}