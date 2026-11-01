import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Banknote, LoaderCircle, Plus, ReceiptText, Users } from "lucide-react";

import {
  createEmployee,
  createExpense,
  createPayrollPayment,
  getApiErrorMessage,
  getEmployees,
  getExpenses,
  getPayrollPayments,
  type Employee,
  type EmployeePayFrequency,
  type Expense,
  type ExpenseCategory,
  type PayrollPayment,
} from "../api/colmadoClient";
import type { Store } from "../types/colmado";

interface FinancePanelProps {
  organisationSlug: string;
  store: Store;
  onDataChanged: () => void | Promise<void>;
}

type OpenForm = "expense" | "employee" | "payroll" | null;

const today = () => new Date().toISOString().slice(0, 10);

const money = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  maximumFractionDigits: 2,
});

const moneyValue = (value: string) => money.format(Number(value || 0));

const decimalMoney = (value: string) => Number(value || 0).toFixed(2);

const expenseCategories: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "rent", label: "Alquiler" },
  { value: "electricity", label: "Luz" },
  { value: "water", label: "Agua" },
  { value: "internet", label: "Internet y teléfono" },
  { value: "transport", label: "Transporte" },
  { value: "maintenance", label: "Mantenimiento" },
  { value: "tax", label: "Impuestos" },
  { value: "other", label: "Otro" },
];

const payFrequencies: Array<{
  value: EmployeePayFrequency;
  label: string;
}> = [
  { value: "daily", label: "Diario" },
  { value: "weekly", label: "Semanal" },
  { value: "biweekly", label: "Quincenal" },
  { value: "monthly", label: "Mensual" },
];

const fieldClass =
  "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function FinancePanel({
  organisationSlug,
  store,
  onDataChanged,
}: FinancePanelProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<PayrollPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<OpenForm>(null);

  const [expenseCategory, setExpenseCategory] =
    useState<ExpenseCategory>("other");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today);

  const [employeeName, setEmployeeName] = useState("");
  const [employeePhone, setEmployeePhone] = useState("");
  const [employeePosition, setEmployeePosition] = useState("");
  const [payFrequency, setPayFrequency] =
    useState<EmployeePayFrequency>("monthly");
  const [employeePayAmount, setEmployeePayAmount] = useState("");
  const [employeeStartDate, setEmployeeStartDate] = useState(today);

  const [payrollEmployee, setPayrollEmployee] = useState("");
  const [payrollAmount, setPayrollAmount] = useState("");
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [paidOn, setPaidOn] = useState(today);
  const [payrollNote, setPayrollNote] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextEmployees, nextExpenses, nextPayments] = await Promise.all([
        getEmployees(organisationSlug, { store: store.id, active: true }),
        getExpenses(organisationSlug, { store: store.id }),
        getPayrollPayments(organisationSlug, { store: store.id }),
      ]);
      setEmployees(nextEmployees);
      setExpenses(nextExpenses);
      setPayments(nextPayments);
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "No pudimos cargar los gastos y la nómina.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [organisationSlug, store.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function showForm(form: Exclude<OpenForm, null>) {
    setError(null);
    setSuccess(null);
    setOpenForm((current) => (current === form ? null : form));
  }

  async function saveExpense(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createExpense(organisationSlug, {
        store: store.id,
        category: expenseCategory,
        description: expenseDescription.trim(),
        amount: decimalMoney(expenseAmount),
        expense_date: expenseDate,
      });
      setExpenseDescription("");
      setExpenseAmount("");
      setOpenForm(null);
      setSuccess("Gasto registrado. La ganancia del dashboard fue actualizada.");
      await loadData();
      await onDataChanged();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "No pudimos registrar el gasto."));
    } finally {
      setSaving(false);
    }
  }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createEmployee(organisationSlug, {
        store: store.id,
        name: employeeName.trim(),
        phone: employeePhone.trim(),
        position: employeePosition.trim(),
        pay_frequency: payFrequency,
        pay_amount: decimalMoney(employeePayAmount),
        start_date: employeeStartDate,
        is_active: true,
      });
      setEmployeeName("");
      setEmployeePhone("");
      setEmployeePosition("");
      setEmployeePayAmount("");
      setOpenForm(null);
      setSuccess("Empleado agregado correctamente.");
      await loadData();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "No pudimos guardar el empleado."));
    } finally {
      setSaving(false);
    }
  }

  function selectPayrollEmployee(value: string) {
    setPayrollEmployee(value);
    const selected = employees.find((item) => item.id === Number(value));
    if (selected) setPayrollAmount(selected.pay_amount);
  }

  async function savePayroll(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createPayrollPayment(organisationSlug, {
        store: store.id,
        employee: Number(payrollEmployee),
        amount: decimalMoney(payrollAmount),
        period_start: periodStart,
        period_end: periodEnd,
        paid_on: paidOn,
        note: payrollNote.trim(),
      });
      setPayrollEmployee("");
      setPayrollAmount("");
      setPayrollNote("");
      setOpenForm(null);
      setSuccess("Pago de nómina registrado. La ganancia fue actualizada.");
      await loadData();
      await onDataChanged();
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "No pudimos registrar el pago de nómina."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="finance-title">
      <div>
        <p className="text-sm font-bold text-emerald-700">{store.name}</p>
        <h1 id="finance-title" className="text-2xl font-black text-slate-950">
          Gastos y nómina
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Registra el dinero que sale para conocer la ganancia real del colmado.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 font-bold text-red-800">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-xl bg-emerald-50 p-3 font-bold text-emerald-800">
          {success}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => showForm("expense")} className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 font-black text-amber-950">
          <ReceiptText aria-hidden="true" /> Registrar gasto
        </button>
        <button type="button" onClick={() => showForm("employee")} className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-sky-700 px-4 font-black text-white">
          <Plus aria-hidden="true" /> Agregar empleado
        </button>
        <button type="button" disabled={!employees.length} onClick={() => showForm("payroll")} className="flex min-h-16 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
          <Banknote aria-hidden="true" /> Pagar nómina
        </button>
      </div>

      {!loading && !employees.length && (
        <p className="rounded-xl bg-sky-50 p-3 text-sm font-bold text-sky-800">
          Agrega un empleado antes de registrar nómina.
        </p>
      )}

      {openForm === "expense" && (
        <form onSubmit={saveExpense} className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-lg font-black">Nuevo gasto</h2>
          <label className="font-bold">Categoría<select aria-label="Categoría" value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value as ExpenseCategory)} className={fieldClass}>{expenseCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="font-bold">Descripción<input aria-label="Descripción" required value={expenseDescription} onChange={(event) => setExpenseDescription(event.target.value)} className={fieldClass} /></label>
          <label className="font-bold">Monto (RD$)<input aria-label="Monto del gasto" required min="0.01" step="0.01" type="number" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} className={fieldClass} /></label>
          <label className="font-bold">Fecha<input aria-label="Fecha del gasto" required type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} className={fieldClass} /></label>
          <button disabled={saving} className="min-h-12 rounded-xl bg-amber-500 px-4 font-black text-amber-950 sm:col-span-2">Guardar gasto</button>
        </form>
      )}

      {openForm === "employee" && (
        <form onSubmit={saveEmployee} className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-lg font-black">Nuevo empleado</h2>
          <label className="font-bold">Nombre<input aria-label="Nombre del empleado" required value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} className={fieldClass} /></label>
          <label className="font-bold">Teléfono<input aria-label="Teléfono del empleado" value={employeePhone} onChange={(event) => setEmployeePhone(event.target.value)} className={fieldClass} /></label>
          <label className="font-bold">Puesto<input aria-label="Puesto" value={employeePosition} onChange={(event) => setEmployeePosition(event.target.value)} className={fieldClass} /></label>
          <label className="font-bold">Frecuencia<select aria-label="Frecuencia de pago" value={payFrequency} onChange={(event) => setPayFrequency(event.target.value as EmployeePayFrequency)} className={fieldClass}>{payFrequencies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label className="font-bold">Pago habitual (RD$)<input aria-label="Pago habitual" required min="0.01" step="0.01" type="number" value={employeePayAmount} onChange={(event) => setEmployeePayAmount(event.target.value)} className={fieldClass} /></label>
          <label className="font-bold">Fecha de inicio<input aria-label="Fecha de inicio" required type="date" value={employeeStartDate} onChange={(event) => setEmployeeStartDate(event.target.value)} className={fieldClass} /></label>
          <button disabled={saving} className="min-h-12 rounded-xl bg-sky-700 px-4 font-black text-white sm:col-span-2">Guardar empleado</button>
        </form>
      )}

      {openForm === "payroll" && (
        <form onSubmit={savePayroll} className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-2">
          <h2 className="sm:col-span-2 text-lg font-black">Registrar pago de nómina</h2>
          <label className="font-bold">Empleado<select aria-label="Empleado" required value={payrollEmployee} onChange={(event) => selectPayrollEmployee(event.target.value)} className={fieldClass}><option value="">Selecciona</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="font-bold">Monto (RD$)<input aria-label="Monto pagado" required min="0.01" step="0.01" type="number" value={payrollAmount} onChange={(event) => setPayrollAmount(event.target.value)} className={fieldClass} /></label>
          <label className="font-bold">Inicio del período<input aria-label="Inicio del período" required type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className={fieldClass} /></label>
          <label className="font-bold">Final del período<input aria-label="Final del período" required type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className={fieldClass} /></label>
          <label className="font-bold">Fecha de pago<input aria-label="Fecha de pago" required type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} className={fieldClass} /></label>
          <label className="font-bold">Nota<input aria-label="Nota del pago" value={payrollNote} onChange={(event) => setPayrollNote(event.target.value)} className={fieldClass} /></label>
          <button disabled={saving} className="min-h-12 rounded-xl bg-emerald-700 px-4 font-black text-white sm:col-span-2">Confirmar pago</button>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-8 font-bold text-slate-600"><LoaderCircle className="animate-spin" /> Cargando movimientos...</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><ReceiptText className="text-amber-600" /> Gastos recientes</h2>
            {expenses.length ? <div className="space-y-2">{expenses.slice(0, 8).map((item) => <article key={item.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="min-w-0 flex-1"><strong className="block truncate">{item.description}</strong><span className="text-sm text-slate-500">{item.category_display} · {item.expense_date}</span></span><strong className="text-amber-700">{moneyValue(item.amount)}</strong></article>)}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-600">No hay gastos registrados.</p>}
          </section>
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-black"><Users className="text-emerald-700" /> Nómina reciente</h2>
            {payments.length ? <div className="space-y-2">{payments.slice(0, 8).map((item) => <article key={item.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="min-w-0 flex-1"><strong className="block truncate">{item.employee_name}</strong><span className="text-sm text-slate-500">Pagado el {item.paid_on}</span></span><strong className="text-emerald-700">{moneyValue(item.amount)}</strong></article>)}</div> : <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-600">No hay pagos de nómina registrados.</p>}
          </section>
        </div>
      )}
    </section>
  );
}
