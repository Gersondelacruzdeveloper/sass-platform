// src/modules/ticketing/pages/TicketingExcursionsPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Copy,
  DollarSign,
  Edit3,
  ExternalLink,
  Eye,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Ticket,
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
  summary?: string | null;
  description?: string | null;
  itinerary?: string | null;
  includes?: string | null;
  excludes?: string | null;

  base_price?: string | number;
  deposit_amount?: string | number;
  deposit_percentage?: string | number;
  max_capacity?: number | string | null;
  duration_minutes?: number | string | null;

  location_name?: string | null;
  meeting_point?: string | null;

  allow_public_bookings?: boolean;
  seller_enabled?: boolean;
  requires_pickup_location?: boolean;
  supports_pickup?: boolean;

  image?: string | null;
  image_url?: string | null;

  created_at?: string;
  updated_at?: string;
};

type ExcursionFormState = {
  id?: number | null;
  category: string;
  name: string;
  slug: string;
  short_description: string;
  description: string;
  itinerary: string;
  includes: string;
  excludes: string;
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
  supports_pickup: boolean;
  requires_pickup_location: boolean;
};

const blankForm: ExcursionFormState = {
  id: null,
  category: "",
  name: "",
  slug: "",
  short_description: "",
  description: "",
  itinerary: "",
  includes: "",
  excludes: "",
  base_price: "0.00",
  deposit_amount: "0.00",
  deposit_percentage: "0.00",
  max_capacity: "20",
  duration_minutes: "",
  location_name: "",
  meeting_point: "",
  status: "active",
  is_active: true,
  public_enabled: true,
  allow_public_bookings: true,
  seller_enabled: true,
  supports_pickup: true,
  requires_pickup_location: true,
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

function numberValue(value?: string | number | null) {
  const number = Number(value || 0);

  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value?: string | number | null, symbol = "US$") {
  const number = numberValue(value);

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

function productToForm(product: ExperienceProduct): ExcursionFormState {
  return {
    ...blankForm,
    id: product.id,
    category: String(product.category || product.category_id || product.category_detail?.id || ""),
    name: product.name || "",
    slug: product.slug || "",
    short_description: product.short_description || product.summary || "",
    description: product.description || "",
    itinerary: product.itinerary || "",
    includes: product.includes || "",
    excludes: product.excludes || "",
    base_price: String(product.base_price ?? "0.00"),
    deposit_amount: String(product.deposit_amount ?? "0.00"),
    deposit_percentage: String(product.deposit_percentage ?? "0.00"),
    max_capacity: String(product.max_capacity ?? "20"),
    duration_minutes: String(product.duration_minutes ?? ""),
    location_name: product.location_name || "",
    meeting_point: product.meeting_point || "",
    status: product.status || "active",
    is_active: product.is_active !== false,
    public_enabled: Boolean(product.public_enabled),
    allow_public_bookings: product.allow_public_bookings !== false,
    seller_enabled: product.seller_enabled !== false,
    supports_pickup: product.supports_pickup !== false,
    requires_pickup_location: product.requires_pickup_location !== false,
  };
}

function formToPayload(form: ExcursionFormState) {
  const payload: Record<string, unknown> = {
    product_type: "excursion",
    name: form.name.trim(),
    slug: form.slug.trim() || slugify(form.name),
    short_description: form.short_description.trim(),
    description: form.description.trim(),
    itinerary: form.itinerary.trim(),
    includes: form.includes.trim(),
    excludes: form.excludes.trim(),
    base_price: form.base_price || "0.00",
    deposit_amount: form.deposit_amount || "0.00",
    deposit_percentage: form.deposit_percentage || "0.00",
    max_capacity: Number(form.max_capacity || 0),
    duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
    location_name: form.location_name.trim(),
    meeting_point: form.meeting_point.trim(),
    status: form.status,
    is_active: form.is_active,
    public_enabled: form.public_enabled,
    allow_public_bookings: form.allow_public_bookings,
    seller_enabled: form.seller_enabled,
    supports_pickup: form.supports_pickup,
    requires_pickup_location: form.requires_pickup_location,
  };

  if (form.category) {
    payload.category = Number(form.category);
  }

  return payload;
}

function getProductPublicUrl(organisationSlug: string, product: ExperienceProduct) {
  return `${window.location.origin}/experiences/${organisationSlug}/product/${product.slug}`;
}

export default function TicketingExcursionsPage() {
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedExcursion, setSelectedExcursion] = useState<ExperienceProduct | null>(null);
  const [editingExcursion, setEditingExcursion] = useState<ExperienceProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ExcursionFormState>(blankForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [publicFilter, setPublicFilter] = useState("");
  const [pickupFilter, setPickupFilter] = useState("");

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
      const excursionProducts = allProducts.filter(
        (product) => product.product_type === "excursion"
      );

      setProducts(excursionProducts);
      setCategories(normalizeList<Category>(categoriesResponse.data));
    } catch (err: any) {
      console.error("Could not load excursions:", err);
      setError(getErrorMessage(err, "Could not load excursions."));
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

    const pickupRequired = products.filter(
      (product) => product.supports_pickup || product.requires_pickup_location
    ).length;

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
      pickupRequired,
      totalCapacity,
      averagePrice,
    };
  }, [products]);

  const filteredExcursions = useMemo(() => {
    return products.filter((product) => {
      const searchText = [
        product.name,
        product.slug,
        product.status,
        product.location_name,
        product.meeting_point,
        product.category_detail?.name,
        product.short_description,
        product.description,
        product.itinerary,
        product.includes,
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

      if (
        pickupFilter === "pickup" &&
        !product.supports_pickup &&
        !product.requires_pickup_location
      ) {
        return false;
      }

      if (
        pickupFilter === "no_pickup" &&
        (product.supports_pickup || product.requires_pickup_location)
      ) {
        return false;
      }

      return true;
    });
  }, [products, search, statusFilter, publicFilter, pickupFilter]);

  function openCreateForm() {
    setEditingExcursion(null);
    setSelectedExcursion(null);
    setForm(blankForm);
    setShowForm(true);
    setError("");
    setSavedMessage("");
  }

  function openEditForm(product: ExperienceProduct) {
    setEditingExcursion(product);
    setSelectedExcursion(null);
    setForm(productToForm(product));
    setShowForm(true);
    setError("");
    setSavedMessage("");
  }

  function updateForm<K extends keyof ExcursionFormState>(
    field: K,
    value: ExcursionFormState[K]
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

  async function saveExcursion() {
    if (!form.name.trim()) {
      setError("Excursion name is required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const payload = formToPayload(form);

      const response = editingExcursion
        ? await api.patch(`/ticketing/products/${editingExcursion.id}/`, payload, {
            params: requestParams,
          })
        : await api.post("/ticketing/products/", payload, {
            params: requestParams,
          });

      const savedProduct = response.data as ExperienceProduct;

      setProducts((current) => {
        if (editingExcursion) {
          return current.map((item) =>
            item.id === savedProduct.id ? savedProduct : item
          );
        }

        return [savedProduct, ...current];
      });

      setShowForm(false);
      setEditingExcursion(null);
      setSavedMessage(editingExcursion ? "Excursion updated." : "Excursion created.");
    } catch (err: any) {
      console.error("Could not save excursion:", err);
      setError(getErrorMessage(err, "Could not save excursion."));
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

      setSelectedExcursion((current) =>
        current?.id === product.id ? updatedProduct : current
      );

      setSavedMessage(
        updatedProduct.public_enabled
          ? "Excursion is now public."
          : "Excursion is now hidden."
      );
    } catch (err: any) {
      console.error("Could not update excursion:", err);
      setError(getErrorMessage(err, "Could not update excursion."));
    } finally {
      setSaving(false);
    }
  }

  async function copyPublicLink(product: ExperienceProduct) {
    try {
      await navigator.clipboard.writeText(getProductPublicUrl(organisationSlug, product));
      setSavedMessage("Public excursion link copied.");
    } catch {
      setError("Could not copy public link.");
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title="Excursions"
        subtitle="Manage excursions such as Saona, Catalina, buggies, party boats and tours."
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          Loading excursions...
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title="Excursions"
      subtitle="Manage excursions such as Saona, Catalina, buggies, party boats and tours."
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard
            title="Excursions"
            value={String(stats.total)}
            helper="Tours and experiences"
            icon={<MapPin className="h-6 w-6 text-slate-700" />}
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
            title="Pickup"
            value={String(stats.pickupRequired)}
            helper="Hotel pickup enabled"
            icon={<Users className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title="Capacity"
            value={String(stats.totalCapacity)}
            helper="Combined capacity"
            icon={<Ticket className="h-6 w-6 text-purple-600" />}
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
                Excursion products
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Create and manage Saona, Catalina, buggies, party boats and guided tours.
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
                New excursion
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_200px_180px_180px]">
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search Saona, Catalina, buggies, party boats..."
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

            <select
              value={pickupFilter}
              onChange={(event) => setPickupFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">All pickup</option>
              <option value="pickup">Pickup enabled</option>
              <option value="no_pickup">No pickup</option>
            </select>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            {filteredExcursions.length === 0 ? (
              <EmptyState text="No excursions found." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Excursion</Th>
                      <Th>Location</Th>
                      <Th>Price</Th>
                      <Th>Duration</Th>
                      <Th>Capacity</Th>
                      <Th>Pickup</Th>
                      <Th>Status</Th>
                      <Th>Public</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredExcursions.map((product) => (
                      <tr key={product.id}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <ExcursionImage product={product} />
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
                              {product.location_name || "Location not set"}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {product.category_detail?.name || "Excursion"}
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
                              product.supports_pickup || product.requires_pickup_location
                                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                : "bg-slate-100 text-slate-600 ring-slate-200",
                            ].join(" ")}
                          >
                            {product.supports_pickup || product.requires_pickup_location
                              ? "Enabled"
                              : "No pickup"}
                          </span>
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
                              onClick={() => setSelectedExcursion(product)}
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
        <ExcursionFormModal
          form={form}
          categories={categories}
          editingExcursion={editingExcursion}
          saving={saving}
          onClose={() => {
            setShowForm(false);
            setEditingExcursion(null);
          }}
          onChange={updateForm}
          onSave={saveExcursion}
        />
      )}

      {selectedExcursion && (
        <ExcursionDetailModal
          product={selectedExcursion}
          organisationSlug={organisationSlug}
          saving={saving}
          onClose={() => setSelectedExcursion(null)}
          onEdit={() => openEditForm(selectedExcursion)}
          onCopyLink={() => copyPublicLink(selectedExcursion)}
          onTogglePublic={() => togglePublic(selectedExcursion)}
        />
      )}
    </TicketingPageShell>
  );
}

function ExcursionFormModal({
  form,
  categories,
  editingExcursion,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  form: ExcursionFormState;
  categories: Category[];
  editingExcursion: ExperienceProduct | null;
  saving: boolean;
  onClose: () => void;
  onChange: <K extends keyof ExcursionFormState>(
    field: K,
    value: ExcursionFormState[K]
  ) => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">
              {editingExcursion ? "Edit excursion" : "New excursion"}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {form.name || "Excursion product"}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Create a tour such as Saona, Catalina, buggies, party boats or private excursions.
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
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel
              title="Basic information"
              description="Name, category, public description and selling status."
              icon={<MapPin className="h-5 w-5" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Excursion name"
                  value={form.name}
                  onChange={(value) => onChange("name", value)}
                  placeholder="Saona Island Full Day"
                  required
                />

                <Input
                  label="Slug"
                  value={form.slug}
                  onChange={(value) => onChange("slug", slugify(value))}
                  placeholder="saona-island-full-day"
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
                placeholder="Full-day island excursion with pickup, lunch and beach time."
              />

              <Textarea
                label="Full description"
                value={form.description}
                onChange={(value) => onChange("description", value)}
                placeholder="Describe the experience, schedule, requirements, food, drinks and important notes..."
              />
            </Panel>

            <Panel
              title="Pricing, capacity and pickup"
              description="Price, deposit, duration, location and pickup rules."
              icon={<DollarSign className="h-5 w-5" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Location name"
                  value={form.location_name}
                  onChange={(value) => onChange("location_name", value)}
                  placeholder="Saona Island"
                />

                <Input
                  label="Meeting point"
                  value={form.meeting_point}
                  onChange={(value) => onChange("meeting_point", value)}
                  placeholder="Hotel lobby / pickup point"
                />

                <Input
                  label="Base price"
                  type="number"
                  value={form.base_price}
                  onChange={(value) => onChange("base_price", value)}
                  placeholder="75.00"
                />

                <Input
                  label="Deposit amount"
                  type="number"
                  value={form.deposit_amount}
                  onChange={(value) => onChange("deposit_amount", value)}
                  placeholder="20.00"
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
                  placeholder="20"
                />

                <Input
                  label="Duration minutes"
                  type="number"
                  value={form.duration_minutes}
                  onChange={(value) => onChange("duration_minutes", value)}
                  placeholder="480"
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
                  description="Allow customers to book this excursion."
                  checked={form.allow_public_bookings}
                  onChange={(value) => onChange("allow_public_bookings", value)}
                />

                <Toggle
                  label="Seller enabled"
                  description="Allow sellers to sell this excursion."
                  checked={form.seller_enabled}
                  onChange={(value) => onChange("seller_enabled", value)}
                />

                <Toggle
                  label="Supports pickup"
                  description="Use pickup schedules for this excursion."
                  checked={form.supports_pickup}
                  onChange={(value) => onChange("supports_pickup", value)}
                />

                <Toggle
                  label="Requires pickup location"
                  description="Customer must select hotel/pickup location."
                  checked={form.requires_pickup_location}
                  onChange={(value) => onChange("requires_pickup_location", value)}
                />
              </div>
            </Panel>
          </div>

          <Panel
            title="Itinerary, includes and excludes"
            description="Operational details shown to customers and sellers."
            icon={<Ticket className="h-5 w-5" />}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <Textarea
                label="Itinerary"
                value={form.itinerary}
                onChange={(value) => onChange("itinerary", value)}
                placeholder="8:00 AM pickup&#10;10:00 AM boat departure&#10;12:00 PM lunch..."
              />

              <Textarea
                label="Includes"
                value={form.includes}
                onChange={(value) => onChange("includes", value)}
                placeholder="Hotel pickup&#10;Lunch&#10;Open bar&#10;Guide"
              />

              <Textarea
                label="Excludes"
                value={form.excludes}
                onChange={(value) => onChange("excludes", value)}
                placeholder="Photos&#10;Tips&#10;Premium drinks"
              />
            </div>
          </Panel>

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
              {editingExcursion ? "Save excursion" : "Create excursion"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExcursionDetailModal({
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
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="flex items-center gap-4">
            <ExcursionImage product={product} large />
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-600">
                Excursion detail
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {product.name}
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {product.location_name || product.category_detail?.name || "Excursion"}
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
              helper="Estimated tour time"
            />
            <InfoCard
              icon={<Users className="h-5 w-5" />}
              label="Capacity"
              value={String(product.max_capacity || "—")}
              helper="Maximum guests"
            />
            <InfoCard
              icon={<MapPin className="h-5 w-5" />}
              label="Pickup"
              value={
                product.supports_pickup || product.requires_pickup_location
                  ? "Enabled"
                  : "No pickup"
              }
              helper={product.requires_pickup_location ? "Hotel required" : "Optional"}
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

          <section className="mt-5 grid gap-4 lg:grid-cols-3">
            <DetailTextCard title="Itinerary" value={product.itinerary} />
            <DetailTextCard title="Includes" value={product.includes} />
            <DetailTextCard title="Excludes" value={product.excludes} />
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              Location and public access
            </h3>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <InfoLine label="Location" value={product.location_name || "—"} />
              <InfoLine label="Meeting point" value={product.meeting_point || "—"} />
              <InfoLine label="Category" value={product.category_detail?.name || "—"} />
              <InfoLine label="Public URL" value={getProductPublicUrl(organisationSlug, product)} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ExcursionImage({
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
        <MapPin className={large ? "h-8 w-8" : "h-5 w-5"} />
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
    <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 first:mt-0">
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

function DetailTextCard({
  title,
  value,
}: {
  title: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <p className="mt-2 whitespace-pre-line text-sm font-semibold leading-6 text-slate-700">
        {value || "Not added yet."}
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
