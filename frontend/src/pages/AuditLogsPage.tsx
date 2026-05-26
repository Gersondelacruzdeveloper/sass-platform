import {
  ShieldCheck,
  Search,
  Clock3,
  User,
  AlertTriangle,
  CheckCircle2,
  MoreVertical,
  Download,
} from "lucide-react";

const logs = [
  {
    id: "LOG-1001",
    user: "Ana Rivera",
    action: "Completed POS sale",
    module: "POS",
    status: "Success",
    ip: "192.168.1.24",
    time: "Today, 10:42 PM",
  },
  {
    id: "LOG-1002",
    user: "Carlos Méndez",
    action: "Modified inventory stock",
    module: "Inventory",
    status: "Warning",
    ip: "192.168.1.18",
    time: "Today, 10:15 PM",
  },
  {
    id: "LOG-1003",
    user: "Admin",
    action: "Updated employee permissions",
    module: "Employees",
    status: "Success",
    ip: "192.168.1.2",
    time: "Today, 9:48 PM",
  },
  {
    id: "LOG-1004",
    user: "Luis Peña",
    action: "Deleted open tab",
    module: "Open Tabs",
    status: "Critical",
    ip: "192.168.1.44",
    time: "Today, 9:21 PM",
  },
];

export default function AuditLogsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Security & monitoring
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Audit Logs
          </h1>

          <p className="mt-2 text-gray-500">
            Monitor employee activity, stock changes, sales actions, and system security events.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Download size={18} />
          Export Logs
        </button>
      </div>

      {/* KPI */}
      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <ShieldCheck className="text-cyan-600" />

          <p className="mt-4 text-sm text-gray-500">
            Security events
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            128
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <User className="text-purple-600" />

          <p className="mt-4 text-sm text-gray-500">
            Employee actions
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            1,248
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <AlertTriangle className="text-orange-600" />

          <p className="mt-4 text-sm text-gray-500">
            Warnings today
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            4
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Clock3 className="text-emerald-600" />

          <p className="mt-4 text-sm text-gray-500">
            Last sync
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            2m ago
          </h2>
        </div>
      </div>

      {/* Logs Table */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Activity Logs
            </h2>

            <p className="text-sm text-gray-500">
              Real-time employee and system activity tracking.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 md:w-80">
            <Search size={18} className="text-gray-400" />

            <input
              type="text"
              placeholder="Search logs..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-3">Log ID</th>
                <th className="pb-3">User</th>
                <th className="pb-3">Action</th>
                <th className="pb-3">Module</th>
                <th className="pb-3">IP Address</th>
                <th className="pb-3">Time</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => {
                const statusStyles = {
                  Success:
                    "bg-emerald-100 text-emerald-700",
                  Warning:
                    "bg-yellow-100 text-yellow-700",
                  Critical:
                    "bg-red-100 text-red-700",
                };

                return (
                  <tr key={log.id}>
                    <td className="py-5 font-semibold text-gray-900">
                      {log.id}
                    </td>

                    <td className="py-5 text-gray-700">
                      {log.user}
                    </td>

                    <td className="py-5">
                      <div>
                        <p className="font-medium text-gray-900">
                          {log.action}
                        </p>

                        <p className="text-sm text-gray-500">
                          {log.module}
                        </p>
                      </div>
                    </td>

                    <td className="py-5">
                      <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-700">
                        {log.module}
                      </span>
                    </td>

                    <td className="py-5 text-gray-500">
                      {log.ip}
                    </td>

                    <td className="py-5 text-gray-500">
                      {log.time}
                    </td>

                    <td className="py-5">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                          statusStyles[
                            log.status as keyof typeof statusStyles
                          ]
                        }`}
                      >
                        <CheckCircle2 size={14} />
                        {log.status}
                      </span>
                    </td>

                    <td className="py-5 text-right">
                      <button className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Summary */}
      <div className="rounded-3xl border border-gray-200 bg-slate-950 p-6 text-white shadow-sm">
        <h2 className="text-lg font-bold">
          Security Overview
        </h2>

        <p className="mt-2 text-sm leading-6 text-slate-300">
          Your disco platform is actively monitoring employee actions,
          inventory modifications, POS sales, refunds, login attempts,
          and permission changes.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-sm text-slate-400">
              Failed logins
            </p>

            <h3 className="mt-2 text-2xl font-bold">
              0
            </h3>
          </div>

          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-sm text-slate-400">
              Permission changes
            </p>

            <h3 className="mt-2 text-2xl font-bold">
              3
            </h3>
          </div>

          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-sm text-slate-400">
              Suspicious actions
            </p>

            <h3 className="mt-2 text-2xl font-bold">
              1
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
}