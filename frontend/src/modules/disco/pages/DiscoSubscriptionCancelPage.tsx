import { CreditCard, LogIn, MessageCircle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

export default function DiscoSubscriptionCancelPage() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useDiscoTranslation();

  function openWhatsAppSupport() {
    const message = encodeURIComponent(
      "Hello Punta Cana Discovery Support, I need assistance with my subscription checkout."
    );

    window.open(`https://wa.me/18292380483?text=${message}`, "_blank");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 flex justify-end">
          <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
            {t("subscription.language")}

            <select
              value={language}
              aria-label={t("subscription.language")}
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
            <XCircle className="h-14 w-14 text-amber-600" />
          </div>

          <h1 className="text-3xl font-black text-slate-900">
            {t("subscription.cancelTitle")}
          </h1>

          <p className="mt-4 text-base font-medium leading-7 text-slate-600">
            {t("subscription.cancelDescription")}
          </p>

          <div className="mt-6 w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-700">
            {t("subscription.noPaymentTaken")}
          </div>

          <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate("/disco/signup")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <CreditCard className="h-4 w-4" />
              {t("subscription.returnToSignup")}
            </button>

            <button
              type="button"
              onClick={() => navigate("/disco/signup")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <LogIn className="h-4 w-4" />
              {t("subscription.backToLogin")}
            </button>
          </div>

          <div className="mt-6 w-full rounded-3xl bg-slate-50 p-4">
            <h2 className="text-sm font-black text-slate-900">
              {t("subscription.needHelp")}
            </h2>

            <p className="mt-1 text-sm font-medium text-slate-500">
              {t("subscription.supportDescription")}
            </p>

            <button
              type="button"
              onClick={openWhatsAppSupport}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp Support
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}