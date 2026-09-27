import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  WalletCards,
} from "lucide-react";

import {
  closeCashRegister,
  getApiErrorMessage,
  openCashRegister,
} from "../api/colmadoClient";
import type { CashRegisterSession, Store } from "../types/colmado";

interface CashRegisterPanelProps {
  organisationSlug: string;
  store: Store;
  cashRegister: CashRegisterSession | null;
  onChanged: () => void | Promise<void>;
}

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  maximumFractionDigits: 2,
});

const money = (value: string | number) => currency.format(Number(value || 0));

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("es-DO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function CashRegisterPanel({
  organisationSlug,
  store,
  cashRegister,
  onChanged,
}: CashRegisterPanelProps) {
  const [openingAmount, setOpeningAmount] = useState("0.00");
  const [countedCash, setCountedCash] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOpeningAmount("0.00");
    setCountedCash("");
    setNote("");
    setError(null);
  }, [store.id, cashRegister?.id]);

  const difference = useMemo(() => {
    if (!cashRegister || countedCash.trim() === "") return null;
    const counted = Number(countedCash);
    const expected = Number(cashRegister.expected_cash);
    if (!Number.isFinite(counted) || counted < 0) return null;
    return counted - expected;
  }, [cashRegister, countedCash]);

  async function handleOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(openingAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Escribe una cantidad válida para comenzar la caja.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await openCashRegister(organisationSlug, {
        store_id: store.id,
        opening_amount: amount.toFixed(2),
        note: note.trim() || undefined,
      });
      await onChanged();
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "No pudimos abrir la caja."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cashRegister) return;

    const counted = Number(countedCash);
    if (!Number.isFinite(counted) || counted < 0) {
      setError("Cuenta el efectivo y escribe una cantidad válida.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await closeCashRegister(organisationSlug, cashRegister.id, {
        counted_cash: counted.toFixed(2),
        note: note.trim() || undefined,
      });
      await onChanged();
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "No pudimos cerrar la caja."),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!cashRegister) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <header>
          <p className="text-sm font-bold text-emerald-700">{store.name}</p>
          <h1 className="text-2xl font-black sm:text-3xl">Abrir caja</h1>
          <p className="mt-1 text-slate-600">
            Escribe con cuánto efectivo comienza el turno.
          </p>
        </header>

        <form
          className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"
          onSubmit={handleOpen}
        >
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-amber-50 p-4 text-amber-950">
            <LockKeyhole aria-hidden="true" size={28} />
            <div>
              <p className="font-black">La caja está cerrada</p>
              <p className="text-sm">Ábrela antes de comenzar el turno.</p>
            </div>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-black">
              Efectivo inicial
            </span>
            <div className="flex items-center rounded-xl border-2 border-slate-300 bg-white px-4 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-100">
              <span className="text-lg font-black text-slate-500">RD$</span>
              <input
                autoFocus
                required
                inputMode="decimal"
                min="0"
                step="0.01"
                type="number"
                value={openingAmount}
                className="min-w-0 flex-1 bg-transparent px-3 py-4 text-2xl font-black outline-none"
                onChange={(event) => setOpeningAmount(event.target.value)}
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-black">
              Nota <span className="font-normal text-slate-500">(opcional)</span>
            </span>
            <input
              maxLength={255}
              type="text"
              value={note}
              placeholder="Ejemplo: Turno de la mañana"
              className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          {error && <ErrorMessage message={error} />}

          <button
            type="submit"
            disabled={saving}
            className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-lg font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <WalletCards aria-hidden="true" />
            )}
            {saving ? "Abriendo..." : "Abrir caja"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-700">{store.name}</p>
          <h1 className="text-2xl font-black sm:text-3xl">Caja del turno</h1>
          <p className="mt-1 text-sm text-slate-500">
            Abierta por {cashRegister.opened_by_name} · {dateTime(cashRegister.opened_at)}
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">
          <CheckCircle2 aria-hidden="true" size={18} />
          Caja abierta
        </span>
      </header>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <MoneyCard label="Comenzó con" value={cashRegister.opening_amount} />
        <MoneyCard label="Ventas en efectivo" value={cashRegister.cash_sales} />
        <MoneyCard
          emphasized
          label="Debe haber"
          value={cashRegister.expected_cash}
        />
      </section>

      <form
        className="rounded-2xl bg-white p-5 shadow-sm sm:p-7"
        onSubmit={handleClose}
      >
        <h2 className="text-xl font-black">Cerrar caja</h2>
        <p className="mt-1 text-sm text-slate-600">
          Cuenta todo el efectivo que hay ahora mismo.
        </p>

        <label className="mt-5 block">
          <span className="mb-2 block text-sm font-black">Efectivo contado</span>
          <div className="flex items-center rounded-xl border-2 border-slate-300 bg-white px-4 focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-100">
            <span className="text-lg font-black text-slate-500">RD$</span>
            <input
              required
              inputMode="decimal"
              min="0"
              step="0.01"
              type="number"
              value={countedCash}
              placeholder="0.00"
              className="min-w-0 flex-1 bg-transparent px-3 py-4 text-2xl font-black outline-none"
              onChange={(event) => setCountedCash(event.target.value)}
            />
          </div>
        </label>

        {difference !== null && (
          <div
            className={`mt-4 rounded-xl p-4 text-center ${
              difference === 0
                ? "bg-emerald-50 text-emerald-900"
                : difference > 0
                  ? "bg-sky-50 text-sky-900"
                  : "bg-red-50 text-red-900"
            }`}
          >
            <p className="text-sm font-bold">
              {difference === 0
                ? "La caja está exacta"
                : difference > 0
                  ? "Dinero sobrante"
                  : "Dinero faltante"}
            </p>
            <p className="mt-1 text-2xl font-black">{money(Math.abs(difference))}</p>
          </div>
        )}

        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-black">
            Nota del cierre <span className="font-normal text-slate-500">(opcional)</span>
          </span>
          <input
            maxLength={255}
            type="text"
            value={note}
            placeholder="Explica cualquier diferencia"
            className="w-full rounded-xl border-2 border-slate-300 px-4 py-3 outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {error && <ErrorMessage message={error} />}

        <button
          type="submit"
          disabled={saving || countedCash.trim() === ""}
          className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-lg font-black text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <LockKeyhole aria-hidden="true" />
          )}
          {saving ? "Cerrando..." : "Cerrar caja"}
        </button>
      </form>
    </div>
  );
}

function MoneyCard({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl p-3 text-center shadow-sm sm:p-5 ${
        emphasized ? "bg-emerald-700 text-white" : "bg-white"
      }`}
    >
      <p className={`text-xs font-bold sm:text-sm ${emphasized ? "text-emerald-100" : "text-slate-500"}`}>
        {label}
      </p>
      <p className="mt-2 text-base font-black sm:text-2xl">{money(value)}</p>
    </article>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
      {message}
    </div>
  );
}
