// src/modules/disco/pages/DiscoTablesPage.tsx

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Crown,
  Plus,
  ReceiptText,
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

import {
  getOpenTableBills,
  openTableBill,
  type Sale,
} from "../api/salesApi";

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
  { value: "inactive", label: "Inactive" },
];

export default function DiscoTablesPage() {
  const { tables, loading, error, refresh } = useDiscoTables();

  const [search, setSearch] = useState("");
  const [localError, setLocalError] = useState("");
  const [saving, setSaving] = useState(false);
  const [openingBill, setOpeningBill] = useState(false);

  const [openBills, setOpenBills] = useState<Sale[]>([]);
  const [selectedBill, setSelectedBill] = useState<Sale | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<DiscoTable | null>(null);
  const [form, setForm] = useState(initialForm);

  async function loadOpenBills() {
    try {
      const bills = await getOpenTableBills();
      setOpenBills(bills);
    } catch (err) {
      console.error(err);
      setLocalError("Could not load open table bills.");
    }
  }

  async function refreshAll() {
    await Promise.all([refresh(), loadOpenBills()]);
  }

  useEffect(() => {
    loadOpenBills();
  }, []);

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
    const safeTables = tables as DiscoTable[];

    const available = safeTables.filter(
      (table) => table.status === "available"
    ).length;

    const occupied = safeTables.filter(
      (table) => table.status === "occupied"
    ).length;

    const reserved = safeTables.filter(
      (table) => table.status === "reserved"
    ).length;

    const vip = safeTables.filter((table) => table.is_vip).length;

    const totalCapacity = safeTables.reduce(
      (sum, table) => sum + Number(table.capacity || 0),
      0
    );

    return { available, occupied, reserved, vip, totalCapacity };
  }, [tables]);

  function findOpenBillForTable(tableId: number) {
    return openBills.find(
      (bill) =>
        bill.table === tableId &&
        bill.sale_type === "table" &&
        bill.status === "pending"
    );
  }

  async function handleTableClick(table: DiscoTable) {
    try {
      setLocalError("");

      if (table.status === "inactive") {
        setLocalError("This table is inactive and cannot be used.");
        return;
      }

      if (table.status === "cleaning") {
        setLocalError("This table is currently marked as cleaning.");
        return;
      }

      if (table.status === "occupied") {
        const existingBill = findOpenBillForTable(table.id);

        if (!existingBill) {
          setLocalError(
            "This table is occupied, but no open bill was found. Refresh or check the backend data."
          );
          return;
        }

        setSelectedBill(existingBill);
        return;
      }

      setOpeningBill(true);

      const bill = await openTableBill({
        table_id: table.id,
        customer_name: table.name,
      });

      setSelectedBill(bill);
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      setLocalError(
        err?.response?.data?.table_id?.[0] ||
          err?.response?.data?.table_id ||
          err?.response?.data?.detail ||
          "Could not open table bill."
      );
    } finally {
      setOpeningBill(false);
    }
  }

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

  function closeTableModal() {
    setModalOpen(false);
    setEditingTable(null);
    setForm(initialForm);
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

      closeTableModal();
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      setLocalError(
        err?.response?.data?.detail ||
          err?.response?.data?.name?.[0] ||
          "Could not save table."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Tables"
        subtitle="Open table bills, continue occupied tables, manage VIP sections, and control live table status."
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
          helper="Open bills"
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
              onClick={refreshAll}
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

        <p className="mt-3 text-xs font-semibold text-slate-500">
          Click an available table to open a bill. Click an occupied table to
          continue the open bill.
        </p>
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
          {filteredTables.map((table: DiscoTable) => {
            const openBill = findOpenBillForTable(table.id);

            return (
              <div key={table.id} className="relative">
                <div onClick={() => handleTableClick(table)}>
                  <TableCard
                    table={table as any}
                    onEdit={() => openEditModal(table)}
                  />
                </div>

                {openBill && (
                  <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white shadow-sm">
                    Bill #{openBill.id}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {openingBill && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-2xl">
          Opening table bill...
        </div>
      )}

      {selectedBill && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center">
          <div className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                  <ReceiptText className="h-4 w-4" />
                  Open Bill
                </div>

                <h2 className="text-xl font-black text-slate-950">
                  {selectedBill.table_name ||
                    selectedBill.table_number ||
                    selectedBill.customer_name ||
                    `Bill #${selectedBill.id}`}
                </h2>

                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Bill #{selectedBill.id} · Status: {selectedBill.status}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedBill(null)}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              {selectedBill.sale_items && selectedBill.sale_items.length > 0 ? (
                <div className="space-y-3">
                  {selectedBill.sale_items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3"
                    >
                      <div>
                        <p className="text-sm font-black text-slate-950">
                          {item.product_name || `Product #${item.product}`}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          Qty: {item.quantity} · Unit: {item.unit_price}
                        </p>
                      </div>

                      <p className="text-sm font-black text-slate-950">
                        {item.total}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm font-semibold text-slate-500">
                  No products added yet. Next step: connect the product selector
                  so the bartender can add drinks to this bill.
                </p>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="h-12 rounded-2xl border border-slate-200 bg-white text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                Add Products
              </button>

              <button
                type="button"
                className="h-12 rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800"
              >
                Checkout
              </button>
            </div>
          </div>
        </div>
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
                onClick={closeTableModal}
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