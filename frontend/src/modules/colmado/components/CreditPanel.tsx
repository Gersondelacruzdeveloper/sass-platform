import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronLeft,
  CircleDollarSign,
  History,
  LoaderCircle,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";

import {
  createCustomer,
  getApiErrorMessage,
  getCustomerCreditHistory,
  getCustomers,
  recordCreditPayment,
  type CreditTransaction,
} from "../api/colmadoClient";
import type { Customer, Store } from "../types/colmado";

interface CreditPanelProps {
  organisationSlug: string;
  store: Store;
  onDataChanged?: () => void | Promise<void>;
}

const pesos = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat("es-DO", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default function CreditPanel({
  organisationSlug,
  store,
  onDataChanged,
}: CreditPanelProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCustomers(
        await getCustomers(organisationSlug, {
          hasDebt: true,
        }),
      );
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [organisationSlug]);

  useEffect(() => {
    setSelected(null);
    setCreating(false);
    void loadCustomers();
  }, [loadCustomers, store.id]);

  const visibleCustomers = useMemo(() => {
    const text = search.trim().toLocaleLowerCase("es");
    if (!text) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.phone].some((value) =>
        value.toLocaleLowerCase("es").includes(text),
      ),
    );
  }, [customers, search]);

  const totalOwed = customers.reduce(
    (total, customer) => total + Number(customer.balance),
    0,
  );

  async function refreshAfterChange(updatedCustomer?: Customer) {
    if (updatedCustomer) setSelected(updatedCustomer);
    await loadCustomers();
    await onDataChanged?.();
  }

  if (selected) {
    return (
      <CustomerCreditDetail
        organisationSlug={organisationSlug}
        store={store}
        customer={selected}
        onBack={() => setSelected(null)}
        onPayment={refreshAfterChange}
      />
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="credit-title">
      <div>
        <p className="text-sm font-bold text-emerald-700">{store.name}</p>
        <h1 id="credit-title" className="text-2xl font-black text-slate-950">
          Fiado
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Mira quién debe y registra sus abonos.
        </p>
      </div>

      <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
        <p className="text-sm font-black text-amber-800">Total pendiente</p>
        <p className="mt-1 text-3xl font-black text-slate-950">
          {pesos.format(totalOwed)}
        </p>
        <p className="mt-1 text-sm font-bold text-slate-600">
          {customers.length} {customers.length === 1 ? "cliente debe" : "clientes deben"}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar cliente</span>
          <Search
            aria-hidden="true"
            className="absolute left-3 top-3.5 text-slate-400"
            size={19}
          />
          <input
            className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            placeholder="Buscar por nombre o teléfono"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 font-black text-white"
          onClick={() => setCreating(true)}
        >
          <Plus aria-hidden="true" size={20} /> Nuevo cliente
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 font-bold text-slate-600">
            <LoaderCircle className="animate-spin" aria-hidden="true" /> Cargando...
          </div>
        ) : visibleCustomers.length === 0 ? (
          <div className="p-10 text-center">
            <CircleDollarSign
              aria-hidden="true"
              className="mx-auto text-emerald-600"
              size={46}
            />
            <p className="mt-3 font-black text-slate-900">
              {search ? "No encontramos ese cliente" : "Nadie debe ahora mismo"}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {search
                ? "Revisa el nombre o el teléfono."
                : "Cuando hagas una venta fiada aparecerá aquí."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleCustomers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className="flex min-h-20 w-full items-center gap-3 p-4 text-left hover:bg-slate-50"
                onClick={() => setSelected(customer)}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700">
                  <UserRound aria-hidden="true" size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-black text-slate-950">
                    {customer.name}
                  </span>
                  <span className="block truncate text-sm text-slate-500">
                    {customer.phone || "Sin teléfono"}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-lg font-black text-red-700">
                    {pesos.format(Number(customer.balance))}
                  </span>
                  <span className="text-xs font-bold text-slate-500">debe</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <NewCustomerDialog
          organisationSlug={organisationSlug}
          onClose={() => setCreating(false)}
          onCreated={async (customer) => {
            setCreating(false);
            await onDataChanged?.();
            setSelected(customer);
          }}
        />
      )}
    </section>
  );
}

interface CustomerCreditDetailProps {
  organisationSlug: string;
  store: Store;
  customer: Customer;
  onBack: () => void;
  onPayment: (customer: Customer) => void | Promise<void>;
}

function CustomerCreditDetail({
  organisationSlug,
  store,
  customer,
  onBack,
  onPayment,
}: CustomerCreditDetailProps) {
  const [history, setHistory] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      setHistory(
        await getCustomerCreditHistory(organisationSlug, customer.id),
      );
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [customer.id, organisationSlug]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    if (saving || Number(amount) <= 0) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await recordCreditPayment(organisationSlug, customer.id, {
        store_id: store.id,
        amount,
        note: note.trim(),
      });
      setAmount("");
      setNote("");
      setSuccess(`Abono guardado. Ahora debe ${pesos.format(Number(result.customer.balance))}.`);
      await loadHistory();
      await onPayment(result.customer);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="customer-credit-title">
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-black text-emerald-800"
        onClick={onBack}
      >
        <ChevronLeft aria-hidden="true" /> Volver al fiado
      </button>

      <div className="rounded-2xl bg-slate-950 p-5 text-white">
        <p className="text-sm font-bold text-slate-300">{customer.phone || "Sin teléfono"}</p>
        <h1 id="customer-credit-title" className="mt-1 text-2xl font-black">
          {customer.name}
        </h1>
        <p className="mt-5 text-sm font-bold text-slate-300">Debe actualmente</p>
        <p className="text-4xl font-black text-amber-300">
          {pesos.format(Number(customer.balance))}
        </p>
      </div>

      <form
        onSubmit={(event) => void submitPayment(event)}
        className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4"
      >
        <h2 className="flex items-center gap-2 font-black text-slate-950">
          <ArrowDownCircle aria-hidden="true" className="text-emerald-700" /> Registrar abono
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-black text-slate-800">
            ¿Cuánto pagó? (RD$)
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              max={customer.balance}
              step="0.01"
              required
              autoFocus
              className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg font-black outline-none focus:border-emerald-600"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="text-sm font-black text-slate-800">
            Nota opcional
            <input
              maxLength={255}
              className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 outline-none focus:border-emerald-600"
              placeholder="Ej.: pagó en efectivo"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>

        {error && <p role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p>}
        {success && <p role="status" className="mt-3 text-sm font-bold text-emerald-800">{success}</p>}

        <button
          type="submit"
          disabled={saving || Number(amount) <= 0 || Number(amount) > Number(customer.balance)}
          className="mt-4 min-h-12 w-full rounded-xl bg-emerald-700 px-5 font-black text-white disabled:opacity-50 sm:w-auto"
        >
          {saving ? "Guardando..." : "Confirmar abono"}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="flex items-center gap-2 border-b border-slate-200 p-4 font-black text-slate-950">
          <History aria-hidden="true" size={21} /> Historial
        </h2>
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-8 font-bold text-slate-600">
            <LoaderCircle className="animate-spin" aria-hidden="true" /> Cargando...
          </div>
        ) : history.length === 0 ? (
          <p className="p-8 text-center text-sm font-bold text-slate-500">
            Todavía no hay movimientos.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {history.map((entry) => {
              const payment = entry.transaction_type === "payment";
              return (
                <article key={entry.id} className="flex items-start gap-3 p-4">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                      payment
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {payment ? (
                      <ArrowDownCircle aria-hidden="true" size={21} />
                    ) : (
                      <ArrowUpCircle aria-hidden="true" size={21} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-900">
                      {entry.transaction_type_display}
                    </p>
                    <p className="text-sm text-slate-500">
                      {dateTime.format(new Date(entry.created_at))} · {entry.store_name}
                    </p>
                    {entry.note && <p className="mt-1 text-sm text-slate-600">{entry.note}</p>}
                  </div>
                  <div className="text-right">
                    <p className={`font-black ${payment ? "text-emerald-700" : "text-red-700"}`}>
                      {payment ? "−" : "+"}{pesos.format(Number(entry.amount))}
                    </p>
                    <p className="text-xs font-bold text-slate-500">
                      Debe {pesos.format(Number(entry.balance_after))}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

interface NewCustomerDialogProps {
  organisationSlug: string;
  onClose: () => void;
  onCreated: (customer: Customer) => void | Promise<void>;
}

function NewCustomerDialog({
  organisationSlug,
  onClose,
  onCreated,
}: NewCustomerDialogProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [creditLimit, setCreditLimit] = useState("0.00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const customer = await createCustomer(organisationSlug, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        credit_limit: creditLimit || "0.00",
        is_active: true,
      });
      await onCreated(customer);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-customer-title"
      className="fixed inset-0 z-50 grid place-items-end bg-black/55 p-0 sm:place-items-center sm:p-4"
    >
      <form
        onSubmit={(event) => void submit(event)}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-center gap-3">
          <UserRound aria-hidden="true" className="text-emerald-700" />
          <h2 id="new-customer-title" className="flex-1 text-xl font-black text-slate-950">
            Nuevo cliente
          </h2>
          <button
            type="button"
            aria-label="Cerrar"
            className="grid h-11 w-11 place-items-center rounded-full bg-slate-100"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <TextField label="Nombre completo" value={name} onChange={setName} required autoFocus />
          <TextField label="Teléfono" value={phone} onChange={setPhone} inputMode="tel" />
          <TextField label="Dirección" value={address} onChange={setAddress} />
          <label className="block text-sm font-black text-slate-800">
            Límite de fiado (RD$)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-emerald-600"
              value={creditLimit}
              onChange={(event) => setCreditLimit(event.target.value)}
            />
            <span className="mt-1 block text-xs font-medium text-slate-500">
              Usa 0 si no quieres ponerle un límite.
            </span>
          </label>
        </div>

        {error && <p role="alert" className="mt-4 text-sm font-bold text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="mt-5 min-h-12 w-full rounded-xl bg-emerald-700 px-5 font-black text-white disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar cliente"}
        </button>
      </form>
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  inputMode?: "text" | "tel";
}

function TextField({
  label,
  value,
  onChange,
  required = false,
  autoFocus = false,
  inputMode = "text",
}: TextFieldProps) {
  return (
    <label className="block text-sm font-black text-slate-800">
      {label}
      <input
        inputMode={inputMode}
        required={required}
        autoFocus={autoFocus}
        className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-4 outline-none focus:border-emerald-600"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
