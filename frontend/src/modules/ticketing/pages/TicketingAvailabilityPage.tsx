// src/modules/ticketing/pages/TicketingAvailabilityPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Copy,
  Edit3,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";

import api from "../../../api/axios";

type ProductType =
  | "excursion"
  | "transfer"
  | "ticket"
  | "event"
  | "nightlife"
  | "custom";

type ProductStatus = "draft" | "active" | "inactive" | "sold_out" | "archived";

type ExperienceProduct = {
  id: number;
  name: string;
  slug: string;
  product_type: ProductType;
  status: ProductStatus;
  public_enabled: boolean;
  capacity?: number | string | null;
  base_price?: number | string | null;
  deposit_amount?: number | string | null;
};

type ProductAvailability = {
  id: number;
  product: number;
  product_name?: string;
  package?: number | null;
  package_name?: string | null;
  date: string;
  available_capacity: number;
  booked_quantity: number;
  remaining_capacity?: number;
  price_override?: string | number | null;
  deposit_override?: string | number | null;
  is_available: boolean;
  note: string;
  created_at?: string;
  updated_at?: string;
};

type AvailabilityForm = {
  id?: number;
  product_id: string;
  date: string;
  available_capacity: string;
  booked_quantity: string;
  price_override: string;
  deposit_override: string;
  is_available: boolean;
  note: string;
};

type BulkForm = {
  product_id: string;
  start_date: string;
  end_date: string;
  weekdays: string[];
  available_capacity: string;
  price_override: string;
  deposit_override: string;
  is_available: boolean;
  note: string;
};

const emptyForm: AvailabilityForm = {
  product_id: "",
  date: "",
  available_capacity: "0",
  booked_quantity: "0",
  price_override: "",
  deposit_override: "",
  is_available: true,
  note: "",
};

const emptyBulkForm: BulkForm = {
  product_id: "",
  start_date: "",
  end_date: "",
  weekdays: ["0", "1", "2", "3", "4", "5", "6"],
  available_capacity: "0",
  price_override: "",
  deposit_override: "",
  is_available: true,
  note: "",
};

const weekdayOptions = [
  { value: "0", label: "Mon" },
  { value: "1", label: "Tue" },
  { value: "2", label: "Wed" },
  { value: "3", label: "Thu" },
  { value: "4", label: "Fri" },
  { value: "5", label: "Sat" },
  { value: "6", label: "Sun" },
];

function getRequestParams(organisationSlug?: string) {
  return {
    slug: organisationSlug,
    organisation_slug: organisationSlug,
  };
}

function normalizeList<T>(data: T[] | { results?: T[] } | unknown): T[] {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object" && Array.isArray((data as any).results)) {
    return (data as any).results;
  }

  return [];
}

function getErrorMessage(err: any, fallback: string) {
  const data = err?.response?.data;

  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  if (data.message) return String(data.message);
  if (data.error) return String(data.error);

  const firstKey = Object.keys(data)[0];

  if (firstKey) {
    const value = data[firstKey];

    if (Array.isArray(value)) return `${firstKey}: ${value.join(", ")}`;
    return `${firstKey}: ${String(value)}`;
  }

  return fallback;
}

function productTypeLabel(value: ProductType) {
  if (value === "excursion") return "Excursion";
  if (value === "transfer") return "Transfer";
  if (value === "ticket") return "Ticket";
  if (value === "event") return "Event";
  if (value === "nightlife") return "Nightlife";
  return "Custom";
}

function formatMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "Default";

  const number = Number(value);

  if (Number.isNaN(number)) return String(value);

  return `US$ ${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getDateLabel(value: string) {
  if (!value) return "No date";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getBackendDayFromDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return "";

  // JS: Sunday=0. Backend in this module: Monday=0, Sunday=6.
  const jsDay = date.getDay();

  return String((jsDay + 6) % 7);
}

function getDatesBetween(startDate: string, endDate: string, weekdays: string[]) {
  if (!startDate || !endDate) return [];

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (start > end) return [];

  const result: string[] = [];
  const current = new Date(start);

  while (current <= end) {
    const iso = current.toISOString().slice(0, 10);
    const day = getBackendDayFromDate(iso);

    if (weekdays.includes(day)) {
      result.push(iso);
    }

    current.setDate(current.getDate() + 1);
  }

  return result;
}

function toNumber(value: string, fallback = 0) {
  const number = Number(value);

  if (Number.isNaN(number)) return fallback;

  return number;
}

function toNullableDecimal(value: string) {
  if (value === "") return null;

  return value;
}

export default function TicketingAvailabilityPage() {
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [availability, setAvailability] = useState<ProductAvailability[]>([]);

  const [form, setForm] = useState<AvailabilityForm>(emptyForm);
  const [bulkForm, setBulkForm] = useState<BulkForm>(emptyBulkForm);

  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  async function loadData() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const [productsResponse, availabilityResponse] = await Promise.all([
        api.get("/ticketing/products/", {
          params: requestParams,
        }),
        api.get("/ticketing/availability/", {
          params: requestParams,
        }),
      ]);

      setProducts(normalizeList<ExperienceProduct>(productsResponse.data));
      setAvailability(
        normalizeList<ProductAvailability>(availabilityResponse.data)
      );
    } catch (err: any) {
      console.error("Could not load availability:", err);

      setError(
        getErrorMessage(
          err,
          "No se pudo cargar la disponibilidad de productos."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [organisationSlug]);

  const activeProducts = useMemo(() => {
    return products.filter((product) => product.status !== "archived");
  }, [products]);

  const selectedProduct = useMemo(() => {
    if (!form.product_id) return null;

    return (
      products.find((product) => String(product.id) === form.product_id) || null
    );
  }, [products, form.product_id]);

  const filteredAvailability = useMemo(() => {
    return availability.filter((item) => {
      const productName =
        item.product_name ||
        products.find((product) => product.id === item.product)?.name ||
        "";

      const searchText = [
        productName,
        item.date,
        item.note,
        item.price_override,
        item.deposit_override,
      ]
        .join(" ")
        .toLowerCase();

      if (search.trim() && !searchText.includes(search.trim().toLowerCase())) {
        return false;
      }

      if (productFilter && String(item.product) !== productFilter) {
        return false;
      }

      if (dateFilter && item.date !== dateFilter) {
        return false;
      }

      return true;
    });
  }, [availability, products, search, productFilter, dateFilter]);

  const bulkDates = useMemo(() => {
    return getDatesBetween(
      bulkForm.start_date,
      bulkForm.end_date,
      bulkForm.weekdays
    );
  }, [bulkForm]);

  function resetForm() {
    setForm(emptyForm);
  }

  function editAvailability(item: ProductAvailability) {
    setForm({
      id: item.id,
      product_id: String(item.product),
      date: item.date,
      available_capacity: String(item.available_capacity || 0),
      booked_quantity: String(item.booked_quantity || 0),
      price_override:
        item.price_override === null || item.price_override === undefined
          ? ""
          : String(item.price_override),
      deposit_override:
        item.deposit_override === null || item.deposit_override === undefined
          ? ""
          : String(item.deposit_override),
      is_available: item.is_available,
      note: item.note || "",
    });
  }

  function copyToBulk(product: ExperienceProduct) {
    setBulkForm((current) => ({
      ...current,
      product_id: String(product.id),
      available_capacity: String(product.capacity || 0),
      price_override: "",
      deposit_override: "",
    }));
  }

  async function saveAvailability() {
    if (!form.product_id) {
      setError("Select a product.");
      return;
    }

    if (!form.date) {
      setError("Select an available date.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const productValue = Number(form.product_id);

      const payload = {
        product: productValue,
        product_id: productValue,
        date: form.date,
        available_capacity: Math.max(0, toNumber(form.available_capacity)),
        booked_quantity: Math.max(0, toNumber(form.booked_quantity)),
        price_override: toNullableDecimal(form.price_override),
        deposit_override: toNullableDecimal(form.deposit_override),
        is_available: form.is_available,
        note: form.note,
      };

      if (form.id) {
        await api.patch(`/ticketing/availability/${form.id}/`, payload, {
          params: requestParams,
        });

        setSavedMessage("Availability date updated.");
      } else {
        await api.post("/ticketing/availability/", payload, {
          params: requestParams,
        });

        setSavedMessage("Availability date created.");
      }

      resetForm();
      await loadData();
    } catch (err: any) {
      console.error("Could not save availability:", err);

      setError(getErrorMessage(err, "Could not save availability date."));
    } finally {
      setSaving(false);
    }
  }

  async function saveBulkAvailability() {
    if (!bulkForm.product_id) {
      setError("Select a product for bulk availability.");
      return;
    }

    if (!bulkForm.start_date || !bulkForm.end_date) {
      setError("Select a start date and end date.");
      return;
    }

    if (!bulkForm.weekdays.length) {
      setError("Select at least one weekday.");
      return;
    }

    if (!bulkDates.length) {
      setError("No dates match the selected range and weekdays.");
      return;
    }

    const confirmed = window.confirm(
      `Create or update ${bulkDates.length} availability dates?`
    );

    if (!confirmed) return;

    try {
      setBulkSaving(true);
      setError("");
      setSavedMessage("");

      const productValue = Number(bulkForm.product_id);

      for (const date of bulkDates) {
        const payload = {
          product: productValue,
          product_id: productValue,
          date,
          available_capacity: Math.max(0, toNumber(bulkForm.available_capacity)),
          booked_quantity: 0,
          price_override: toNullableDecimal(bulkForm.price_override),
          deposit_override: toNullableDecimal(bulkForm.deposit_override),
          is_available: bulkForm.is_available,
          note: bulkForm.note,
        };

        const existing = availability.find(
          (item) =>
            String(item.product) === String(productValue) && item.date === date
        );

        if (existing) {
          await api.patch(`/ticketing/availability/${existing.id}/`, payload, {
            params: requestParams,
          });
        } else {
          try {
            await api.post("/ticketing/availability/", payload, {
              params: requestParams,
            });
          } catch (err: any) {
            // Some backends enforce unique product/date. If the local list was stale,
            // reload once and try to locate the existing record before failing.
            const freshResponse = await api.get("/ticketing/availability/", {
              params: requestParams,
            });

            const freshList = normalizeList<ProductAvailability>(
              freshResponse.data
            );

            const freshExisting = freshList.find(
              (item) =>
                String(item.product) === String(productValue) &&
                item.date === date
            );

            if (!freshExisting) throw err;

            await api.patch(
              `/ticketing/availability/${freshExisting.id}/`,
              payload,
              {
                params: requestParams,
              }
            );
          }
        }
      }

      setSavedMessage(`${bulkDates.length} availability dates saved.`);
      setBulkForm(emptyBulkForm);
      await loadData();
    } catch (err: any) {
      console.error("Could not save bulk availability:", err);

      setError(getErrorMessage(err, "Could not save bulk availability."));
    } finally {
      setBulkSaving(false);
    }
  }

  async function deleteAvailability(item: ProductAvailability) {
    const confirmed = window.confirm(
      `Delete availability for ${getDateLabel(item.date)}?`
    );

    if (!confirmed) return;

    try {
      setDeletingId(item.id);
      setError("");
      setSavedMessage("");

      await api.delete(`/ticketing/availability/${item.id}/`, {
        params: requestParams,
      });

      setAvailability((current) =>
        current.filter((availabilityItem) => availabilityItem.id !== item.id)
      );

      setSavedMessage("Availability date deleted.");
    } catch (err: any) {
      console.error("Could not delete availability:", err);

      setError(getErrorMessage(err, "Could not delete availability date."));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600">
        Loading product availability...
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:flex-row xl:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <CalendarDays className="h-7 w-7" />
          </div>

          <div>
            <p className="text-sm font-black uppercase tracking-wide text-amber-600">
              Advanced Availability
            </p>

            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              Dates, Capacity & Sold Out Rules
            </h1>

            <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-500">
              Optional advanced control. Use this when a product needs capacity
              per date, sold-out dates, different price/deposit by date, events
              without hotel pickup, or manual blocking of one date. Pickup Times
              still controls the automatic hotel pickup hour.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-black uppercase tracking-wide text-amber-700">
          Simple rule
        </p>
        <p className="mt-2 text-sm font-semibold leading-6 text-amber-900">
          For normal excursions, you can use only <strong>Pickup Times</strong>.
          Use this <strong>Availability</strong> page only when you need advanced
          rules like capacity, sold-out dates, price changes, deposit changes or
          blocking a date manually.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <StatCard
          title="Products"
          value={String(activeProducts.length)}
          helper="Active or draft"
          icon={<Package className="h-6 w-6 text-amber-600" />}
        />
        <StatCard
          title="Dates"
          value={String(availability.length)}
          helper="Availability records"
          icon={<CalendarDays className="h-6 w-6 text-amber-600" />}
        />
        <StatCard
          title="Available"
          value={String(availability.filter((item) => item.is_available).length)}
          helper="Bookable dates"
          icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
        />
        <StatCard
          title="Closed / sold out"
          value={String(availability.filter((item) => !item.is_available).length)}
          helper="Blocked dates"
          icon={<X className="h-6 w-6 text-red-600" />}
        />
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {savedMessage && (
        <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          {savedMessage}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel
          title={form.id ? "Edit one date" : "Create one date"}
          description="Use this for one product/date. Mark it unavailable to block or sold out that date."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Product"
              value={form.product_id}
              onChange={(value) =>
                setForm((current) => ({ ...current, product_id: value }))
              }
              options={[
                { value: "", label: "Select product" },
                ...activeProducts.map((product) => ({
                  value: String(product.id),
                  label: `${product.name} (${productTypeLabel(product.product_type)})`,
                })),
              ]}
            />

            <Input
              label="Available date"
              type="date"
              value={form.date}
              onChange={(value) =>
                setForm((current) => ({ ...current, date: value }))
              }
            />

            <Input
              label="Capacity for this date"
              type="number"
              value={form.available_capacity}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  available_capacity: value,
                }))
              }
              placeholder={String(selectedProduct?.capacity || 0)}
            />

            <Input
              label="Booked quantity"
              type="number"
              value={form.booked_quantity}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  booked_quantity: value,
                }))
              }
            />

            <Input
              label="Price override"
              type="number"
              value={form.price_override}
              onChange={(value) =>
                setForm((current) => ({ ...current, price_override: value }))
              }
              placeholder="Leave empty to use product price"
            />

            <Input
              label="Deposit override"
              type="number"
              value={form.deposit_override}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  deposit_override: value,
                }))
              }
              placeholder="Leave empty to use product deposit"
            />

            <Toggle
              label="Available / bookable"
              checked={form.is_available}
              onChange={(value) =>
                setForm((current) => ({ ...current, is_available: value }))
              }
            />

            <Textarea
              label="Note"
              value={form.note}
              onChange={(value) =>
                setForm((current) => ({ ...current, note: value }))
              }
              placeholder="Example: Private event, sold out, holiday price..."
            />
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={saveAvailability}
              disabled={saving}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : form.id ? (
                <Save className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {form.id ? "Update Date" : "Create Date"}
            </button>

            {form.id && (
              <button
                type="button"
                onClick={resetForm}
                className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
              >
                Cancel
              </button>
            )}
          </div>
        </Panel>

        <Panel
          title="Bulk create/update dates"
          description="Create many available dates at once. Example: every Monday, Wednesday and Friday for the next month."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Product"
              value={bulkForm.product_id}
              onChange={(value) =>
                setBulkForm((current) => ({ ...current, product_id: value }))
              }
              options={[
                { value: "", label: "Select product" },
                ...activeProducts.map((product) => ({
                  value: String(product.id),
                  label: product.name,
                })),
              ]}
            />

            <Input
              label="Capacity"
              type="number"
              value={bulkForm.available_capacity}
              onChange={(value) =>
                setBulkForm((current) => ({
                  ...current,
                  available_capacity: value,
                }))
              }
            />

            <Input
              label="Start date"
              type="date"
              value={bulkForm.start_date}
              onChange={(value) =>
                setBulkForm((current) => ({ ...current, start_date: value }))
              }
            />

            <Input
              label="End date"
              type="date"
              value={bulkForm.end_date}
              onChange={(value) =>
                setBulkForm((current) => ({ ...current, end_date: value }))
              }
            />

            <Input
              label="Price override"
              type="number"
              value={bulkForm.price_override}
              onChange={(value) =>
                setBulkForm((current) => ({
                  ...current,
                  price_override: value,
                }))
              }
              placeholder="Optional"
            />

            <Input
              label="Deposit override"
              type="number"
              value={bulkForm.deposit_override}
              onChange={(value) =>
                setBulkForm((current) => ({
                  ...current,
                  deposit_override: value,
                }))
              }
              placeholder="Optional"
            />
          </div>

          <div className="mt-4">
            <p className="text-sm font-bold text-slate-700">Weekdays</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {weekdayOptions.map((day) => {
                const checked = bulkForm.weekdays.includes(day.value);

                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() =>
                      setBulkForm((current) => ({
                        ...current,
                        weekdays: checked
                          ? current.weekdays.filter((item) => item !== day.value)
                          : [...current.weekdays, day.value],
                      }))
                    }
                    className={[
                      "rounded-2xl px-4 py-2 text-sm font-black transition",
                      checked
                        ? "bg-amber-500 text-white"
                        : "border border-slate-200 bg-white text-slate-600",
                    ].join(" ")}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Toggle
              label="Available / bookable"
              checked={bulkForm.is_available}
              onChange={(value) =>
                setBulkForm((current) => ({ ...current, is_available: value }))
              }
            />

            <Textarea
              label="Note"
              value={bulkForm.note}
              onChange={(value) =>
                setBulkForm((current) => ({ ...current, note: value }))
              }
              placeholder="Optional note for all dates"
            />
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">
            Dates to create/update:{" "}
            <span className="font-black text-slate-950">{bulkDates.length}</span>
          </div>

          <button
            type="button"
            onClick={saveBulkAvailability}
            disabled={bulkSaving || !bulkDates.length}
            className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 text-sm font-black text-white transition hover:bg-amber-600 disabled:opacity-60"
          >
            {bulkSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Bulk Save Dates
          </button>
        </Panel>
      </section>

      <Panel
        title="Availability records"
        description="These records are optional advanced rules. The public product page uses them only when the product has records here."
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_240px_190px]">
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search dates..."
              className="h-full flex-1 bg-transparent text-sm font-semibold outline-none"
            />
          </div>

          <select
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
            className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
          >
            <option value="">All products</option>
            {activeProducts.map((product) => (
              <option key={product.id} value={String(product.id)}>
                {product.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
          />
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
          {filteredAvailability.length === 0 ? (
            <EmptyState text="No availability records found. This is okay. Normal products can still use Pickup Times only." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Product</Th>
                    <Th>Date</Th>
                    <Th>Capacity</Th>
                    <Th>Booked</Th>
                    <Th>Remaining</Th>
                    <Th>Price</Th>
                    <Th>Deposit</Th>
                    <Th>Status</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredAvailability.map((item) => {
                    const product =
                      products.find((current) => current.id === item.product) ||
                      null;

                    const remaining =
                      item.remaining_capacity ??
                      Math.max(
                        Number(item.available_capacity || 0) -
                          Number(item.booked_quantity || 0),
                        0
                      );

                    return (
                      <tr key={item.id}>
                        <Td>
                          <div>
                            <p className="font-black text-slate-900">
                              {item.product_name || product?.name || `Product #${item.product}`}
                            </p>
                            {product && (
                              <button
                                type="button"
                                onClick={() => copyToBulk(product)}
                                className="mt-1 text-xs font-black text-amber-600"
                              >
                                Use for bulk
                              </button>
                            )}
                          </div>
                        </Td>
                        <Td>{getDateLabel(item.date)}</Td>
                        <Td>{item.available_capacity}</Td>
                        <Td>{item.booked_quantity}</Td>
                        <Td>
                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-xs font-black",
                              remaining > 0 && item.is_available
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-red-50 text-red-700",
                            ].join(" ")}
                          >
                            {remaining}
                          </span>
                        </Td>
                        <Td>{formatMoney(item.price_override)}</Td>
                        <Td>{formatMoney(item.deposit_override)}</Td>
                        <Td>
                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-xs font-black",
                              item.is_available
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500",
                            ].join(" ")}
                          >
                            {item.is_available ? "Available" : "Closed"}
                          </span>
                        </Td>
                        <Td>
                          <RowActions
                            onEdit={() => editAvailability(item)}
                            onDelete={() => deleteAvailability(item)}
                            deleting={deletingId === item.id}
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

function StatCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      {icon}
      <p className="mt-4 text-sm font-bold text-slate-500">{title}</p>
      <h2 className="mt-1 text-2xl font-black text-slate-950">{value}</h2>
      <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
          {description}
        </p>
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        type={type}
        min={type === "number" ? "0" : undefined}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-black text-slate-800">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-amber-500"
      />
    </label>
  );
}

function RowActions({
  onEdit,
  onDelete,
  deleting,
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={onEdit}
        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
        title="Edit"
      >
        <Edit3 className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="rounded-xl border border-red-200 bg-white p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        title="Delete"
      >
        {deleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
      {text}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-600">
      {children}
    </td>
  );
}
