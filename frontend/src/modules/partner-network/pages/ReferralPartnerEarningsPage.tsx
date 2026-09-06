import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  partnerNetworkApi,
  type ReferralCommission,
  type ReferralPayout,
} from "../api/partnerNetworkApi";

export default function ReferralPartnerEarningsPage() {
  const { organisationSlug = "" } = useParams();
  const [commissions, setCommissions] = useState<ReferralCommission[]>([]);
  const [payouts, setPayouts] = useState<ReferralPayout[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    partnerNetworkApi
      .getPartnerEarnings(organisationSlug)
      .then((data) => {
        setCommissions(data.commissions);
        setPayouts(data.payouts);
      })
      .catch(() => setError("Earnings could not be loaded."));
  }, [organisationSlug]);

  return (
    <section>
      <h1 className="text-3xl font-black">Earnings & Payouts</h1>

      {error && (
        <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-3xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-4">Booking</th>
              <th className="p-4">Amount</th>
              <th className="p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {commissions.map((commission) => (
              <tr key={commission.id} className="border-t">
                <td className="p-4 font-bold">{commission.booking_code || `#${commission.id}`}</td>
                <td className="p-4 font-black">
                  {commission.currency} {commission.amount}
                </td>
                <td className="p-4 capitalize">{commission.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-xl font-black">Payout history</h2>
      <div className="mt-3 grid gap-3">
        {payouts.map((payout) => (
          <div key={payout.id} className="rounded-2xl border bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-black">
                  {payout.period_start} – {payout.period_end}
                </div>
                <div className="text-xs font-semibold capitalize text-slate-500">
                  {payout.status}
                </div>
              </div>
              <div className="text-lg font-black">
                {payout.currency} {payout.total_amount}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
