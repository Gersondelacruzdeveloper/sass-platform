import {
  Building2,
  Save,
  Shield,
  Bell,
  CreditCard,
  Globe,
} from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
          Business configuration
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
          Settings
        </h1>

        <p className="mt-2 text-gray-500">
          Manage your disco profile, security, payments, notifications, and system preferences.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700">
                <Building2 size={22} />
              </div>

              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Disco Profile
                </h2>
                <p className="text-sm text-gray-500">
                  Public and internal business information.
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Business name
                </label>
                <input
                  type="text"
                  defaultValue="Gerson Disco"
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Business type
                </label>
                <input
                  type="text"
                  defaultValue="Nightclub / Disco"
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Phone
                </label>
                <input
                  type="text"
                  defaultValue="+1 809 000 0000"
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Currency
                </label>
                <select className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white">
                  <option>USD</option>
                  <option>DOP</option>
                  <option>EUR</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-semibold text-gray-700">
                  Address
                </label>
                <input
                  type="text"
                  defaultValue="Punta Cana, Dominican Republic"
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white"
                />
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-purple-100 p-3 text-purple-700">
                <CreditCard size={22} />
              </div>

              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Payment Settings
                </h2>
                <p className="text-sm text-gray-500">
                  Configure tax, card fees, and accepted payment methods.
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Card fee %
                </label>
                <input
                  type="number"
                  defaultValue={12}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Tax %
                </label>
                <input
                  type="number"
                  defaultValue={0}
                  className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Default payment
                </label>
                <select className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white">
                  <option>Cash</option>
                  <option>Card</option>
                  <option>Bank Transfer</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                <Bell size={22} />
              </div>

              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Notifications
                </h2>
                <p className="text-sm text-gray-500">
                  Choose which alerts owners and managers receive.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {[
                "Low stock alerts",
                "Daily sales summary",
                "Large expense alerts",
                "Employee login alerts",
              ].map((item) => (
                <label
                  key={item}
                  className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4"
                >
                  <span className="text-sm font-medium text-gray-700">
                    {item}
                  </span>

                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-5 w-5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                  />
                </label>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-3xl border border-gray-200 bg-slate-950 p-6 text-white shadow-sm">
            <div className="rounded-2xl bg-cyan-500/20 p-3 text-cyan-300 w-fit">
              <Shield size={24} />
            </div>

            <h2 className="mt-5 text-xl font-bold">Security Status</h2>

            <p className="mt-2 text-sm leading-6 text-slate-300">
              Your account uses secure session authentication with protected cookies and CSRF protection.
            </p>

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Session security</span>
                <span className="font-semibold text-emerald-400">Active</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">CSRF protection</span>
                <span className="font-semibold text-emerald-400">Enabled</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Employee roles</span>
                <span className="font-semibold text-cyan-300">Configured</span>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <Globe size={22} className="text-cyan-600" />
              <h2 className="text-lg font-bold text-gray-900">
                Regional Settings
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Language
                </label>
                <select className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white">
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">
                  Timezone
                </label>
                <select className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white">
                  <option>America/Santo_Domingo</option>
                  <option>America/New_York</option>
                  <option>Europe/London</option>
                </select>
              </div>
            </div>
          </div>

          <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-5 py-4 text-sm font-bold text-white shadow-lg transition hover:bg-cyan-600">
            <Save size={18} />
            Save Settings
          </button>
        </aside>
      </div>
    </div>
  );
}