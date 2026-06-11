import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, LogIn } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import api from "../../../api/axios";

type CheckoutStatus = {
  payment_status: string;
  organisation_name: string;
  organisation_slug: string;
  login_url: string;
  is_active: boolean;
};

export default function DiscoSubscriptionSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sessionId = searchParams.get("session_id");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkout, setCheckout] = useState<CheckoutStatus | null>(null);

  useEffect(() => {
    async function verifySession() {
      if (!sessionId) {
        setError("Missing Stripe checkout session.");
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(
          `/subscriptions/checkout-session-status/?session_id=${sessionId}`
        );

        setCheckout(response.data);

        setTimeout(() => {
          navigate(response.data.login_url);
        }, 5000);
      } catch (err) {
        console.error(err);
        setError("Could not verify your payment. Please contact support.");
      } finally {
        setLoading(false);
      }
    }

    verifySession();
  }, [sessionId, navigate]);

  const loginUrl = checkout?.login_url || "/disco/signup";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-14 w-14 text-green-600" />
          </div>

          <h1 className="text-3xl font-black text-slate-900">
            Disco Subscription Successful
          </h1>

          {loading ? (
            <div className="mt-8 flex items-center gap-3 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="font-medium">Activating your organisation...</span>
            </div>
          ) : error ? (
            <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>
          ) : (
            <>
              <p className="mt-4 text-base text-slate-600">
                Your payment was successful.
              </p>

              <p className="mt-2 text-base text-slate-600">
                <strong>{checkout?.organisation_name}</strong> has been created.
              </p>

              <div className="mt-6 w-full rounded-2xl bg-slate-100 p-4 text-left">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Login URL
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-800">
                  {loginUrl}
                </p>
              </div>

              <div className="mt-8 flex items-center gap-3 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="font-medium">
                  Redirecting to Disco login...
                </span>
              </div>

              <button
                type="button"
                onClick={() => navigate(loginUrl)}
                className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800"
              >
                <LogIn className="h-4 w-4" />
                Continue to Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}