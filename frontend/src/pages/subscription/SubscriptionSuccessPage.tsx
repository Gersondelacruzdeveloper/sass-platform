import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function SubscriptionSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const sessionId = searchParams.get("session_id");

  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          clearInterval(timer);

          navigate("/");

          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-14 w-14 text-green-600" />
          </div>

          <h1 className="text-3xl font-black text-slate-900">
            Subscription Successful
          </h1>

          <p className="mt-4 text-base text-slate-600">
            Thank you for subscribing.
          </p>

          <p className="mt-2 text-base text-slate-600">
            Your payment has been received and your organisation is being
            activated.
          </p>

          {sessionId && (
            <div className="mt-6 w-full rounded-2xl bg-slate-100 p-4 text-left">
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                Session ID
              </p>

              <p className="break-all font-mono text-sm text-slate-700">
                {sessionId}
              </p>
            </div>
          )}

          <div className="mt-8 flex items-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />

            <span className="font-medium">
              Redirecting in {countdown} seconds...
            </span>
          </div>

          <button
            onClick={() => navigate("/")}
            className="mt-8 w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}