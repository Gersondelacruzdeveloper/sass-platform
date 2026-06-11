import { useMemo, useState } from "react";
import {
  AlertCircle,
  Crown,
  Plus,
  RefreshCcw,
  Search,
  Table2,
  Users,
  X,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import TableCard from "../components/TableCard";

import { useDiscoTables } from "../hooks/useDiscoTables";
import {
  createTable,
  updateTable,
  type DiscoTable,
  type TableStatus,
} from "../api/tablesApi";

const initialForm = {
  name: "",
  floor: "",
  capacity: "2",
  minimum_spend: "",
  status: "available" as TableStatus,
  is_vip: false,
};

const statusOptions: { value: TableStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "occupied", label: "Occupied" },
  { value: "reserved", label: "Reserved" },
  { value: "cleaning", label: "Cleaning" },
];

export default function DiscoTablesPage() {
  const { tables, loading, error, refresh } = useDiscoTables();

  const [search, setSearch] = useState("");
  const [localError, setLocalError] = useState("");
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<DiscoTable | null>(null);
  const [form, setForm] = useState(initialForm);

  const filteredTables = useMemo<DiscoTable[]>(() => {
    const term = search.trim().toLowerCase();
    const safeTables = tables as DiscoTable[];
    if (!term) return safeTables;

    return safeTables.filter((table) =>
      [
        table.name,
        table.floor,
        table.capacity,
        table.minimum_spend,
        table.status,
        table.is_vip ? "vip" : "regular",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [tables, search]);

  const stats = useMemo(() => {
    const available = tables.filter((table: any) => table.status === "available").length;

    const occupied = tables.filter((table: any) => table.status === "occupied").length;

    const reserved = tables.filter((table: any) => table.status === "reserved").length;

    const vip = tables.filter((table: any) => table.is_vip).length;

    const totalCapacity = tables.reduce(
      (sum: number, table: any) => sum + Number(table.capacity || 0),
      0
    );

    return { available, occupied, reserved, vip, totalCapacity };
  }, [tables]);

  function openCreateModal() {
    setEditingTable(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEditModal(table: DiscoTable) {
    setEditingTable(table);
    setForm({
      name: table.name || "",
      floor: table.floor || "",
      capacity: String(table.capacity || 2),
      minimum_spend: String(table.minimum_spend || ""),
      status: table.status || "available",
      is_vip: Boolean(table.is_vip),
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setLocalError("");

      const payload = {
        name: form.name,
        floor: form.floor,
        capacity: Number(form.capacity || 0),
        minimum_spend: Number(form.minimum_spend || 0),
        status: form.status,
        is_vip: form.is_vip,
      };

      if (editingTable) {
        await updateTable(editingTable.id, payload);
      } else {
        await createTable(payload);
      }

      setModalOpen(false);
      setEditingTable(null);
      setForm(initialForm);
      await refresh();
    } catch (err) {
      console.error(err);
      setLocalError("Could not save table.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Tables"
        subtitle="Manage VIP tables, capacity, floors, minimum spend, and live table status."
        icon={Table2}
        actionLabel="New Table"
        onAction={openCreateModal}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title="Available"
          value={stats.available}
          icon={Table2}
          helper="Ready for guests"
        />

        <DiscoStatCard
          title="Occupied"
          value={stats.occupied}
          icon={Users}
          helper="Currently in use"
        />

        <DiscoStatCard
          title="Reserved"
          value={stats.reserved}
          icon={RefreshCcw}
          helper="Reserved tables"
        />

        <DiscoStatCard
          title="VIP Tables"
          value={stats.vip}
          icon={Crown}
          helper={`Capacity: ${stats.totalCapacity}`}
        />
      </section>

      {(error || localError) && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error || localError}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tables..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-52 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      ) : filteredTables.length === 0 ? (
        <DiscoEmptyState
          icon={Table2}
          title="No tables found"
          description="Create tables for VIP areas, reservations, table service, and POS orders."
        />
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredTables.map((table: DiscoTable) => (
            <TableCard
              key={table.id}
              table={table as any}
              onEdit={() => openEditModal(table)}
            />
          ))}
        </section>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center">
          <form
            onSubmit={handleSubmit}
            className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {editingTable ? "Edit Table" : "New Table"}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Configure table name, floor, capacity, minimum spend, and VIP
                  status.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">
                  Table Name
                </span>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                  placeholder="Example: VIP 01"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Floor</span>
                <input
                  value={form.floor}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, floor: e.target.value }))
                  }
                  placeholder="Example: Main Floor"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Capacity
                </span>
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      capacity: e.target.value,
                    }))
                  }
                  required
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Minimum Spend
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimum_spend}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      minimum_spend: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Status
                </span>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      status: e.target.value as TableStatus,
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                >
                  {statusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <div>
                  <p className="text-sm font-black text-slate-950">
                    VIP Table
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Mark this table for VIP sections, bottle service, or premium
                    reservations.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={form.is_vip}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      is_vip: e.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : editingTable
                  ? "Save Changes"
                  : "Create Table"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}