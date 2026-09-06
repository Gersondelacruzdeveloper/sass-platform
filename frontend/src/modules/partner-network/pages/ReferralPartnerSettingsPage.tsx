import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import {
  partnerNetworkApi,
  type ReferralPartnerLocation,
} from "../api/partnerNetworkApi";

export default function ReferralPartnerSettingsPage() {
  const { organisationSlug = "" } = useParams();
  const [locations, setLocations] = useState<ReferralPartnerLocation[]>([]);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    partnerNetworkApi
      .getPartnerBootstrap(organisationSlug)
      .then((response) => setLocations(response.locations))
      .catch(() => setError("Concierge settings could not be loaded."));
  }, [organisationSlug]);

  const update = (
    id: number,
    field: keyof ReferralPartnerLocation,
    value: string,
  ) => {
    setLocations((current) =>
      current.map((location) =>
        location.id === id ? { ...location, [field]: value } : location,
      ),
    );
  };

  const save = async (location: ReferralPartnerLocation) => {
    try {
      const updated = await partnerNetworkApi.updatePartnerLocationSettings(
        organisationSlug,
        location.id,
        {
          display_name: location.display_name,
          welcome_message: location.welcome_message,
          property_information: location.property_information,
          concierge_introduction: location.concierge_introduction,
        },
      );
      setLocations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSaved(`Saved ${location.display_name}`);
      setError("");
    } catch {
      setError("The concierge settings could not be saved.");
    }
  };

  return (
    <section>
      <h1 className="text-3xl font-black">Concierge Settings</h1>
      <p className="mt-2 text-sm font-semibold text-slate-500">
        Customize property-facing information only. Prices, commissions and core AI rules remain controlled by Punta Cana Discovery.
      </p>

      {saved && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
          {saved}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-5">
        {locations.map((location) => (
          <div key={location.id} className="rounded-3xl border bg-white p-6 shadow-sm">
            <label className="block text-xs font-black uppercase text-slate-500">
              Property name
            </label>
            <input
              className="mt-2 w-full rounded-xl border p-3"
              value={location.display_name}
              onChange={(event) => update(location.id, "display_name", event.target.value)}
            />

            <label className="mt-4 block text-xs font-black uppercase text-slate-500">
              Welcome message
            </label>
            <textarea
              className="mt-2 w-full rounded-xl border p-3"
              rows={3}
              value={location.welcome_message ?? ""}
              onChange={(event) => update(location.id, "welcome_message", event.target.value)}
            />

            <label className="mt-4 block text-xs font-black uppercase text-slate-500">
              Property information
            </label>
            <textarea
              className="mt-2 w-full rounded-xl border p-3"
              rows={4}
              value={location.property_information ?? ""}
              onChange={(event) => update(location.id, "property_information", event.target.value)}
            />

            <label className="mt-4 block text-xs font-black uppercase text-slate-500">
              Concierge introduction
            </label>
            <textarea
              className="mt-2 w-full rounded-xl border p-3"
              rows={3}
              value={location.concierge_introduction ?? ""}
              onChange={(event) => update(location.id, "concierge_introduction", event.target.value)}
            />

            <button
              onClick={() => save(location)}
              className="mt-4 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white"
            >
              Save
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
