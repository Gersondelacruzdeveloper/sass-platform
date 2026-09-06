import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  partnerNetworkApi,
  type ReferralQRCode,
} from "../api/partnerNetworkApi";

export default function ReferralPartnerQrPage() {
  const { organisationSlug = "" } = useParams();
  const [qrs, setQrs] = useState<ReferralQRCode[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    partnerNetworkApi
      .getPartnerQRs(organisationSlug)
      .then(setQrs)
      .catch(() => setError("QR codes could not be loaded."));
  }, [organisationSlug]);

  return (
    <section>
      <h1 className="text-3xl font-black text-slate-950">My QR</h1>
      <p className="mt-2 text-sm font-semibold text-slate-500">
        Place this where your guests can easily scan it.
      </p>

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {qrs.map((qr) => (
          <div key={qr.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="font-black text-slate-950">{qr.property_name}</div>
            <div className="mt-1 text-sm text-slate-500">{qr.scan_count} scans</div>
            <div className="mt-5 flex flex-wrap gap-3">
              <a
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white"
                href={qr.public_url}
                target="_blank"
                rel="noreferrer"
              >
                Test QR link
              </a>
              <a
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-black"
                href={partnerNetworkApi.partnerQRDownloadUrl(organisationSlug, qr.id)}
              >
                Download PNG
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
