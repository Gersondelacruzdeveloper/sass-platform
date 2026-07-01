// src/modules/ticketing/pages/TicketingIntegrationsPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Package,
  Plug,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Ticket,
} from "lucide-react";

import api from "../../../api/axios";
import TicketingPageShell from "../components/TicketingPageShell";

type TicketingSettings = {
  id?: number;
  organisation_name?: string;
  module_name?: string;
  public_brand_name?: string;
  default_currency?: string;
  wellet_enabled?: boolean;
  is_active?: boolean;
};

type ExternalProviderConfig = {
  id?: number;
  organisation?: number;
  organisation_name?: string;
  provider: "wellet" | "other";
  is_enabled: boolean;
  api_base_url: string;
  api_key: string;
  api_secret?: string;
  show_id: string;
  category_id: string;
  currency: string;
  lang: string;
  include_table: boolean;
  extra_settings: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

type ExternalProviderProductSnapshot = {
  id: number;
  organisation?: number;
  organisation_name?: string;
  provider: string;
  product?: number | null;
  product_name?: string | null;
  external_product_id: string;
  external_name: string;
  price: string | number;
  currency: string;
  service_date?: string | null;
  raw_data?: Record<string, unknown>;
  created_at?: string;
};

type WelletLiveResult = {
  ok?: boolean;
  status_code?: number | null;
  data?: unknown;
  error?: string;
  url?: string;
};

type WelletProductsResponse = {
  provider: "wellet";
  enabled: boolean;
  message?: string;
  service_date?: string;
  request_url_should_match?: string;
  config?: {
    api_base_url?: string;
    show_id?: string;
    showId?: string;
    category_id?: string;
    categoryId?: string;
    currency?: string;
    lang?: string;
    include_table?: boolean;
    includeTable?: boolean;
  };
  live?: WelletLiveResult;
  sync?: unknown;
  snapshots?: ExternalProviderProductSnapshot[];
};

type WelletLiveProduct = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stock: number | null;
  itemsAvailable: number | null;
  isSoldOut: boolean;
  isUnavailable: boolean;
  performanceId: string;
  timeStart: string;
  timeEnd: string;
  timeCheckIn: string;
  features: string[];
  raw: Record<string, unknown>;
};

type IntegrationHealth = "ready" | "disabled" | "missing" | "warning";

const initialSettings: TicketingSettings = {
  module_name: "Tours, Tickets & Transfers",
  public_brand_name: "PCD Experiences",
  default_currency: "USD",
  wellet_enabled: false,
  is_active: true,
};

const initialWelletConfig: ExternalProviderConfig = {
  provider: "wellet",
  is_enabled: false,
  api_base_url: "",
  api_key: "",
  api_secret: "",
  show_id: "",
  category_id: "",
  currency: "USD",
  lang: "en",
  include_table: true,
  extra_settings: {
    products_path: "",
    availability_path: "",
    booking_path: "",
    product_param: "",
  },
};

function getOrganisationSlugFromPath() {
  const match = window.location.pathname.match(/\/ticketing\/([^/]+)/);
  return match?.[1] || "";
}

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

function normalizeText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
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

function formatMoney(value?: string | number | null, currency = "USD") {
  const number = numberValue(value);

  return `${currency} ${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        value: null,
        error: "Extra settings must be a JSON object.",
      };
    }

    return {
      value: parsed as Record<string, unknown>,
      error: "",
    };
  } catch (err: any) {
    return {
      value: null,
      error: err?.message || "Invalid JSON.",
    };
  }
}

function getIntegrationHealth(
  settings: TicketingSettings,
  config: ExternalProviderConfig | null
): IntegrationHealth {
  if (!settings.wellet_enabled) return "disabled";
  if (!config) return "missing";
  if (!config.is_enabled) return "warning";

  // For the current Wellet endpoint, api_key can be optional depending on account.
  // The important required fields are base URL and show ID.
  if (!config.api_base_url || !config.show_id) return "missing";

  return "ready";
}

function getHealthConfig(health: IntegrationHealth) {
  if (health === "ready") {
    return {
      label: "Ready",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    };
  }

  if (health === "disabled") {
    return {
      label: "Module disabled",
      className: "bg-slate-100 text-slate-600 ring-slate-200",
    };
  }

  if (health === "warning") {
    return {
      label: "Config disabled",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
    };
  }

  return {
    label: "Missing setup",
    className: "bg-red-50 text-red-700 ring-red-200",
  };
}

function maskSecret(value?: string) {
  if (!value) return "Not configured";
  if (value.length <= 6) return "••••••";
  return `${value.slice(0, 3)}••••••${value.slice(-3)}`;
}

function cleanLiveText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function asObject(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function getFirstPrice(product: Record<string, any>) {
  const prices = Array.isArray(product.prices) ? product.prices : [];
  const firstPrice = asObject(prices[0]) || {};

  const amount =
    firstPrice.amount ??
    firstPrice.amountWithoutDiscount ??
    product.amount ??
    product.price ??
    0;

  const currency =
    firstPrice.currencyCode ||
    firstPrice.currency ||
    product.currencyCode ||
    product.currency ||
    "USD";

  return {
    amount: numberValue(amount),
    currency: String(currency || "USD"),
  };
}

function getNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function extractWelletLiveProducts(data: unknown): WelletLiveProduct[] {
  const root = asObject(data);
  if (!root) return [];

  const groups = Array.isArray(root.options) ? root.options : [];
  const products: WelletLiveProduct[] = [];

  groups.forEach((group) => {
    const groupObject = asObject(group);
    if (!groupObject) return;

    const performance = asObject(groupObject.performance) || {};
    const groupProducts = Array.isArray(groupObject.products)
      ? groupObject.products
      : [];

    groupProducts.forEach((item) => {
      const product = asObject(item);
      if (!product) return;

      const price = getFirstPrice(product);

      products.push({
        id: cleanLiveText(product.id),
        name: cleanLiveText(product.name) || "Unnamed Wellet product",
        description: cleanLiveText(product.description),
        price: price.amount,
        currency: price.currency,
        stock: getNumberOrNull(product.stock),
        itemsAvailable: getNumberOrNull(product.itemsAvailable),
        isSoldOut: Boolean(product.isSoldOut),
        isUnavailable: Boolean(product.isUnavailable),
        performanceId: cleanLiveText(performance.id),
        timeStart: cleanLiveText(performance.timeStart || performance.time),
        timeEnd: cleanLiveText(performance.timeEnd),
        timeCheckIn: cleanLiveText(performance.timeCheckIn),
        features: Array.isArray(product.features)
          ? product.features.map(cleanLiveText).filter(Boolean)
          : [],
        raw: product,
      });
    });
  });

  return products;
}

function buildWelletPreviewUrl(config: ExternalProviderConfig, serviceDate: string) {
  const baseUrl = config.api_base_url.trim();

  if (!baseUrl) return "";

  const params = new URLSearchParams();

  if (config.show_id) params.set("showId", config.show_id);
  if (serviceDate) params.set("date", serviceDate);
  params.set("currency", config.currency || "USD");
  params.set("lang", config.lang || "en");
  params.set("includeTable", config.include_table ? "true" : "false");
  if (config.category_id) params.set("categoryId", config.category_id);

  return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${params.toString()}`;
}

function getDefaultExtraSettingsText(current?: Record<string, unknown>) {
  return safeJsonStringify({
    products_path: "",
    availability_path: "",
    booking_path: "",
    product_param: "",
    ...(current || {}),
  });
}

export default function TicketingIntegrationsPage() {
  const organisationSlug = getOrganisationSlugFromPath();

  const [settings, setSettings] = useState<TicketingSettings>(initialSettings);
  const [welletConfig, setWelletConfig] =
    useState<ExternalProviderConfig | null>(null);
  const [welletForm, setWelletForm] =
    useState<ExternalProviderConfig>(initialWelletConfig);
  const [extraSettingsText, setExtraSettingsText] = useState(
    getDefaultExtraSettingsText(initialWelletConfig.extra_settings)
  );
  const [welletProducts, setWelletProducts] =
    useState<WelletProductsResponse | null>(null);
  const [snapshots, setSnapshots] = useState<ExternalProviderProductSnapshot[]>(
    []
  );

  const [search, setSearch] = useState("");
  const [serviceDate, setServiceDate] = useState(todayIsoDate());
  const [showApiSecret, setShowApiSecret] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [error, setError] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [welletLockedMessage, setWelletLockedMessage] = useState("");

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  const health = getIntegrationHealth(settings, welletConfig);
  const healthConfig = getHealthConfig(health);

  const liveProducts = useMemo(() => {
    return extractWelletLiveProducts(welletProducts?.live?.data);
  }, [welletProducts]);

  const requestUrlPreview = useMemo(() => {
    return (
      welletProducts?.live?.url ||
      buildWelletPreviewUrl(welletForm, serviceDate)
    );
  }, [welletProducts, welletForm, serviceDate]);

  const filteredLiveProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return liveProducts;

    return liveProducts.filter((product) => {
      const searchText = [
        product.id,
        product.name,
        product.description,
        product.currency,
        product.performanceId,
        ...product.features,
      ]
        .join(" ")
        .toLowerCase();

      return searchText.includes(query);
    });
  }, [liveProducts, search]);

  const filteredSnapshots = useMemo(() => {
    return snapshots.filter((snapshot) => {
      const searchText = [
        snapshot.external_product_id,
        snapshot.external_name,
        snapshot.product_name,
        snapshot.currency,
        snapshot.provider,
      ]
        .join(" ")
        .toLowerCase();

      if (search.trim() && !searchText.includes(search.trim().toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [snapshots, search]);

  const stats = useMemo(() => {
    const linked = snapshots.filter((snapshot) => snapshot.product).length;
    const unlinked = snapshots.length - linked;
    const totalValue = liveProducts.length
      ? liveProducts.reduce((sum, product) => sum + product.price, 0)
      : snapshots.reduce((sum, snapshot) => sum + numberValue(snapshot.price), 0);

    return {
      liveProducts: liveProducts.length,
      snapshots: snapshots.length,
      linked,
      unlinked,
      totalValue,
      currency:
        welletForm.currency ||
        welletProducts?.config?.currency ||
        settings.default_currency ||
        "USD",
    };
  }, [
    snapshots,
    liveProducts,
    welletForm.currency,
    welletProducts,
    settings.default_currency,
  ]);

  async function loadSettings() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");
      setSavedMessage("");
      setWelletLockedMessage("");

      const settingsResponse = await api.get<TicketingSettings>(
        "/ticketing/settings/mine/",
        {
          params: requestParams,
        }
      );

      const nextSettings = {
        ...initialSettings,
        ...settingsResponse.data,
        wellet_enabled: normalizeBoolean(
          settingsResponse.data.wellet_enabled,
          false
        ),
        default_currency: normalizeText(
          settingsResponse.data.default_currency,
          "USD"
        ),
      };

      setSettings(nextSettings);

      if (!nextSettings.wellet_enabled) {
        setWelletConfig(null);
        setWelletForm({
          ...initialWelletConfig,
          currency: nextSettings.default_currency || "USD",
        });
        setExtraSettingsText(
          getDefaultExtraSettingsText(initialWelletConfig.extra_settings)
        );
        setWelletProducts(null);
        setSnapshots([]);
        setWelletLockedMessage(
          "Wellet / Coco Bongo is disabled for this organisation. Enable it below and save first."
        );
        return;
      }

      await Promise.all([loadWelletSettings(), loadWelletProducts(false)]);
    } catch (err: any) {
      console.error("Could not load integrations:", err);
      setError(getErrorMessage(err, "Could not load integrations."));
    } finally {
      setLoading(false);
    }
  }

  async function loadWelletSettings() {
    try {
      const response = await api.get<ExternalProviderConfig>(
        "/ticketing/integrations/wellet/settings/",
        {
          params: requestParams,
        }
      );

      const config = {
        ...initialWelletConfig,
        ...response.data,
        provider: "wellet" as const,
        is_enabled: normalizeBoolean(response.data.is_enabled, false),
        api_base_url: normalizeText(response.data.api_base_url),
        api_key: normalizeText(response.data.api_key),
        api_secret: "",
        show_id: normalizeText(response.data.show_id),
        category_id: normalizeText(response.data.category_id),
        currency: normalizeText(response.data.currency, "USD"),
        lang: normalizeText(response.data.lang, "en"),
        include_table: normalizeBoolean(response.data.include_table, true),
        extra_settings: {
          ...initialWelletConfig.extra_settings,
          ...(response.data.extra_settings || {}),
        },
      };

      setWelletConfig(config);
      setWelletForm(config);
      setExtraSettingsText(getDefaultExtraSettingsText(config.extra_settings));
      setWelletLockedMessage("");
    } catch (err: any) {
      console.error("Could not load Wellet settings:", err);

      if (err?.response?.status === 403) {
        setWelletLockedMessage(
          getErrorMessage(
            err,
            "Wellet / Coco Bongo is not enabled for this organisation."
          )
        );
        setWelletConfig(null);
        setWelletForm({
          ...initialWelletConfig,
          currency: settings.default_currency || "USD",
        });
        return;
      }

      throw err;
    }
  }

  async function loadWelletProducts(sync = false) {
    try {
      setLoadingProducts(true);

      const response = await api.get<WelletProductsResponse>(
        "/ticketing/integrations/wellet/products/",
        {
          params: {
            ...requestParams,
            service_date: serviceDate || undefined,
            sync: sync ? "true" : undefined,
          },
        }
      );

      setWelletProducts(response.data);
      setSnapshots(
        normalizeList<ExternalProviderProductSnapshot>(response.data.snapshots)
      );
    } catch (err: any) {
      console.error("Could not load Wellet products:", err);

      if ([400, 403].includes(err?.response?.status)) {
        setWelletProducts(null);
        setSnapshots([]);
        setWelletLockedMessage(
          getErrorMessage(
            err,
            "Wellet products are not available until the integration is enabled and configured."
          )
        );
        return;
      }

      throw err;
    } finally {
      setLoadingProducts(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, [organisationSlug]);

  function updateSettingsField<K extends keyof TicketingSettings>(
    field: K,
    value: TicketingSettings[K]
  ) {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateWelletField<K extends keyof ExternalProviderConfig>(
    field: K,
    value: ExternalProviderConfig[K]
  ) {
    setWelletForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function saveIntegration() {
    const parsedExtraSettings = parseJsonObject(extraSettingsText);

    if (parsedExtraSettings.error) {
      setJsonError(parsedExtraSettings.error);
      return;
    }

    if (settings.wellet_enabled && welletForm.is_enabled) {
      if (!welletForm.api_base_url.trim()) {
        setError("API base URL is required when Wellet config is enabled.");
        return;
      }

      if (!welletForm.show_id.trim()) {
        setError("Show ID is required when Wellet config is enabled.");
        return;
      }
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");
      setJsonError("");

      const settingsResponse = await api.patch<TicketingSettings>(
        "/ticketing/settings/mine/",
        {
          wellet_enabled: Boolean(settings.wellet_enabled),
        },
        {
          params: requestParams,
        }
      );

      setSettings((current) => ({
        ...current,
        ...settingsResponse.data,
      }));

      if (settings.wellet_enabled) {
        const payload: Partial<ExternalProviderConfig> = {
          provider: "wellet",
          is_enabled: welletForm.is_enabled,
          api_base_url: welletForm.api_base_url.trim(),
          api_key: welletForm.api_key.trim(),
          show_id: welletForm.show_id.trim(),
          category_id: welletForm.category_id.trim(),
          currency: (welletForm.currency || settings.default_currency || "USD")
            .trim()
            .toUpperCase(),
          lang: (welletForm.lang || "en").trim(),
          include_table: welletForm.include_table,
          extra_settings: parsedExtraSettings.value || {},
        };

        if (welletForm.api_secret?.trim()) {
          payload.api_secret = welletForm.api_secret.trim();
        }

        const welletResponse = await api.patch<ExternalProviderConfig>(
          "/ticketing/integrations/wellet/settings/",
          payload,
          {
            params: requestParams,
          }
        );

        const nextConfig = {
          ...initialWelletConfig,
          ...welletResponse.data,
          api_secret: "",
          extra_settings: {
            ...initialWelletConfig.extra_settings,
            ...(welletResponse.data.extra_settings || {}),
          },
        };

        setWelletConfig(nextConfig);
        setWelletForm(nextConfig);
        setExtraSettingsText(getDefaultExtraSettingsText(nextConfig.extra_settings));
      } else {
        setWelletConfig(null);
        setWelletProducts(null);
        setSnapshots([]);
      }

      setSavedMessage("Integration settings saved.");
    } catch (err: any) {
      console.error("Could not save integrations:", err);
      setError(getErrorMessage(err, "Could not save integrations."));
    } finally {
      setSaving(false);
    }
  }

  async function refreshWelletProducts() {
    try {
      setSaving(true);
      setError("");
      setSavedMessage("");
      await loadWelletProducts(true);
      setSavedMessage("Wellet live products loaded and snapshots refreshed.");
    } catch (err: any) {
      console.error("Could not refresh Wellet products:", err);
      setError(getErrorMessage(err, "Could not refresh Wellet products."));
    } finally {
      setSaving(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setSavedMessage(`${label} copied.`);
    } catch {
      setError(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title="Integrations"
        subtitle="Manage optional integrations such as Wellet / Coco Bongo."
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          Loading integrations...
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title="Integrations"
      subtitle="Manage optional integrations such as Wellet / Coco Bongo."
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            title="Wellet module"
            value={settings.wellet_enabled ? "Enabled" : "Disabled"}
            helper="Organisation-level switch"
            icon={<Plug className="h-6 w-6 text-slate-700" />}
          />
          <StatCard
            title="Config"
            value={welletForm.is_enabled ? "Active" : "Inactive"}
            helper="Provider config state"
            icon={<Settings className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title="Live products"
            value={String(stats.liveProducts)}
            helper="From Wellet API response"
            icon={<Ticket className="h-6 w-6 text-purple-600" />}
          />
          <StatCard
            title="Snapshots"
            value={String(stats.snapshots)}
            helper={`${stats.linked} linked · ${stats.unlinked} unlinked`}
            icon={<Database className="h-6 w-6 text-sky-600" />}
          />
          <StatCard
            title="Live value"
            value={formatMoney(stats.totalValue, stats.currency)}
            helper="Sum of visible live products"
            icon={<Package className="h-6 w-6 text-emerald-600" />}
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

        {welletLockedMessage && (
          <div className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            {welletLockedMessage}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-amber-600">
                Optional provider
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                Wellet / Coco Bongo
              </h2>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
                Configure the backend-only Wellet connection and preview the live Coco Bongo
                products returned by your SaaS backend.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadSettings}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>

              <button
                type="button"
                onClick={saveIntegration}
                disabled={saving}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save integrations
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <Panel
            title="Wellet settings"
            description="Use the exact Wellet products endpoint and query values."
            icon={<Plug className="h-5 w-5" />}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Toggle
                label="Enable Wellet for this organisation"
                description="Controls TicketingSettings.wellet_enabled."
                checked={Boolean(settings.wellet_enabled)}
                onChange={(value) => updateSettingsField("wellet_enabled", value)}
              />

              <Toggle
                label="Enable provider config"
                description="Controls ExternalProviderConfig.is_enabled."
                checked={Boolean(welletForm.is_enabled)}
                onChange={(value) => updateWelletField("is_enabled", value)}
                disabled={!settings.wellet_enabled}
              />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Input
                label="API base URL"
                value={welletForm.api_base_url}
                onChange={(value) => updateWelletField("api_base_url", value)}
                placeholder="https://api2.wellet.fun/products/get"
                disabled={!settings.wellet_enabled}
              />

              <Input
                label="API key / token"
                value={welletForm.api_key}
                onChange={(value) => updateWelletField("api_key", value)}
                placeholder="Optional if Wellet requires Authorization"
                icon={<KeyRound className="h-4 w-4" />}
                disabled={!settings.wellet_enabled}
              />

              <SecretInput
                label="API secret"
                value={welletForm.api_secret || ""}
                onChange={(value) => updateWelletField("api_secret", value)}
                placeholder={
                  welletConfig?.id
                    ? "Leave blank to keep current secret"
                    : "Optional provider API secret"
                }
                visible={showApiSecret}
                onToggleVisible={() => setShowApiSecret((current) => !current)}
                disabled={!settings.wellet_enabled}
              />

              <Input
                label="Show ID"
                value={welletForm.show_id}
                onChange={(value) => updateWelletField("show_id", value)}
                placeholder="4"
                disabled={!settings.wellet_enabled}
              />

              <Input
                label="Category ID"
                value={welletForm.category_id}
                onChange={(value) => updateWelletField("category_id", value)}
                placeholder="1"
                disabled={!settings.wellet_enabled}
              />

              <Input
                label="Currency"
                value={welletForm.currency}
                onChange={(value) =>
                  updateWelletField("currency", value.toUpperCase())
                }
                placeholder="USD"
                disabled={!settings.wellet_enabled}
              />

              <Input
                label="Language"
                value={welletForm.lang}
                onChange={(value) => updateWelletField("lang", value)}
                placeholder="en"
                disabled={!settings.wellet_enabled}
              />

              <Toggle
                label="Include table"
                description="Sends includeTable=true to Wellet."
                checked={Boolean(welletForm.include_table)}
                onChange={(value) => updateWelletField("include_table", value)}
                disabled={!settings.wellet_enabled}
              />
            </div>
          </Panel>

          <Panel
            title="Connection status"
            description="Readiness check and URL preview."
            icon={<ShieldCheck className="h-5 w-5" />}
          >
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-950">
                  Integration health
                </p>
                <span
                  className={[
                    "inline-flex rounded-full px-3 py-1 text-xs font-black ring-1",
                    healthConfig.className,
                  ].join(" ")}
                >
                  {healthConfig.label}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <StatusLine
                  label="Organisation switch"
                  good={Boolean(settings.wellet_enabled)}
                  goodText="Enabled"
                  badText="Disabled"
                />
                <StatusLine
                  label="Provider config"
                  good={Boolean(welletForm.is_enabled)}
                  goodText="Enabled"
                  badText="Disabled"
                />
                <StatusLine
                  label="API base URL"
                  good={Boolean(welletForm.api_base_url)}
                  goodText="Configured"
                  badText="Missing"
                />
                <StatusLine
                  label="API key"
                  good={Boolean(welletForm.api_key)}
                  goodText="Configured"
                  badText="Optional / blank"
                />
                <StatusLine
                  label="Show ID"
                  good={Boolean(welletForm.show_id)}
                  goodText="Configured"
                  badText="Missing"
                />
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-950 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">Backend request URL</p>
                  <p className="mt-2 break-all font-mono text-xs font-semibold leading-5 text-slate-200">
                    {requestUrlPreview || "Save a base URL to preview the request."}
                  </p>
                </div>

                {requestUrlPreview && (
                  <button
                    type="button"
                    onClick={() => copy(requestUrlPreview, "Request URL")}
                    className="rounded-xl bg-white/10 p-2 text-white transition hover:bg-white/20"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </Panel>
        </section>

        <Panel
          title="Advanced extra settings"
          description="For this Wellet URL, keep products_path empty because the base URL already points to /products/get."
          icon={<Settings className="h-5 w-5" />}
        >
          <textarea
            value={extraSettingsText}
            onChange={(event) => {
              setExtraSettingsText(event.target.value);
              setJsonError("");
            }}
            disabled={!settings.wellet_enabled}
            className="min-h-44 w-full rounded-3xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-sm font-semibold leading-6 text-slate-100 outline-none focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            spellCheck={false}
          />

          {jsonError && (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
              {jsonError}
            </p>
          )}
        </Panel>

        <Panel
          title="Wellet / Coco Bongo live products"
          description="Products returned by Wellet for the selected date. Use Load products to call your backend and sync snapshots."
          icon={<Database className="h-5 w-5" />}
        >
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div className="grid flex-1 gap-3 xl:grid-cols-[1fr_190px]">
              <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search Wellet product, ID, description..."
                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                />
              </div>

              <input
                type="date"
                value={serviceDate}
                onChange={(event) => setServiceDate(event.target.value)}
                className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
              />
            </div>

            <button
              type="button"
              onClick={refreshWelletProducts}
              disabled={saving || loadingProducts || !settings.wellet_enabled}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving || loadingProducts ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Load products
            </button>
          </div>

          {welletProducts?.live?.error && (
            <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-700">
              {welletProducts.live.error}
            </div>
          )}

          {welletProducts?.message && (
            <div className="mt-4 rounded-3xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold leading-6 text-sky-800">
              {welletProducts.message}
            </div>
          )}

          {welletProducts?.live && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge label={`HTTP ${welletProducts.live.status_code || "—"}`} />
              <Badge label={welletProducts.live.ok ? "Live OK" : "Live error"} />
              <Badge label={`${liveProducts.length} live products`} />
              <Badge label={`${snapshots.length} snapshots`} />
            </div>
          )}

          <div className="mt-5">
            {loadingProducts ? (
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-sm font-black text-slate-600">
                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-amber-600" />
                Loading Wellet products...
              </div>
            ) : filteredLiveProducts.length === 0 ? (
              <EmptyState text="No live Wellet products found. Select a date and click Load products." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredLiveProducts.map((product) => (
                  <LiveProductCard
                    key={`${product.performanceId}-${product.id}`}
                    product={product}
                    onCopy={copy}
                  />
                ))}
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Synced snapshots"
          description="Database snapshots created from Wellet when Load products uses sync=true."
          icon={<Database className="h-5 w-5" />}
        >
          <div className="overflow-hidden rounded-3xl border border-slate-200">
            {filteredSnapshots.length === 0 ? (
              <EmptyState text="No Wellet product snapshots found yet." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>External product</Th>
                      <Th>External ID</Th>
                      <Th>Linked product</Th>
                      <Th>Price</Th>
                      <Th>Service date</Th>
                      <Th>Created</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredSnapshots.map((snapshot) => (
                      <tr key={snapshot.id}>
                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {snapshot.external_name || "Unnamed product"}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {snapshot.provider}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <button
                            type="button"
                            onClick={() =>
                              copy(
                                snapshot.external_product_id,
                                "External product ID"
                              )
                            }
                            className="inline-flex items-center gap-2 font-black text-amber-700"
                          >
                            <Copy className="h-4 w-4" />
                            {snapshot.external_product_id || "—"}
                          </button>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {snapshot.product_name || "Not linked"}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {snapshot.product
                                ? `Product #${snapshot.product}`
                                : "Snapshot only"}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <p className="font-black text-slate-950">
                            {formatMoney(snapshot.price, snapshot.currency)}
                          </p>
                        </Td>

                        <Td>{snapshot.service_date || "—"}</Td>
                        <Td>{formatDateTime(snapshot.created_at)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveIntegration}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save integrations
          </button>
        </div>
      </div>
    </TicketingPageShell>
  );
}

function LiveProductCard({
  product,
  onCopy,
}: {
  product: WelletLiveProduct;
  onCopy: (value: string, label: string) => void;
}) {
  const soldOut = product.isSoldOut || product.isUnavailable;

  return (
    <article
      className={[
        "rounded-3xl border bg-white p-5 shadow-sm",
        soldOut ? "border-red-200" : "border-slate-200",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-black text-slate-950">
              {product.name}
            </h3>

            {soldOut ? (
              <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700 ring-1 ring-red-200">
                Sold out
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
                Available
              </span>
            )}
          </div>

          {product.description && (
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {product.description}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xl font-black text-slate-950">
            {formatMoney(product.price, product.currency)}
          </p>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            per person
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <MiniInfo label="External ID" value={product.id || "—"} />
        <MiniInfo label="Available" value={String(product.itemsAvailable ?? product.stock ?? "—")} />
        <MiniInfo label="Performance" value={product.performanceId || "—"} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {product.timeStart && <Badge label={`Start ${product.timeStart}`} />}
        {product.timeEnd && <Badge label={`End ${product.timeEnd}`} />}
        {product.timeCheckIn && <Badge label={`Check-in ${product.timeCheckIn}`} />}
      </div>

      {product.features.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {product.features.slice(0, 5).map((feature) => (
            <span
              key={feature}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600"
            >
              {feature}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCopy(product.id, "External product ID")}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
        >
          <Copy className="h-4 w-4" />
          Copy ID
        </button>
      </div>
    </article>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-slate-800">{value}</p>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-100">
      {label}
    </span>
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
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          {icon}
        </div>

        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
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

function Input({
  label,
  value,
  onChange,
  placeholder,
  icon,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-amber-400 focus-within:bg-white">
        {icon && <div className="text-slate-400">{icon}</div>}

        <input
          type="text"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </label>
  );
}

function SecretInput({
  label,
  value,
  onChange,
  placeholder,
  visible,
  onToggleVisible,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  visible: boolean;
  onToggleVisible: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-amber-400 focus-within:bg-white">
        <KeyRound className="h-4 w-4 text-slate-400" />

        <input
          type={visible ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          onClick={onToggleVisible}
          className="text-slate-500"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {!value && (
        <p className="mt-2 text-xs font-bold text-slate-500">
          Saved value: {maskSecret(value)}
        </p>
      )}
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4",
        disabled ? "opacity-60" : "",
      ].join(" ")}
    >
      <span>
        <span className="block text-sm font-black text-slate-800">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
          {description}
        </span>
      </span>

      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-amber-500 disabled:cursor-not-allowed"
      />
    </label>
  );
}

function StatusLine({
  label,
  good,
  goodText,
  badText,
}: {
  label: string;
  good: boolean;
  goodText: string;
  badText: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <span
        className={[
          "rounded-full px-3 py-1 text-xs font-black ring-1",
          good
            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
            : "bg-red-50 text-red-700 ring-red-200",
        ].join(" ")}
      >
        {good ? goodText : badText}
      </span>
    </div>
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
