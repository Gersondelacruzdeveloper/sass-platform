// src/modules/disco/components/CashShiftCard.tsx

import { Banknote, Clock, Lock, Unlock, User } from "lucide-react";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

type CashShift = {
  id: number;
  opened_by_name?: string;
  closed_by_name?: string | null;
  opening_cash: number | string;
  closing_cash?: number | string | null;
  opened_at: string;
  closed_at?: string | null;
  is_open: boolean;
};

type CashShiftCardProps = {
  shift: CashShift;
  onClose?: (shift: CashShift) => void;
  onCloseShift?: (shift: CashShift) => void;
  onView?: (shift: CashShift) => void;
};

function money(value: number | string | null | undefined, language: DiscoLanguage) {
  const locale = language === "es" ? "es-DO" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function formatDateTime(
  value: string | null | undefined,
  language: DiscoLanguage,
  notClosedYetLabel: string
) {
  if (!value) return notClosedYetLabel;

  const locale = language === "es" ? "es-DO" : "en-US";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function CashShiftCard({
  shift,
  onClose,
  onCloseShift,
  onView,
}: CashShiftCardProps) {
  const { language, t } = useDiscoTranslation();

  const closeHandler = onClose || onCloseShift;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`rounded-2xl p-3 ${
              shift.is_open
                ? "bg-emerald-50 text-emerald-600"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {shift.is_open ? <Unlock size={22} /> : <Lock size={22} />}
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
              {t("cashShifts.cardTitle")}
            </p>

            <h3 className="text-lg font-black text-slate-900">
              #{shift.id} ·{" "}
              {shift.is_open
                ? t("cashShifts.statusOpen")
                : t("cashShifts.statusClosed")}
            </h3>
          </div>
        </div>

        <span
          className={`w-fit rounded-full px-3 py-1 text-xs font-black ${
            shift.is_open
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {shift.is_open
            ? t("cashShifts.statusOpenUpper")
            : t("cashShifts.statusClosedUpper")}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
            <Banknote size={15} />
            {t("cashShifts.openingCash")}
          </div>

          <p className="mt-2 text-xl font-black text-slate-900">
            {money(shift.opening_cash, language)}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-400">
            <Banknote size={15} />
            {t("cashShifts.closingCash")}
          </div>

          <p className="mt-2 text-xl font-black text-slate-900">
            {shift.closing_cash ? money(shift.closing_cash, language) : "—"}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <User size={17} className="mt-0.5 text-slate-400" />

          <div>
            <p className="text-xs font-bold uppercase text-slate-400">
              {t("cashShifts.openedBy")}
            </p>

            <p className="text-sm font-bold text-slate-800">
              {shift.opened_by_name || t("cashShifts.unknown")}
            </p>
          </div>
        </div>

        {!shift.is_open && (
          <div className="flex items-start gap-3">
            <User size={17} className="mt-0.5 text-slate-400" />

            <div>
              <p className="text-xs font-bold uppercase text-slate-400">
                {t("cashShifts.closedBy")}
              </p>

              <p className="text-sm font-bold text-slate-800">
                {shift.closed_by_name || t("cashShifts.unknown")}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <Clock size={17} className="mt-0.5 text-slate-400" />

          <div>
            <p className="text-xs font-bold uppercase text-slate-400">
              {t("cashShifts.openedAt")}
            </p>

            <p className="text-sm font-bold text-slate-800">
              {formatDateTime(
                shift.opened_at,
                language,
                t("cashShifts.notClosedYet")
              )}
            </p>
          </div>
        </div>

        {!shift.is_open && (
          <div className="flex items-start gap-3">
            <Clock size={17} className="mt-0.5 text-slate-400" />

            <div>
              <p className="text-xs font-bold uppercase text-slate-400">
                {t("cashShifts.closedAt")}
              </p>

              <p className="text-sm font-bold text-slate-800">
                {formatDateTime(
                  shift.closed_at,
                  language,
                  t("cashShifts.notClosedYet")
                )}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {onView && (
          <button
            type="button"
            onClick={() => onView(shift)}
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
          >
            {t("cashShifts.viewDetails")}
          </button>
        )}

        {shift.is_open && closeHandler && (
          <button
            type="button"
            onClick={() => closeHandler(shift)}
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-black"
          >
            {t("cashShifts.closeShift")}
          </button>
        )}
      </div>
    </div>
  );
}