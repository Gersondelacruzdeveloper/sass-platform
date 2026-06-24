import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CreditCard,
  Headphones,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../../../api/axios";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

export default function DiscoBillingLockedPage() {
  const navigate = useNavigate();
  const { organisationSlug } = useParams();
  const { language, setLanguage, t } = useDiscoTranslation();

  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState("");

  async function handleUpdatePayment() {
    try {
      setOpeningPortal(true);
      setError("");

      const response = await api.post("/subscriptions/customer-portal/");

      window.location.href = response.data.portal_url;
    } catch (err: any) {
      console.error("Could not open billing portal:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.stripe_error ||
          t("billing.errorOpenPortal")
      );
    } finally {
      setOpeningPortal(false);
    }
  }

  function openWhatsAppSupport() {
    const message = encodeURIComponent(t("billing.whatsappMessage"));

    window.open(
      `https://wa.me/18292380483?text=${message}`,
      "_blank"
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex justify-end">
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
            {t("billing.language")}

            <select
              value={language}
              aria-label={t("billing.language")}
              onChange={(event) =>
                setLanguage(event.target.value as DiscoLanguage)
              }
              className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-700 outline-none"
            >
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-amber-100">
            <Lock className="h-12 w-12 text-amber-600" />
          </div>

          <p className="text-sm font-black uppercase tracking-wide text-amber-600">
            {t("billing.subscriptionRequired")}
          </p>

          <h1 className="mt-2 text-3xl font-black text-slate-950">
            {t("billing.title")}
          </h1>

          <p className="mt-4 max-w-xl text-base font-medium text-slate-600">
            {t("billing.description")}
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />

            <h3 className="mt-4 font-black text-slate-950">
              {t("billing.dataProtected")}
            </h3>

            <p className="mt-2 text-sm font-medium text-slate-500">
              {t("billing.dataProtectedDescription")}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <AlertTriangle className="h-6 w-6 text-amber-600" />

            <h3 className="mt-4 font-black text-slate-950">
              {t("billing.accessPaused")}
            </h3>

            <p className="mt-2 text-sm font-medium text-slate-500">
              {t("billing.accessPausedDescription")}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <CreditCard className="h-6 w-6 text-cyan-600" />

            <h3 className="mt-4 font-black text-slate-950">
              {t("billing.reactivate")}
            </h3>

            <p className="mt-2 text-sm font-medium text-slate-500">
              {t("billing.reactivateDescription")}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="font-black text-amber-900">
            {t("billing.whatNow")}
          </h3>

          <ul className="mt-3 space-y-2 text-sm font-medium text-amber-800">
            <li>• {t("billing.optionUpdateCard")}</li>
            <li>• {t("billing.optionRetryPayment")}</li>
            <li>• {t("billing.optionContactSupport")}</li>
          </ul>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={handleUpdatePayment}
            disabled={openingPortal}
            className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {openingPortal ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}

            {openingPortal ? t("billing.opening") : t("billing.updatePayment")}
          </button>

          <button
            type="button"
            onClick={openWhatsAppSupport}
            className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Headphones className="h-4 w-4" />
            {t("billing.whatsappSupport")}
          </button>

          <button
            type="button"
            onClick={() => navigate(`/disco/${organisationSlug || ""}/login`)}
            className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            {t("billing.backToLogin")}
          </button>
        </div>
      </div>
    </div>
  );
}