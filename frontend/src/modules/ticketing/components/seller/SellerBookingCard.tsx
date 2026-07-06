// src/modules/ticketing/components/seller/SellerBookingCard.tsx

import type { Booking } from "../../types/ticketingTypes";

type SellerBookingCardProps = {
  booking: Booking;
};

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

export default function SellerBookingCard({ booking }: SellerBookingCardProps) {
  const productName =
    booking.primary_product_detail?.name ||
    booking.items?.[0]?.product_name ||
    "Booking";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-slate-950">
              {booking.booking_code}
            </p>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              {booking.payment_status.replaceAll("_", " ")}
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
              {booking.status.replaceAll("_", " ")}
            </span>
          </div>

          <h3 className="mt-2 text-lg font-black text-slate-950">
            {booking.customer_name || booking.customer_detail?.full_name}
          </h3>

          <p className="mt-1 text-sm font-semibold text-slate-500">
            {productName}
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-400">
            Service date: {booking.service_date || "Not set"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm lg:min-w-[420px] lg:grid-cols-4">
          <div>
            <p className="font-bold text-slate-400">Total</p>
            <p className="font-black text-slate-950">{money(booking.total_amount)}</p>
          </div>

          <div>
            <p className="font-bold text-slate-400">Balance</p>
            <p className="font-black text-slate-950">{money(booking.balance_due)}</p>
          </div>

          <div>
            <p className="font-bold text-slate-400">Collected</p>
            <p className="font-black text-slate-950">
              {money(booking.seller_collected_amount)}
            </p>
          </div>

          <div>
            <p className="font-bold text-slate-400">Commission</p>
            <p className="font-black text-slate-950">
              {money(booking.seller_commission_amount)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
