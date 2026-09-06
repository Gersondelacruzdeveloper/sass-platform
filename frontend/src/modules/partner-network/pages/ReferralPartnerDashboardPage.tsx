import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import MetricCard from "../components/MetricCard";
import {
  partnerNetworkApi,
  type PartnerMetrics,
  type PartnerPortalBootstrap,
} from "../api/partnerNetworkApi";

const money = (value: unknown) => `$${Number(value || 0).toFixed(2)}`;

export default function ReferralPartnerDashboardPage() {
  const { organisationSlug = "" } = useParams();
  const [metrics, setMetrics] = useState<PartnerMetrics | null>(null);
  const [bootstrap, setBootstrap] = useState<PartnerPortalBootstrap | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      partnerNetworkApi.getPartnerBootstrap(organisationSlug),
      partnerNetworkApi.getPartnerDashboard(organisationSlug),
    ])
      .then(([nextBootstrap, nextMetrics]) => {
        setBootstrap(nextBootstrap);
        setMetrics(nextMetrics);
      })
      .catch(() => setError("Partner Network access is unavailable."));
  }, [organisationSlug]);

  if (error) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-white p-6 font-bold text-rose-700">
        {error}
      </div>
    );
  }

  return (
    <section>
      <div className="mb-6">
        <div className="text-sm font-black text-sky-700">
          {bootstrap?.partner.name ?? "Partner"}
        </div>
        <h1 className="text-3xl font-black text-slate-950">
          Put up your QR. We do the rest.
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-500">
          Your guests book through Punta Cana Discovery AI and your commission is tracked automatically.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="This month" value={money(metrics?.this_month_paid)} />
        <MetricCard label="Pending" value={money(metrics?.pending_earnings)} />
        <MetricCard label="Paid" value={money(metrics?.paid_earnings)} />
        <MetricCard label="Bookings" value={metrics?.bookings ?? 0} />
        <MetricCard label="QR scans" value={metrics?.qr_scans ?? 0} />
        <MetricCard label="Conversion" value={`${Number(metrics?.conversion_rate || 0).toFixed(1)}%`} />
      </div>
    </section>
  );
}
