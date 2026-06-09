import { ArrowLeft, CreditCard, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function SubscriptionCancelPage() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-14 w-14 text-red-600" />
          </div>

          <h1 className="text-3xl font-black text-slate-900">
            Subscription Cancelled
          </h1>

          <p className="mt-4 text-base text-slate-600">
            Your payment was not completed, so your organisation has not been
            activated yet.
          </p>

          <p className="mt-2 text-base text-slate-600">
            You can go back and choose a plan again when you are ready.
          </p>

          <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
            <button
              onClick={() => navigate("/register")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800"
            >
              <CreditCard className="h-4 w-4" />
              Choose Plan
            </button>

            <button
              onClick={() => navigate("/")}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}