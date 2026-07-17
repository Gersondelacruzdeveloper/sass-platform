// src/modules/ticketing/pages/TicketingEventsPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Copy,
  DollarSign,
  Edit3,
  ExternalLink,
  Eye,
  Loader2,
  Music,
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
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";

type ProductStatus = "draft" | "active" | "inactive" | "archived" | string;

type Category = {
  id: number;
  name: string;
  slug?: string;
  is_active?: boolean;
};

type EventTicketType = {
  id?: number;
  name?: string;
  title?: string;
  price?: string | number;
  base_price?: string | number;
  capacity?: number;
  available_quantity?: number;
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

  base_price?: string | number;
  deposit_amount?: string | number;
  deposit_percentage?: string | number;
  max_capacity?: number | string | null;
  duration_minutes?: number | string | null;

  location_name?: string | null;
  meeting_point?: string | null;

  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  service_date?: string | null;
  service_time?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  event_start_at?: string | null;
  event_end_at?: string | null;
  venue_name?: string | null;

  allow_public_bookings?: boolean;
  seller_enabled?: boolean;
  requires_pickup_location?: boolean;
  supports_pickup?: boolean;

  image?: string | null;
  image_url?: string | null;

  ticket_types?: EventTicketType[];
  event_ticket_types?: EventTicketType[];

  created_at?: string;
  updated_at?: string;
};

type EventFormState = {
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
  requires_pickup_location: boolean;
  supports_pickup: boolean;
};

const blankForm: EventFormState = {
  id: null,
  category: "",
  name: "",
  slug: "",
  short_description: "",
  description: "",
  base_price: "0.00",
  deposit_amount: "0.00",
  deposit_percentage: "0.00",
  max_capacity: "100",
  duration_minutes: "",
  location_name: "",
  meeting_point: "",
  status: "active",
  is_active: true,
  public_enabled: true,
  allow_public_bookings: true,
  seller_enabled: true,
  requires_pickup_location: false,
  supports_pickup: false,
};

const statusOptions = ["draft", "active", "inactive", "archived"] as const;

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

function formatMinutes(value: string | number | null | undefined, t: (key: string) => string) {
  const minutes = Number(value || 0);

  if (!minutes) return "—";

  if (minutes < 60) return `${minutes} ${t("events.units.minutes")}`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest
    ? `${hours}${t("events.units.hoursShort")} ${rest}${t("events.units.minutesShort")}`
    : `${hours}${t("events.units.hoursShort")}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const rawDate = value.includes("T") ? value.slice(0, 10) : value;
  const date = new Date(`${rawDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) return rawDate;

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value?: string | null) {
  if (!value) return "—";

  const time = value.includes("T") ? value.split("T")[1]?.slice(0, 5) : value.slice(0, 5);
  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number(hoursRaw);

  if (Number.isNaN(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${minutesRaw || "00"} ${suffix}`;
}

function getEventDate(product: ExperienceProduct) {
  return (
    product.event_start_at ||
    product.event_date ||
    product.start_date ||
    product.service_date ||
    null
  );
}

function getEventTime(product: ExperienceProduct) {
  return (
    product.event_start_at ||
    product.event_time ||
    product.start_time ||
    product.service_time ||
    null
  );
}

function getEventVenue(product: ExperienceProduct, fallback = "") {
  return product.venue_name || product.location_name || product.meeting_point || fallback;
}

function getTicketTypes(product: ExperienceProduct) {
  return product.ticket_types || product.event_ticket_types || [];
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

function statusLabel(value: string | null | undefined, t: (key: string) => string) {
  const normalized = String(value || "unknown").toLowerCase();
  const knownKey = `events.status.${normalized}`;
  const translated = t(knownKey);

  if (translated !== knownKey) return translated;

  return String(value || t("events.status.unknown"))
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

function productToForm(product: ExperienceProduct): EventFormState {
  return {
    ...blankForm,
    id: product.id,
    category: String(product.category || product.category_id || product.category_detail?.id || ""),
    name: product.name || "",
    slug: product.slug || "",
    short_description: product.short_description || product.summary || "",
    description: product.description || "",
    base_price: String(product.base_price ?? "0.00"),
    deposit_amount: String(product.deposit_amount ?? "0.00"),
    deposit_percentage: String(product.deposit_percentage ?? "0.00"),
    max_capacity: String(product.max_capacity ?? "100"),
    duration_minutes: String(product.duration_minutes ?? ""),
    location_name: product.location_name || product.venue_name || "",
    meeting_point: product.meeting_point || "",
    status: product.status || "active",
    is_active: product.is_active !== false,
    public_enabled: Boolean(product.public_enabled),
    allow_public_bookings: product.allow_public_bookings !== false,
    seller_enabled: product.seller_enabled !== false,
    requires_pickup_location: Boolean(product.requires_pickup_location),
    supports_pickup: Boolean(product.supports_pickup),
  };
}

function formToPayload(form: EventFormState) {
  const payload: Record<string, unknown> = {
    product_type: "event",
    name: form.name.trim(),
    slug: form.slug.trim() || slugify(form.name),
    short_description: form.short_description.trim(),
    description: form.description.trim(),
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
    requires_pickup_location: form.requires_pickup_location,
    supports_pickup: form.supports_pickup,
  };

  if (form.category) {
    payload.category = Number(form.category);
  }

  return payload;
}

function getProductPublicUrl(organisationSlug: string, product: ExperienceProduct) {
  return `${window.location.origin}/experiences/${organisationSlug}/product/${product.slug}`;
}

export default function TicketingEventsPage() {
  const { t } = useTicketingAdminTranslation();
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ExperienceProduct | null>(null);
  const [editingEvent, setEditingEvent] = useState<ExperienceProduct | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EventFormState>(blankForm);

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
      const eventProducts = allProducts.filter((product) =>
        ["event", "nightlife"].includes(String(product.product_type || ""))
      );

      setProducts(eventProducts);
      setCategories(normalizeList<Category>(categoriesResponse.data));
    } catch (err: any) {
      console.error("Could not load events:", err);
      setError(getErrorMessage(err, t("events.errors.load")));
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

    const ticketTypeCount = products.reduce(
      (sum, product) => sum + getTicketTypes(product).length,
      0
    );

    return {
      total: products.length,
      active,
      publicProducts,
      totalCapacity,
      averagePrice,
      ticketTypeCount,
    };
  }, [products]);

  const filteredEvents = useMemo(() => {
    return products.filter((product) => {
      const searchText = [
        product.name,
        product.slug,
        product.status,
        getEventVenue(product, t("events.fallbacks.venueNotConfigured")),
        product.category_detail?.name,
        product.short_description,
        product.description,
        product.product_type,
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
  }, [products, search, statusFilter, publicFilter, t]);

  function openCreateForm() {
    setEditingEvent(null);
    setSelectedEvent(null);
    setForm(blankForm);
    setShowForm(true);
    setError("");
    setSavedMessage("");
  }

  function openEditForm(product: ExperienceProduct) {
    setEditingEvent(product);
    setSelectedEvent(null);
    setForm(productToForm(product));
    setShowForm(true);
    setError("");
    setSavedMessage("");
  }

  function updateForm<K extends keyof EventFormState>(
    field: K,
    value: EventFormState[K]
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

  async function saveEvent() {
    if (!form.name.trim()) {
      setError(t("events.errors.nameRequired"));
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const payload = formToPayload(form);

      const response = editingEvent
        ? await api.patch(`/ticketing/products/${editingEvent.id}/`, payload, {
            params: requestParams,
          })
        : await api.post("/ticketing/products/", payload, {
            params: requestParams,
          });

      const savedProduct = response.data as ExperienceProduct;

      setProducts((current) => {
        if (editingEvent) {
          return current.map((item) =>
            item.id === savedProduct.id ? savedProduct : item
          );
        }

        return [savedProduct, ...current];
      });

      setShowForm(false);
      setEditingEvent(null);
      setSavedMessage(editingEvent ? t("events.messages.updated") : t("events.messages.created"));
    } catch (err: any) {
      console.error("Could not save event:", err);
      setError(getErrorMessage(err, t("events.errors.save")));
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

      setSelectedEvent((current) =>
        current?.id === product.id ? updatedProduct : current
      );

      setSavedMessage(
        updatedProduct.public_enabled
          ? t("events.messages.nowPublic")
          : t("events.messages.nowHidden")
      );
    } catch (err: any) {
      console.error("Could not update event:", err);
      setError(getErrorMessage(err, t("events.errors.update")));
    } finally {
      setSaving(false);
    }
  }

  async function copyPublicLink(product: ExperienceProduct) {
    try {
      await navigator.clipboard.writeText(getProductPublicUrl(organisationSlug, product));
      setSavedMessage(t("events.messages.linkCopied"));
    } catch {
      setError(t("events.errors.copyLink"));
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title={t("events.page.title")}
        subtitle={t("events.page.subtitle")}
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          {t("events.loading")}
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title={t("events.page.title")}
      subtitle={t("events.page.subtitle")}
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            title={t("events.page.title")}
            value={String(stats.total)}
            helper={t("events.stats.eventsHelper")}
            icon={<Music className="h-6 w-6 text-slate-700" />}
          />
          <StatCard
            title={t("events.stats.active")}
            value={String(stats.active)}
            helper={t("events.stats.activeHelper")}
            icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title={t("events.stats.public")}
            value={String(stats.publicProducts)}
            helper={t("events.stats.publicHelper")}
            icon={<ExternalLink className="h-6 w-6 text-sky-600" />}
          />
          <StatCard
            title={t("events.stats.capacity")}
            value={String(stats.totalCapacity)}
            helper={t("events.stats.capacityHelper")}
            icon={<Users className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title={t("events.stats.averagePrice")}
            value={formatMoney(stats.averagePrice)}
            helper={t("events.stats.ticketTypesCount").replace("{count}", String(stats.ticketTypeCount))}
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
                {t("events.list.title")}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {t("events.list.description")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadPage}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                {t("events.actions.refresh")}
              </button>

              <button
                type="button"
                onClick={openCreateForm}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                {t("events.actions.newEvent")}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_220px_180px]">
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("events.filters.searchPlaceholder")}
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">{t("events.filters.allStatuses")}</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {t(`events.status.${status}`)}
                </option>
              ))}
            </select>

            <select
              value={publicFilter}
              onChange={(event) => setPublicFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">{t("events.filters.allVisibility")}</option>
              <option value="public">{t("events.visibility.public")}</option>
              <option value="hidden">{t("events.visibility.hidden")}</option>
            </select>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            {filteredEvents.length === 0 ? (
              <EmptyState text={t("events.empty.noEvents")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>{t("events.table.event")}</Th>
                      <Th>{t("events.table.dateVenue")}</Th>
                      <Th>{t("events.table.price")}</Th>
                      <Th>{t("events.table.ticketTypes")}</Th>
                      <Th>{t("events.table.capacity")}</Th>
                      <Th>{t("events.table.status")}</Th>
                      <Th>{t("events.table.public")}</Th>
                      <Th>{t("events.table.actions")}</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredEvents.map((product) => (
                      <tr key={product.id}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <EventImage product={product} />
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
                              {formatDate(getEventDate(product))}
                              {getEventTime(product) ? ` · ${formatTime(getEventTime(product))}` : ""}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {getEventVenue(product, t("events.fallbacks.venueNotConfigured"))}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {formatMoney(product.base_price)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {t("events.labels.deposit")}: {formatMoney(product.deposit_amount)}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <p className="font-black text-slate-950">
                            {getTicketTypes(product).length}
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
                            {statusLabel(product.status, t)}
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
                            {product.public_enabled ? t("events.visibility.public") : t("events.visibility.hidden")}
                          </button>
                        </Td>

                        <Td>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedEvent(product)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Eye className="h-4 w-4" />
                              {t("events.actions.view")}
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditForm(product)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Edit3 className="h-4 w-4" />
                              {t("events.actions.edit")}
                            </button>

                            <button
                              type="button"
                              onClick={() => copyPublicLink(product)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Copy className="h-4 w-4" />
                              {t("events.actions.link")}
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
        <EventFormModal
          form={form}
          categories={categories}
          editingEvent={editingEvent}
          saving={saving}
          onClose={() => {
            setShowForm(false);
            setEditingEvent(null);
          }}
          onChange={updateForm}
          onSave={saveEvent}
        />
      )}

      {selectedEvent && (
        <EventDetailModal
          product={selectedEvent}
          organisationSlug={organisationSlug}
          saving={saving}
          onClose={() => setSelectedEvent(null)}
          onEdit={() => openEditForm(selectedEvent)}
          onCopyLink={() => copyPublicLink(selectedEvent)}
          onTogglePublic={() => togglePublic(selectedEvent)}
        />
      )}
    </TicketingPageShell>
  );
}

function EventFormModal({
  form,
  categories,
  editingEvent,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  form: EventFormState;
  categories: Category[];
  editingEvent: ExperienceProduct | null;
  saving: boolean;
  onClose: () => void;
  onChange: <K extends keyof EventFormState>(
    field: K,
    value: EventFormState[K]
  ) => void;
  onSave: () => void;
}) {
  const { t } = useTicketingAdminTranslation();

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">
              {editingEvent ? t("events.form.editEyebrow") : t("events.form.newEyebrow")}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {form.name || t("events.form.defaultTitle")}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {t("events.form.description")}
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
              title={t("events.form.basic.title")}
              description={t("events.form.basic.description")}
              icon={<Music className="h-5 w-5" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label={t("events.form.fields.name")}
                  value={form.name}
                  onChange={(value) => onChange("name", value)}
                  placeholder={t("events.placeholders.name")}
                  required
                />

                <Input
                  label={t("events.form.fields.slug")}
                  value={form.slug}
                  onChange={(value) => onChange("slug", slugify(value))}
                  placeholder={t("events.placeholders.slug")}
                />

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("events.form.fields.category")}
                  </span>
                  <select
                    value={form.category}
                    onChange={(event) => onChange("category", event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                  >
                    <option value="">{t("events.form.noCategory")}</option>
                    {categories.map((category) => (
                      <option key={category.id} value={String(category.id)}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("events.form.fields.status")}
                  </span>
                  <select
                    value={form.status}
                    onChange={(event) => onChange("status", event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {t(`events.status.${status}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <Textarea
                label={t("events.form.fields.shortDescription")}
                value={form.short_description}
                onChange={(value) => onChange("short_description", value)}
                placeholder={t("events.placeholders.shortDescription")}
              />

              <Textarea
                label={t("events.form.fields.fullDescription")}
                value={form.description}
                onChange={(value) => onChange("description", value)}
                placeholder={t("events.placeholders.fullDescription")}
              />
            </Panel>

            <Panel
              title={t("events.form.details.title")}
              description={t("events.form.details.description")}
              icon={<CalendarDays className="h-5 w-5" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label={t("events.form.fields.venue")}
                  value={form.location_name}
                  onChange={(value) => onChange("location_name", value)}
                  placeholder={t("events.placeholders.venue")}
                />

                <Input
                  label={t("events.form.fields.meetingPoint")}
                  value={form.meeting_point}
                  onChange={(value) => onChange("meeting_point", value)}
                  placeholder={t("events.placeholders.meetingPoint")}
                />

                <Input
                  label={t("events.form.fields.basePrice")}
                  type="number"
                  value={form.base_price}
                  onChange={(value) => onChange("base_price", value)}
                  placeholder="65.00"
                />

                <Input
                  label={t("events.form.fields.depositAmount")}
                  type="number"
                  value={form.deposit_amount}
                  onChange={(value) => onChange("deposit_amount", value)}
                  placeholder="20.00"
                />

                <Input
                  label={t("events.form.fields.depositPercentage")}
                  type="number"
                  value={form.deposit_percentage}
                  onChange={(value) => onChange("deposit_percentage", value)}
                  placeholder="0.00"
                />

                <Input
                  label={t("events.form.fields.maxCapacity")}
                  type="number"
                  value={form.max_capacity}
                  onChange={(value) => onChange("max_capacity", value)}
                  placeholder="100"
                />

                <Input
                  label={t("events.form.fields.durationMinutes")}
                  type="number"
                  value={form.duration_minutes}
                  onChange={(value) => onChange("duration_minutes", value)}
                  placeholder="240"
                />
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <Toggle
                  label={t("events.form.toggles.active")}
                  description={t("events.form.toggles.activeDescription")}
                  checked={form.is_active}
                  onChange={(value) => onChange("is_active", value)}
                />

                <Toggle
                  label={t("events.form.toggles.public")}
                  description={t("events.form.toggles.publicDescription")}
                  checked={form.public_enabled}
                  onChange={(value) => onChange("public_enabled", value)}
                />

                <Toggle
                  label={t("events.form.toggles.publicBookings")}
                  description={t("events.form.toggles.publicBookingsDescription")}
                  checked={form.allow_public_bookings}
                  onChange={(value) => onChange("allow_public_bookings", value)}
                />

                <Toggle
                  label={t("events.form.toggles.sellerEnabled")}
                  description={t("events.form.toggles.sellerEnabledDescription")}
                  checked={form.seller_enabled}
                  onChange={(value) => onChange("seller_enabled", value)}
                />

                <Toggle
                  label={t("events.form.toggles.supportsPickup")}
                  description={t("events.form.toggles.supportsPickupDescription")}
                  checked={form.supports_pickup}
                  onChange={(value) => onChange("supports_pickup", value)}
                />

                <Toggle
                  label={t("events.form.toggles.requiresPickup")}
                  description={t("events.form.toggles.requiresPickupDescription")}
                  checked={form.requires_pickup_location}
                  onChange={(value) => onChange("requires_pickup_location", value)}
                />
              </div>
            </Panel>
          </div>

          <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-black text-amber-950">
              {t("events.form.ticketTypesNote.title")}
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
              {t("events.form.ticketTypesNote.description")}
            </p>
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
              {editingEvent ? t("events.actions.saveEvent") : t("events.actions.createEvent")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventDetailModal({
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
  const { t } = useTicketingAdminTranslation();

  const ticketTypes = getTicketTypes(product);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="flex items-center gap-4">
            <EventImage product={product} large />
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-600">
                {t("events.detail.eyebrow")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {product.name}
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {getEventVenue(product, t("events.fallbacks.venueNotConfigured"))}
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
              {t("events.actions.edit")}
            </button>

            <button
              type="button"
              onClick={onCopyLink}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              <Copy className="h-4 w-4" />
              {t("events.actions.copyPublicLink")}
            </button>

            <Link
              to={`/experiences/${organisationSlug}/product/${product.slug}`}
              target="_blank"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              <ExternalLink className="h-4 w-4" />
              {t("events.actions.openPublicPage")}
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
              {product.public_enabled ? t("events.actions.hidePublic") : t("events.actions.makePublic")}
            </button>
          </div>

          <section className="mt-5 grid gap-4 lg:grid-cols-4">
            <InfoCard
              icon={<DollarSign className="h-5 w-5" />}
              label={t("events.detail.price")}
              value={formatMoney(product.base_price)}
              helper={`${t("events.labels.deposit")}: ${formatMoney(product.deposit_amount)}`}
            />
            <InfoCard
              icon={<CalendarDays className="h-5 w-5" />}
              label={t("events.detail.date")}
              value={formatDate(getEventDate(product))}
              helper={formatTime(getEventTime(product))}
            />
            <InfoCard
              icon={<Users className="h-5 w-5" />}
              label={t("events.detail.capacity")}
              value={String(product.max_capacity || "—")}
              helper={t("events.detail.capacityHelper")}
            />
            <InfoCard
              icon={<Ticket className="h-5 w-5" />}
              label={t("events.detail.ticketTypes")}
              value={String(ticketTypes.length)}
              helper={statusLabel(product.status, t)}
            />
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              {t("events.detail.descriptionTitle")}
            </h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
              {product.description ||
                product.short_description ||
                t("events.fallbacks.noDescription")}
            </p>
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              {t("events.detail.informationTitle")}
            </h3>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <InfoLine label={t("events.form.fields.venue")} value={getEventVenue(product, t("events.fallbacks.venueNotConfigured"))} />
              <InfoLine label={t("events.form.fields.meetingPoint")} value={product.meeting_point || "—"} />
              <InfoLine label={t("events.detail.duration")} value={formatMinutes(product.duration_minutes, t)} />
              <InfoLine label={t("events.detail.publicUrl")} value={getProductPublicUrl(organisationSlug, product)} />
            </div>
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              {t("events.detail.ticketTypes")}
            </h3>

            {ticketTypes.length === 0 ? (
              <EmptyState text={t("events.empty.noTicketTypes")} />
            ) : (
              <div className="mt-3 space-y-2">
                {ticketTypes.map((ticketType, index) => (
                  <div
                    key={ticketType.id || index}
                    className="flex flex-col justify-between gap-3 rounded-2xl bg-slate-50 p-3 text-sm sm:flex-row sm:items-center"
                  >
                    <div>
                      <p className="font-black text-slate-950">
                        {ticketType.name || ticketType.title || `${t("events.detail.ticketType")} ${index + 1}`}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-500">
                        {t("events.detail.capacity")}: {ticketType.capacity || ticketType.available_quantity || "—"}
                      </p>
                    </div>

                    <p className="font-black text-slate-950">
                      {formatMoney(ticketType.price || ticketType.base_price)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function EventImage({
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
        <Music className={large ? "h-8 w-8" : "h-5 w-5"} />
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
