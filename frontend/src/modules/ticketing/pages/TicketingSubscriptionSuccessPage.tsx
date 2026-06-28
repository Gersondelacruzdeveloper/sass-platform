// src/modules/ticketing/pages/TicketingSubscriptionSuccessPage.tsx

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, LogIn, AlertCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import api from "../../../api/axios";

type CheckoutStatus = {
  payment_status?: string;
  organisation_name?: string;
  organisation_slug?: string;
  login_url?: string;
  is_active?: boolean;
  business_type?: string;
};

function buildTicketingLoginUrl(checkout: CheckoutStatus | null) {
  if (checkout?.organisation_slug) {
    return `/ticketing/${checkout.organisation_slug}/login`;
  }

  if (checkout?.login_url?.startsWith("/ticketing/")) {
    return checkout.login_url;
  }

  return "/ticketing/signup";
}

export default function TicketingSubscriptionSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkout, setCheckout] = useState<CheckoutStatus | null>(null);

  const loginUrl = useMemo(() => buildTicketingLoginUrl(checkout), [checkout]);

  useEffect(() => {
    let redirectTimer: number | undefined;

    async function verifySession() {
      if (!sessionId) {
        setError("Missing checkout session ID.");
        setLoading(false);
        return;
      }

      try {
        const response = await api.get<CheckoutStatus>(
          "/subscriptions/checkout-session-status/",
          {
            params: {
              session_id: sessionId,
            },
          }
        );

        setCheckout(response.data);

        const finalLoginUrl = buildTicketingLoginUrl(response.data);

        redirectTimer = window.setTimeout(() => {
          navigate(finalLoginUrl, { replace: true });
        }, 5000);
      } catch (err: any) {
        console.error("Ticketing subscription verification error:", err);

        setError(
          err?.response?.data?.detail ||
            err?.response?.data?.error ||
            err?.response?.data?.message ||
            "We could not verify your subscription. Please try again."
        );
      } finally {
        setLoading(false);
      }
    }

    verifySession();

    return () => {
      if (redirectTimer) {
        window.clearTimeout(redirectTimer);
      }
    };
  }, [sessionId, navigate]);

  const organisationName =
    checkout?.organisation_name ||
    checkout?.organisation_slug ||
    "your organisation";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-amber-100">
            {error ? (
              <AlertCircle className="h-14 w-14 text-red-600" />
            ) : (
              <CheckCircle2 className="h-14 w-14 text-amber-600" />
            )}
          </div>

          <p className="text-sm font-black uppercase tracking-[0.2em] text-amber-600">
            PCD Experiences
          </p>

          <h1 className="mt-3 text-3xl font-black text-slate-900">
            Subscription Success
          </h1>

          {loading ? (
            <div className="mt-8 flex items-center gap-3 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="font-medium">
                Activating your Ticketing organisation...
              </span>
            </div>
          ) : error ? (
            <>
              <p className="mt-4 text-sm font-semibold text-red-600">
                {error}
              </p>

              <button
                type="button"
                onClick={() => navigate("/ticketing/signup")}
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800"
              >
                Back to signup
              </button>
            </>
          ) : (
            <>
              <p className="mt-4 text-base text-slate-600">
                Payment successful.
              </p>

              <p className="mt-2 text-base text-slate-600">
                <strong>{organisationName}</strong> has been created
                successfully.
              </p>

              <div className="mt-6 w-full rounded-2xl bg-slate-100 p-4 text-left">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Ticketing login URL
                </p>

                <p className="mt-1 break-all text-sm font-semibold text-slate-800">
                  {loginUrl}
                </p>
              </div>

              <div className="mt-8 flex items-center gap-3 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="font-medium">
                  Redirecting to Ticketing login...
                </span>
              </div>

              <button
                type="button"
                onClick={() => navigate(loginUrl, { replace: true })}
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800"
              >
                <LogIn className="h-4 w-4" />
                Continue to Ticketing Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}