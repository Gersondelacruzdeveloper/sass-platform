import { useState } from "react";
import {
  Bell,
  Building2,
  CheckCircle2,
  Lock,
  Palette,
  Save,
  Settings,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";

export default function DiscoSettingsPage() {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setTimeout(() => setSaving(false), 600);
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Settings"
        subtitle="Manage disco preferences, branding, security, notifications, and operational configuration."
        icon={Settings}
        actionLabel={saving ? "Saving..." : "Save"}
        onAction={handleSave}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title="Organisation"
          value="Active"
          icon={Building2}
          helper="Tenant settings"
        />

        <DiscoStatCard
          title="Security"
          value="Enabled"
          icon={ShieldCheck}
          helper="Protected access"
        />

        <DiscoStatCard
          title="Mobile"
          value="Ready"
          icon={Smartphone}
          helper="Mobile-first POS"
        />

        <DiscoStatCard
          title="Status"
          value="Live"
          icon={CheckCircle2}
          helper="System online"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-black text-slate-950">
              Organisation Settings
            </h2>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Business Name
              </span>
              <input
                placeholder="Example: Almond Brownie Disco"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Default Currency
              </span>
              <select className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white">
                <option value="USD">USD</option>
                <option value="DOP">DOP</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-black text-slate-950">Branding</h2>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Primary Color
              </span>
              <input
                type="color"
                defaultValue="#020617"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 p-2"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Accent Color
              </span>
              <input
                type="color"
                defaultValue="#f59e0b"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 p-2"
              />
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-black text-slate-950">
              Notifications
            </h2>
          </div>

          <div className="mt-5 space-y-3">
            {[
              "Low stock alerts",
              "New reservation alerts",
              "Cash shift reminders",
              "Daily sales summary",
            ].map((item) => (
              <label
                key={item}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <span className="text-sm font-bold text-slate-700">
                  {item}
                </span>
                <input type="checkbox" defaultChecked className="h-5 w-5" />
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-black text-slate-950">Security</h2>
          </div>

          <div className="mt-5 space-y-3">
            {[
              "Require login for POS",
              "Restrict reports to managers",
              "Track staff activity logs",
              "Require cash shift before sales",
            ].map((item) => (
              <label
                key={item}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <span className="text-sm font-bold text-slate-700">
                  {item}
                </span>
                <input type="checkbox" defaultChecked className="h-5 w-5" />
              </label>
            ))}
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60 sm:w-auto sm:px-6"
      >
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}