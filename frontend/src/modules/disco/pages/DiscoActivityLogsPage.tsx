import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, RefreshCcw, Search } from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import DiscoDataTable from "../components/DiscoDataTable";
import { getDiscoActivityLogs } from "../api/discoApi";

type ActivityLog = {
  id: number;
  user?: number | null;
  user_name?: string | null;
  action: string;
  description: string;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function DiscoActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function loadLogs(isRefresh = false) {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError("");

      const data = await getDiscoActivityLogs();
      setLogs(Array.isArray(data) ? data : (data as any).results || []);
    } catch (err) {
      console.error(err);
      setError("Could not load activity logs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;

    return logs.filter((log) =>
      [
        log.action,
        log.description,
        log.user_name,
        formatDate(log.created_at),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [logs, search]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return logs.filter(
      (log) => new Date(log.created_at).toDateString() === today
    ).length;
  }, [logs]);

  const uniqueUsers = useMemo(() => {
    return new Set(logs.map((log) => log.user_name || "System")).size;
  }, [logs]);

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Activity Logs"
        subtitle="Monitor staff actions, sales updates, inventory changes, reservations, and system activity."
        icon={Activity}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DiscoStatCard
          title="Total Logs"
          value={logs.length}
          icon={Activity}
          helper="All recorded activity"
        />

        <DiscoStatCard
          title="Today"
          value={todayCount}
          icon={RefreshCcw}
          helper="Actions recorded today"
        />

        <DiscoStatCard
          title="Users"
          value={uniqueUsers}
          icon={Activity}
          helper="Active users in logs"
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search logs..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <button
            type="button"
            onClick={() => loadLogs(true)}
            disabled={refreshing}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      ) : filteredLogs.length === 0 ? (
        <DiscoEmptyState
          icon={Activity}
          title="No activity logs found"
          description="Activity will appear here when your team creates sales, updates inventory, manages tables, or changes reservations."
        />
      ) : (
        <DiscoDataTable
          data={filteredLogs}
          columns={[
            {
              key: "action",
              label: "Action",
              render: (log: ActivityLog) => (
                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-700">
                  {log.action || "Activity"}
                </span>
              ),
            },
            {
              key: "description",
              label: "Description",
              render: (log: ActivityLog) => (
                <p className="max-w-xl text-sm font-semibold text-slate-700">
                  {log.description}
                </p>
              ),
            },
            {
              key: "user",
              label: "User",
              render: (log: ActivityLog) => (
                <span className="text-sm font-bold text-slate-600">
                  {log.user_name || "System"}
                </span>
              ),
            },
            {
              key: "date",
              label: "Date",
              render: (log: ActivityLog) => (
                <span className="text-sm font-bold text-slate-500">
                  {formatDate(log.created_at)}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}