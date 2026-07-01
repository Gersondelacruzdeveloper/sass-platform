// src/modules/ticketing/pages/TicketingTransfersPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  Car,
  CheckCircle2,
  Clock3,
  Copy,
  DollarSign,
  Edit3,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  Plane,
  Plus,
  RefreshCw,
  Search,
  ToggleLeft,
  ToggleRight,
  Users,
  X,
} from "lucide-react";

import api from "../../../api/axios";
import TicketingPageShell from "../components/TicketingPageShell";

type ProductStatus = "draft" | "active" | "inactive" | "archived" | string;

type Category = {
  id: number;
  name: string;
  slug?: string;
  is_active?: boolean;
};

type TransferRoute = {
  id?: number;
  name?: string;
  from_location?: string;
  to_location?: string;
  origin?: string;
  destination?: string;
  duration_minutes?: number;
  price?: string | number;
  base_price?: string | number;
  is_active?: boolean;
};

type ExperienceProduct = {
  id: number;
  category?: number | null;
  category_id?: number | null;
  category_detail?: Category | null;
  name: string;
  slug: string;
  product_type?: string;
  status?: ProductStatus;
  is_active?: boolean;
  public_enabled?: boolean;

  short_description?: string | null;
  description?: string | null;
  summary?: string | null;

  base_price?: string | number;
  deposit_amount?: string | number;
  deposit_percentage?: string | number;
  max_capacity?: number | string | null;
  duration_minutes?: number | string | null;
  location_name?: string | null;
  meeting_point?: string | null;

  supports_pickup?: boolean;
  requires_pickup_location?: boolean;
  allow_public_bookings?: boolean;
  seller_enabled?: boolean;

  image?: string | null;
  image_url?: string | null;

  transfer_routes?: TransferRoute[];

  created_at?: string;
  updated_at?: string;
};

type TransferFormState = {
  id?: number | null;
  category: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  base_price: string;
  deposit_amount: string;
  deposit_percentage: string;
  max_capacity: string;
  duration_minutes: string;
  location_name: string;
  meeting_point: string;
  status: ProductStatus;
  is_active: boolean;
  public_enabled: boolean;
  allow_public_bookings: boolean;
  seller_enabled: boolean;
};

const blankForm: TransferFormState = {
  id: null,
  category: "",
  name: "",
  slug: "",
  short_description: "",
  description: "",
  base_price: "0.00",
  deposit_amount: "0.00",
  deposit_percentage: "0.00",
  max_capacity: "1",
  duration_minutes: "",
  location_name: "",
  meeting_point: "",
  status: "active",
  is_active: true,
  public_enabled: true,
  allow_public_bookings: true,
  seller_enabled: true,
};

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
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

function formatMoney(value?: string | number | null, symbol = "US$") {
  const number = Number(value || 0);

  return `${symbol} ${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMinutes(value?: string | number | null) {
  const minutes = Number(value || 0);

  if (!minutes) return "—";

  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function statusLabel(value?: string | null) {
  if (!value) return "Unknown";

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusClasses(product: ExperienceProduct) {
  if (product.status === "active" && product.is_active !== false) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (product.status === "draft") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (product.status === "archived") {
    return "bg-slate-100 text-slate-600 ring-slate-200";
  }

  return "bg-red-50 text-red-700 ring-red-200";
}

function getApiOrigin() {
  const baseUrl =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api";

  return baseUrl.replace(/\/api\/?$/, "");
}

function resolveAssetUrl(url?: string | null) {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  const apiOrigin = getApiOrigin();

  return `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
}

function productToForm(product: ExperienceProduct): TransferFormState {
  return {
    ...blankForm,
    id: product.id,
    category: String(product.category || product.category_id || product.category_detail?.id || ""),
    name: product.name || "",
    slug: product.slug || "",
    short_description:
      product.short_description || product.summary || "",
    description: product.description || "",
    base_price: String(product.base_price ?? "0.00"),
    deposit_amount: String(product.deposit_amount ?? "0.00"),
    deposit_percentage: String(product.deposit_percentage ?? "0.00"),
    max_capacity: String(product.max_capacity ?? "1"),
    duration_minutes: String(product.duration_minutes ?? ""),
    location_name: product.location_name || "",
    meeting_point: product.meeting_point || "",
    status: product.status || "active",
    is_active: product.is_active !== false,
    public_enabled: Boolean(product.public_enabled),
    allow_public_bookings: product.allow_public_bookings !== false,
    seller_enabled: product.seller_enabled !== false,
  };
}

function formToPayload(form: TransferFormState) {
  const payload: Record<string, unknown> = {
    product_type: "transfer",
    name: form.name.trim(),
    slug: form.slug.trim() || slugify(form.name),
    short_description: form.short_description.trim(),
    description: form.description.trim(),
    base_price: form.base_price || "0.00",
    deposit_amount: form.deposit_amount || "0.00",
    deposit_percentage: form.deposit_percentage || "0.00",
    max_capacity: Number(form.max_capacity || 1),
    duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
    location_name: form.location_name.trim(),
    meeting_point: form.meeting_point.trim(),
    status: form.status,
    is_active: form.is_active,
    public_enabled: form.public_enabled,
    allow_public_bookings: form.allow_public_bookings,
    seller_enabled: form.seller_enabled,
  };

  if (form.category) {
    payload.category = Number(form.category);
  }

  return payload;
}

function getProductPublicUrl(organisationSlug: string, product: ExperienceProduct) {
  return `${window.location.origin}/experiences/${organisationSlug}/product/${product.slug}`;
}

function getPrimaryRouteLabel(product: ExperienceProduct) {
  const route = product.transfer_routes?.[0];

  if (!route) return product.location_name || "Route not configured";

  const from = route.from_location || route.origin || "";
  const to = route.to_location || route.destination || "";

  if (from && to) return `${from} → ${to}`;

  return route.name || product.location_name || "Route not configured";
}

export default function TicketingTransfersPage() {
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedTransfer, setSelectedTransfer] = useState<ExperienceProduct | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<ExperienceProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TransferFormState>(blankForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [publicFilter, setPublicFilter] = useState("");

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  async function loadPage() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const [productsResponse, categoriesResponse] = await Promise.all([
        api.get("/ticketing/products/", {
          params: requestParams,
        }),
        api.get("/ticketing/categories/", {
          params: requestParams,
        }),
      ]);

      const allProducts = normalizeList<ExperienceProduct>(productsResponse.data);
      const transferProducts = allProducts.filter(
        (product) => product.product_type === "transfer"
      );

      setProducts(transferProducts);
      setCategories(normalizeList<Category>(categoriesResponse.data));
    } catch (err: any) {
      console.error("Could not load transfers:", err);
      setError(getErrorMessage(err, "Could not load transfers."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [organisationSlug]);

  const stats = useMemo(() => {
    const active = products.filter(
      (product) => product.status === "active" && product.is_active !== false
    ).length;

    const publicProducts = products.filter((product) => product.public_enabled).length;

    const totalCapacity = products.reduce(
      (sum, product) => sum + Number(product.max_capacity || 0),
      0
    );

    const averagePrice =
      products.length > 0
        ? products.reduce((sum, product) => sum + Number(product.base_price || 0), 0) /
          products.length
        : 0;

    return {
      total: products.length,
      active,
      publicProducts,
      totalCapacity,
      averagePrice,
    };
  }, [products]);

  const filteredTransfers = useMemo(() => {
    return products.filter((product) => {
      const searchText = [
        product.name,
        product.slug,
        product.status,
        product.location_name,
        product.meeting_point,
        getPrimaryRouteLabel(product),
        product.category_detail?.name,
        product.short_description,
      ]
        .join(" ")
        .toLowerCase();

      if (search.trim() && !searchText.includes(search.trim().toLowerCase())) {
        return false;
      }

      if (statusFilter && product.status !== statusFilter) {
        return false;
      }

      if (publicFilter === "public" && !product.public_enabled) {
        return false;
      }

      if (publicFilter === "hidden" && product.public_enabled) {
        return false;
      }

      return true;
    });
  }, [products, search, statusFilter, publicFilter]);

  function openCreateForm() {
    setEditingTransfer(null);
    setSelectedTransfer(null);
    setForm(blankForm);
    setShowForm(true);
    setError("");
    setSavedMessage("");
  }

  function openEditForm(product: ExperienceProduct) {
    setEditingTransfer(product);
    setSelectedTransfer(null);
    setForm(productToForm(product));
    setShowForm(true);
    setError("");
    setSavedMessage("");
  }

  function updateForm<K extends keyof TransferFormState>(
    field: K,
    value: TransferFormState[K]
  ) {
    setForm((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === "name" && !current.id && !current.slug.trim()) {
        next.slug = slugify(String(value));
      }

      return next;
    });
  }

  async function saveTransfer() {
    if (!form.name.trim()) {
      setError("Transfer name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const payload = formToPayload(form);

      const response = editingTransfer
        ? await api.patch(`/ticketing/products/${editingTransfer.id}/`, payload, {
            params: requestParams,
          })
        : await api.post("/ticketing/products/", payload, {
            params: requestParams,
          });

      const savedProduct = response.data as ExperienceProduct;

      setProducts((current) => {
        if (editingTransfer) {
          return current.map((item) =>
            item.id === savedProduct.id ? savedProduct : item
          );
        }

        return [savedProduct, ...current];
      });

      setShowForm(false);
      setEditingTransfer(null);
      setSavedMessage(editingTransfer ? "Transfer updated." : "Transfer created.");
    } catch (err: any) {
      console.error("Could not save transfer:", err);
      setError(getErrorMessage(err, "Could not save transfer."));
    } finally {
      setSaving(false);
    }
  }

  async function togglePublic(product: ExperienceProduct) {
    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const response = await api.patch(
        `/ticketing/products/${product.id}/`,
        {
          public_enabled: !product.public_enabled,
        },
        {
          params: requestParams,
        }
      );

      const updatedProduct = response.data as ExperienceProduct;

      setProducts((current) =>
        current.map((item) => (item.id === product.id ? updatedProduct : item))
      );

      setSelectedTransfer((current) =>
        current?.id === product.id ? updatedProduct : current
      );

      setSavedMessage(
        updatedProduct.public_enabled
          ? "Transfer is now public."
          : "Transfer is now hidden."
      );
    } catch (err: any) {
      console.error("Could not update transfer:", err);
      setError(getErrorMessage(err, "Could not update transfer."));
    } finally {
      setSaving(false);
    }
  }

  async function copyPublicLink(product: ExperienceProduct) {
    try {
      await navigator.clipboard.writeText(getProductPublicUrl(organisationSlug, product));
      setSavedMessage("Public transfer link copied.");
    } catch {
      setError("Could not copy public link.");
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title="Transfers"
        subtitle="Manage airport, hotel and private transfer services."
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          Loading transfers...
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title="Transfers"
      subtitle="Manage airport, hotel and private transfer services."
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            title="Transfer services"
            value={String(stats.total)}
            helper="All transfer products"
            icon={<Car className="h-6 w-6 text-slate-700" />}
          />
          <StatCard
            title="Active"
            value={String(stats.active)}
            helper="Available to sell"
            icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title="Public"
            value={String(stats.publicProducts)}
            helper="Visible on public site"
            icon={<ExternalLink className="h-6 w-6 text-sky-600" />}
          />
          <StatCard
            title="Total capacity"
            value={String(stats.totalCapacity)}
            helper="Combined capacity"
            icon={<Users className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title="Average price"
            value={formatMoney(stats.averagePrice)}
            helper="Base price average"
            icon={<DollarSign className="h-6 w-6 text-emerald-600" />}
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

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Transfer services
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Create and manage airport, hotel and private transfer products.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadPage}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>

              <button
                type="button"
                onClick={openCreateForm}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                New transfer
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_220px_180px]">
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search transfer, route, airport, hotel..."
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>

            <select
              value={publicFilter}
              onChange={(event) => setPublicFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">All visibility</option>
              <option value="public">Public</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            {filteredTransfers.length === 0 ? (
              <EmptyState text="No transfer services found." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Transfer</Th>
                      <Th>Route / Location</Th>
                      <Th>Price</Th>
                      <Th>Duration</Th>
                      <Th>Capacity</Th>
                      <Th>Status</Th>
                      <Th>Public</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredTransfers.map((product) => (
                      <tr key={product.id}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <TransferImage product={product} />
                            <div>
                              <p className="font-black text-slate-950">
                                {product.name}
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-500">
                                /product/{product.slug}
                              </p>
                            </div>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-900">
                              {getPrimaryRouteLabel(product)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {product.category_detail?.name || "Transfer"}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {formatMoney(product.base_price)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              Deposit: {formatMoney(product.deposit_amount)}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <p className="font-black text-slate-950">
                            {formatMinutes(product.duration_minutes)}
                          </p>
                        </Td>

                        <Td>
                          <p className="font-black text-slate-950">
                            {product.max_capacity || "—"}
                          </p>
                        </Td>

                        <Td>
                          <span
                            className={[
                              "inline-flex rounded-full px-3 py-1 text-xs font-black ring-1",
                              getStatusClasses(product),
                            ].join(" ")}
                          >
                            {statusLabel(product.status)}
                          </span>
                        </Td>

                        <Td>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => togglePublic(product)}
                            className={[
                              "inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-3 text-xs font-black text-white transition disabled:opacity-60",
                              product.public_enabled
                                ? "bg-emerald-600 hover:bg-emerald-700"
                                : "bg-slate-500 hover:bg-slate-600",
                            ].join(" ")}
                          >
                            {product.public_enabled ? (
                              <ToggleRight className="h-4 w-4" />
                            ) : (
                              <ToggleLeft className="h-4 w-4" />
                            )}
                            {product.public_enabled ? "Public" : "Hidden"}
                          </button>
                        </Td>

                        <Td>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedTransfer(product)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditForm(product)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Edit3 className="h-4 w-4" />
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => copyPublicLink(product)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Copy className="h-4 w-4" />
                              Link
                            </button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {showForm && (
        <TransferFormModal
          form={form}
          categories={categories}
          editingTransfer={editingTransfer}
          saving={saving}
          onClose={() => {
            setShowForm(false);
            setEditingTransfer(null);
          }}
          onChange={updateForm}
          onSave={saveTransfer}
        />
      )}

      {selectedTransfer && (
        <TransferDetailModal
          product={selectedTransfer}
          organisationSlug={organisationSlug}
          saving={saving}
          onClose={() => setSelectedTransfer(null)}
          onEdit={() => openEditForm(selectedTransfer)}
          onCopyLink={() => copyPublicLink(selectedTransfer)}
          onTogglePublic={() => togglePublic(selectedTransfer)}
        />
      )}
    </TicketingPageShell>
  );
}

function TransferFormModal({
  form,
  categories,
  editingTransfer,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  form: TransferFormState;
  categories: Category[];
  editingTransfer: ExperienceProduct | null;
  saving: boolean;
  onClose: () => void;
  onChange: <K extends keyof TransferFormState>(
    field: K,
    value: TransferFormState[K]
  ) => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">
              {editingTransfer ? "Edit transfer" : "New transfer"}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {form.name || "Transfer service"}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Create a transfer product for airport, hotel or private transportation.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-92px)] overflow-y-auto p-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="Basic information"
              description="Name, category and public description."
              icon={<Plane className="h-5 w-5" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Transfer name"
                  value={form.name}
                  onChange={(value) => onChange("name", value)}
                  placeholder="Punta Cana Airport to Bávaro Hotel"
                  required
                />

                <Input
                  label="Slug"
                  value={form.slug}
                  onChange={(value) => onChange("slug", slugify(value))}
                  placeholder="airport-to-bavaro"
                />

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    Category
                  </span>
                  <select
                    value={form.category}
                    onChange={(event) => onChange("category", event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                  >
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={String(category.id)}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    Status
                  </span>
                  <select
                    value={form.status}
                    onChange={(event) => onChange("status", event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                  >
                    {statusOptions.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <Textarea
                label="Short description"
                value={form.short_description}
                onChange={(value) => onChange("short_description", value)}
                placeholder="Private transfer from PUJ airport to your hotel."
              />

              <Textarea
                label="Full description"
                value={form.description}
                onChange={(value) => onChange("description", value)}
                placeholder="Describe what is included, luggage details, waiting time, meeting instructions..."
              />
            </Panel>

            <Panel
              title="Route and pricing"
              description="Main route information, capacity, duration and pricing."
              icon={<MapPin className="h-5 w-5" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Route / location name"
                  value={form.location_name}
                  onChange={(value) => onChange("location_name", value)}
                  placeholder="PUJ Airport → Bávaro / Punta Cana"
                />

                <Input
                  label="Meeting point"
                  value={form.meeting_point}
                  onChange={(value) => onChange("meeting_point", value)}
                  placeholder="Airport arrivals area"
                />

                <Input
                  label="Base price"
                  type="number"
                  value={form.base_price}
                  onChange={(value) => onChange("base_price", value)}
                  placeholder="40.00"
                />

                <Input
                  label="Deposit amount"
                  type="number"
                  value={form.deposit_amount}
                  onChange={(value) => onChange("deposit_amount", value)}
                  placeholder="10.00"
                />

                <Input
                  label="Deposit percentage"
                  type="number"
                  value={form.deposit_percentage}
                  onChange={(value) => onChange("deposit_percentage", value)}
                  placeholder="0.00"
                />

                <Input
                  label="Max capacity"
                  type="number"
                  value={form.max_capacity}
                  onChange={(value) => onChange("max_capacity", value)}
                  placeholder="4"
                />

                <Input
                  label="Duration minutes"
                  type="number"
                  value={form.duration_minutes}
                  onChange={(value) => onChange("duration_minutes", value)}
                  placeholder="25"
                />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <Toggle
                  label="Active"
                  description="Can be used internally."
                  checked={form.is_active}
                  onChange={(value) => onChange("is_active", value)}
                />

                <Toggle
                  label="Public"
                  description="Show on the public website."
                  checked={form.public_enabled}
                  onChange={(value) => onChange("public_enabled", value)}
                />

                <Toggle
                  label="Public bookings"
                  description="Allow customers to book this transfer."
                  checked={form.allow_public_bookings}
                  onChange={(value) => onChange("allow_public_bookings", value)}
                />

                <Toggle
                  label="Seller enabled"
                  description="Allow sellers to sell this transfer."
                  checked={form.seller_enabled}
                  onChange={(value) => onChange("seller_enabled", value)}
                />
              </div>
            </Panel>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {editingTransfer ? "Save transfer" : "Create transfer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransferDetailModal({
  product,
  organisationSlug,
  saving,
  onClose,
  onEdit,
  onCopyLink,
  onTogglePublic,
}: {
  product: ExperienceProduct;
  organisationSlug: string;
  saving: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCopyLink: () => void;
  onTogglePublic: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="flex items-center gap-4">
            <TransferImage product={product} large />
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-600">
                Transfer detail
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {product.name}
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {getPrimaryRouteLabel(product)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-92px)] overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
            >
              <Edit3 className="h-4 w-4" />
              Edit
            </button>

            <button
              type="button"
              onClick={onCopyLink}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              <Copy className="h-4 w-4" />
              Copy public link
            </button>

            <Link
              to={`/experiences/${organisationSlug}/product/${product.slug}`}
              target="_blank"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              <ExternalLink className="h-4 w-4" />
              Open public page
            </Link>

            <button
              type="button"
              disabled={saving}
              onClick={onTogglePublic}
              className={[
                "inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black text-white disabled:opacity-60",
                product.public_enabled ? "bg-red-600" : "bg-emerald-600",
              ].join(" ")}
            >
              {product.public_enabled ? (
                <ToggleLeft className="h-4 w-4" />
              ) : (
                <ToggleRight className="h-4 w-4" />
              )}
              {product.public_enabled ? "Hide public" : "Make public"}
            </button>
          </div>

          <section className="mt-5 grid gap-4 lg:grid-cols-4">
            <InfoCard
              icon={<DollarSign className="h-5 w-5" />}
              label="Price"
              value={formatMoney(product.base_price)}
              helper={`Deposit: ${formatMoney(product.deposit_amount)}`}
            />
            <InfoCard
              icon={<Clock3 className="h-5 w-5" />}
              label="Duration"
              value={formatMinutes(product.duration_minutes)}
              helper="Estimated transfer time"
            />
            <InfoCard
              icon={<Users className="h-5 w-5" />}
              label="Capacity"
              value={String(product.max_capacity || "—")}
              helper="Maximum passengers"
            />
            <InfoCard
              icon={<ExternalLink className="h-5 w-5" />}
              label="Visibility"
              value={product.public_enabled ? "Public" : "Hidden"}
              helper={statusLabel(product.status)}
            />
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              Description
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              {product.description ||
                product.short_description ||
                "No description added yet."}
            </p>
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              Route information
            </h3>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <InfoLine label="Route" value={getPrimaryRouteLabel(product)} />
              <InfoLine label="Meeting point" value={product.meeting_point || "—"} />
              <InfoLine label="Category" value={product.category_detail?.name || "—"} />
              <InfoLine label="Public URL" value={getProductPublicUrl(organisationSlug, product)} />
            </div>
          </section>

          {product.transfer_routes && product.transfer_routes.length > 0 && (
            <section className="mt-5 rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Configured routes
              </h3>

              <div className="mt-3 space-y-2">
                {product.transfer_routes.map((route, index) => (
                  <div
                    key={route.id || index}
                    className="rounded-2xl bg-slate-50 p-3 text-sm"
                  >
                    <p className="font-black text-slate-950">
                      {route.name ||
                        `${route.from_location || route.origin || "Origin"} → ${
                          route.to_location || route.destination || "Destination"
                        }`}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {formatMinutes(route.duration_minutes)} ·{" "}
                      {formatMoney(route.price || route.base_price)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function TransferImage({
  product,
  large = false,
}: {
  product: ExperienceProduct;
  large?: boolean;
}) {
  const imageUrl = resolveAssetUrl(product.image_url || product.image);

  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-amber-100 text-amber-700",
        large ? "h-16 w-16" : "h-11 w-11",
      ].join(" ")}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={product.name}
          className="h-full w-full object-cover"
        />
      ) : (
        <Car className={large ? "h-8 w-8" : "h-5 w-5"} />
      )}
    </div>
  );
}

function Panel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          {icon}
        </div>

        <div>
          <h3 className="text-base font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </section>
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

function InfoCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-amber-600">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
      {helper && (
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
          {helper}
        </p>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-black text-slate-950">
        {value || "—"}
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>

      <input
        type={type}
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
    <label className="mt-4 block">
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

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <span>
        <span className="block text-sm font-black text-slate-800">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
          {description}
        </span>
      </span>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-amber-500"
      />
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
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
    <td className="whitespace-nowrap px-4 py-3 align-top text-sm font-semibold text-slate-600">
      {children}
    </td>
  );
}
