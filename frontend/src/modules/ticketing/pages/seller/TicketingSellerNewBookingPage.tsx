// src/modules/ticketing/pages/seller/TicketingSellerNewBookingPage.tsx

import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function TicketingSellerNewBookingPage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [searchParams] = useSearchParams();

  const slug = organisationSlug || "";
  const productId = searchParams.get("product");

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <p className="text-sm font-black uppercase tracking-wide text-amber-600">
          Seller Checkout
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">
          New booking
        </h1>
        <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
          This page is reserved for the dedicated seller checkout flow. The next
          step is to move the safe parts of the existing new booking page here,
          then show payment buttons based on seller permissions.
        </p>

        {productId && (
          <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
            Selected product ID: {productId}
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-black text-slate-950">
              Permission-driven buttons needed here
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              Add these actions based on seller permissions:
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                "Pay Deposit",
                "Pay Full",
                "Cash",
                "Generate Ticket",
                "Pending Payment",
                "Discount Field",
                "Manual Pickup Override",
                "Request Approval",
                "Send Receipt Before Full Payment",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-black text-slate-700"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Link
        to={`/ticketing/${slug}/seller/products`}
        className="inline-flex items-center gap-2 text-sm font-black text-amber-600 hover:text-amber-700"
      >
        Back to seller products
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
