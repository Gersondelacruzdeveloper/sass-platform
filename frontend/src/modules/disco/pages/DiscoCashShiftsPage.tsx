import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Lock,
  Plus,
  RefreshCcw,
  Search,
  Unlock,
  X,
} from "lucide-react";

import CashShiftCard from "../components/CashShiftCard";
import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";

import {
  createCashShift,
  getCashShifts,
  updateCashShift,
} from "../api/cashShiftsApi";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

type CashShift = {
  id: number;
  opening_cash: string | number;
  closing_cash?: string | number | null;
  opened_at: string;
  closed_at?: string | null;
  is_open: boolean;
  opened_by?: number | null;
  closed_by?: number | null;
  opened_by_name?: string | null;
  closed_by_name?: string | null;
};

function money(value?: string | number | null, language: DiscoLanguage = "en") {
  const locale = language === "es" ? "es-DO" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function DiscoCashShiftsPage() {
  const { language, t } = useDiscoTranslation();

  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState<CashShift | null>(null);

  const [openingCash, setOpeningCash] = useState("");
  const [closingCash, setClosingCash] = useState("");

  async function loadShifts(isRefresh = false) {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError("");

      const data: any = await getCashShifts();
      setShifts(Array.isArray(data) ? data : (data && data.results) || []);
    } catch (err) {
      console.error(err);
      setError(t("cashShifts.errorLoad"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openShift = useMemo(
    () => shifts.find((shift) => shift.is_open),
    [shifts]
  );

  const filteredShifts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return shifts;

    return shifts.filter((shift) =>
      [
        shift.id,
        shift.opening_cash,
        shift.closing_cash,
        shift.opened_by_name,
        shift.closed_by_name,
        shift.is_open ? "open" : "closed",
        shift.is_open
          ? t("cashShifts.search.open")
          : t("cashShifts.search.closed"),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [shifts, search, t]);

  const stats = useMemo(() => {
    const open = shifts.filter((shift) => shift.is_open).length;
    const closed = shifts.filter((shift) => !shift.is_open).length;

    const openingTotal = shifts.reduce(
      (sum, shift) => sum + Number(shift.opening_cash || 0),
      0
    );

    const closingTotal = shifts.reduce(
      (sum, shift) => sum + Number(shift.closing_cash || 0),
      0
    );

    return { open, closed, openingTotal, closingTotal };
  }, [shifts]);

  async function handleOpenShift(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

      await createCashShift({
        opening_cash: Number(openingCash || 0),
      });

      setOpeningCash("");
      setOpenModal(false);
      await loadShifts(true);
    } catch (err) {
      console.error(err);
      setError(t("cashShifts.errorOpen"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseShift(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedShift) return;

    try {
      setSaving(true);
      setError("");

      await updateCashShift(selectedShift.id, {
        closing_cash: String(Number(closingCash || 0)),
        is_open: false,
      });

      setClosingCash("");
      setSelectedShift(null);
      setCloseModal(false);
      await loadShifts(true);
    } catch (err) {
      console.error(err);
      setError(t("cashShifts.errorClose"));
    } finally {
      setSaving(false);
    }
  }

  function startCloseShift(shift: CashShift) {
    setSelectedShift(shift);
    setClosingCash("");
    setCloseModal(true);
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title={t("cashShifts.title")}
        subtitle={t("cashShifts.subtitle")}
        icon={Banknote}
        actionLabel={
          openShift ? t("cashShifts.shiftOpen") : t("cashShifts.openShift")
        }
        onAction={openShift ? undefined : () => setOpenModal(true)}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title={t("cashShifts.openShifts")}
          value={stats.open}
          icon={Unlock}
          helper={t("cashShifts.currentlyActive")}
        />

        <DiscoStatCard
          title={t("cashShifts.closedShifts")}
          value={stats.closed}
          icon={Lock}
          helper={t("cashShifts.completedShifts")}
        />

        <DiscoStatCard
          title={t("cashShifts.openingCash")}
          value={money(stats.openingTotal, language)}
          icon={Banknote}
          helper={t("cashShifts.totalStartingCash")}
        />

        <DiscoStatCard
          title={t("cashShifts.closingCash")}
          value={money(stats.closingTotal, language)}
          icon={CheckCircle2}
          helper={t("cashShifts.totalFinalCash")}
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
              placeholder={t("cashShifts.searchPlaceholder")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => loadShifts(true)}
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
              onClick={() => setOpenModal(true)}
              disabled={Boolean(openShift)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {t("cashShifts.open")}
            </button>
          </div>
        </div>

        {openShift && (
          <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-black text-emerald-950">
              {t("cashShifts.currentShiftOpen")}
            </p>

            <p className="mt-1 text-sm font-semibold text-emerald-800">
              {t("cashShifts.openingCash")}:{" "}
              {money(openShift.opening_cash, language)}
            </p>
          </div>
        )}
      </section>

      {loading ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      ) : filteredShifts.length === 0 ? (
        <DiscoEmptyState
          icon={Banknote}
          title={t("cashShifts.noShiftsFound")}
          description={t("cashShifts.noShiftsFoundDescription")}
        />
      ) : (
        <section className="grid gap-3 lg:grid-cols-2">
          {filteredShifts.map((shift) => {
            const normalizedShift = {
              ...shift,
              opened_by_name:
                shift.opened_by_name === null
                  ? undefined
                  : shift.opened_by_name,
              closed_by_name:
                shift.closed_by_name === null
                  ? undefined
                  : shift.closed_by_name,
            } as any; // normalize null -> undefined to satisfy component prop types

            return (
              <CashShiftCard
                key={shift.id}
                shift={normalizedShift}
                // @ts-ignore: component accepts runtime prop for closing shift
                onCloseShift={
                  shift.is_open ? () => startCloseShift(shift) : undefined
                }
              />
            );
          })}
        </section>
      )}

      {openModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center">
          <form
            onSubmit={handleOpenShift}
            className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {t("cashShifts.openModalTitle")}
                </h2>

                <p className="mt-1 text-sm font-medium text-slate-500">
                  {t("cashShifts.openModalSubtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpenModal(false)}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-bold text-slate-700">
                {t("cashShifts.openingCash")}
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                required
                placeholder="0.00"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving
                ? t("cashShifts.opening")
                : t("cashShifts.openShift")}
            </button>
          </form>
        </div>
      )}

      {closeModal && selectedShift && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center">
          <form
            onSubmit={handleCloseShift}
            className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {t("cashShifts.closeModalTitle")}
                </h2>

                <p className="mt-1 text-sm font-medium text-slate-500">
                  {t("cashShifts.closeModalSubtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setCloseModal(false)}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-950">
                {t("cashShifts.openingCash")}:{" "}
                {money(selectedShift.opening_cash, language)}
              </p>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-bold text-slate-700">
                {t("cashShifts.closingCash")}
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                required
                placeholder="0.00"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving
                ? t("cashShifts.closing")
                : t("cashShifts.closeShift")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}