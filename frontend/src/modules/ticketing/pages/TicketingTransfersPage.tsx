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
  Trash2,
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

type TransferPriceBand = {
  id: number;
  route: number;
  route_name?: string;
  name?: string;
  min_passengers: number;
  max_passengers: number;
  vehicle_type?: string;
  one_way_price: string | number;
  round_trip_price?: string | number | null;
  is_active?: boolean;
  sort_order?: number;
};

type TransferRoute = {
  id: number;
  product: number;
  product_name?: string;
  origin: string;
  destination: string;
  airport?: string;
  vehicle_type?: string;
  is_round_trip?: boolean;
  base_passengers?: number;
  max_passengers?: number;
  price?: string | number;
  round_trip_price?: string | number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
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
  long_description?: string | null;
  description?: string | null;
  summary?: string | null;

  base_price?: string | number;
  deposit_amount?: string | number;
  deposit_percentage?: string | number;
  capacity?: number | string | null;
  max_capacity?: number | string | null;
  duration_text?: string | null;
  duration_minutes?: number | string | null;
  location?: string | null;
  location_name?: string | null;
  address?: string | null;
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
  long_description: string;
  base_price: string;
  deposit_amount: string;
  deposit_percentage: string;
  capacity: string;
  duration_text: string;
  location: string;
  address: string;
  status: ProductStatus;
  is_active: boolean;
  public_enabled: boolean;
  seller_enabled: boolean;
};

type RouteFormState = {
  id?: number | null;
  product: string;
  origin: string;
  destination: string;
  airport: string;
  vehicle_type: string;
  is_round_trip: boolean;
  base_passengers: string;
  max_passengers: string;
  price: string;
  round_trip_price: string;
  is_active: boolean;
};

type BandFormState = {
  id?: number | null;
  route: string;
  name: string;
  min_passengers: string;
  max_passengers: string;
  vehicle_type: string;
  one_way_price: string;
  round_trip_price: string;
  is_active: boolean;
  sort_order: string;
};

type QuoteResult = {
  route?: string;
  route_id?: number;
  price_band?: string;
  price_band_id?: number;
  vehicle?: string;
  vehicle_type?: string;
  passengers?: number;
  round_trip?: boolean;
  price?: string | number;
  total_price?: string | number;
  one_way_price?: string | number;
  round_trip_price?: string | number;
};

const blankTransferForm: TransferFormState = {
  id: null,
  category: "",
  name: "",
  slug: "",
  short_description: "",
  long_description: "",
  base_price: "0.00",
  deposit_amount: "0.00",
  deposit_percentage: "0.00",
  capacity: "1",
  duration_text: "",
  location: "",
  address: "",
  status: "active",
  is_active: true,
  public_enabled: true,
  seller_enabled: true,
};

const blankRouteForm: RouteFormState = {
  id: null,
  product: "",
  origin: "",
  destination: "",
  airport: "",
  vehicle_type: "van",
  is_round_trip: false,
  base_passengers: "1",
  max_passengers: "6",
  price: "0.00",
  round_trip_price: "0.00",
  is_active: true,
};

const blankBandForm: BandFormState = {
  id: null,
  route: "",
  name: "",
  min_passengers: "1",
  max_passengers: "6",
  vehicle_type: "van",
  one_way_price: "0.00",
  round_trip_price: "",
  is_active: true,
  sort_order: "0",
};

const statusOptionValues = ["draft", "active", "inactive", "archived"];

const vehicleOptionValues = [
  "standard_car",
  "suv",
  "van",
  "minibus",
  "bus",
  "luxury",
  "other",
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

function formatVehicle(value: string | null | undefined, t: (key: string) => string) {
  if (!value) return "—";

  const keys: Record<string, string> = {
    standard_car: "transfers.vehicles.standardCar",
    suv: "transfers.vehicles.suv",
    van: "transfers.vehicles.van",
    minibus: "transfers.vehicles.minibus",
    bus: "transfers.vehicles.bus",
    luxury: "transfers.vehicles.luxury",
    other: "transfers.vehicles.other",
  };

  return keys[value] ? t(keys[value]) : String(value).replaceAll("_", " ");
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
  const keys: Record<string, string> = {
    draft: "transfers.status.draft",
    active: "transfers.status.active",
    inactive: "transfers.status.inactive",
    archived: "transfers.status.archived",
  };

  if (!value) return t("transfers.status.unknown");
  return keys[value] ? t(keys[value]) : String(value).replaceAll("_", " ");
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
    ...blankTransferForm,
    id: product.id,
    category: String(product.category || product.category_id || product.category_detail?.id || ""),
    name: product.name || "",
    slug: product.slug || "",
    short_description: product.short_description || product.summary || "",
    long_description: product.long_description || product.description || "",
    base_price: String(product.base_price ?? "0.00"),
    deposit_amount: String(product.deposit_amount ?? "0.00"),
    deposit_percentage: String(product.deposit_percentage ?? "0.00"),
    capacity: String(product.capacity ?? product.max_capacity ?? "1"),
    duration_text: String(product.duration_text ?? product.duration_minutes ?? ""),
    location: product.location || product.location_name || "",
    address: product.address || product.meeting_point || "",
    status: product.status || "active",
    is_active: product.is_active !== false,
    public_enabled: Boolean(product.public_enabled),
    seller_enabled: product.seller_enabled !== false,
  };
}

function transferFormToPayload(form: TransferFormState) {
  const payload: Record<string, unknown> = {
    product_type: "transfer",
    name: form.name.trim(),
    slug: form.slug.trim() || slugify(form.name),
    short_description: form.short_description.trim(),
    long_description: form.long_description.trim(),
    base_price: form.base_price || "0.00",
    deposit_amount: form.deposit_amount || "0.00",
    deposit_percentage: form.deposit_percentage || "0.00",
    capacity: Number(form.capacity || 1),
    duration_text: form.duration_text.trim(),
    location: form.location.trim(),
    address: form.address.trim(),
    supports_pickup: true,
    requires_pickup_location: true,
    status: form.status,
    is_active: form.is_active,
    public_enabled: form.public_enabled,
    seller_enabled: form.seller_enabled,
  };

  if (form.category) {
    payload.category_id = Number(form.category);
  }

  return payload;
}

function routeToForm(route: TransferRoute): RouteFormState {
  return {
    id: route.id,
    product: String(route.product || ""),
    origin: route.origin || "",
    destination: route.destination || "",
    airport: route.airport || "",
    vehicle_type: route.vehicle_type || "van",
    is_round_trip: Boolean(route.is_round_trip),
    base_passengers: String(route.base_passengers ?? 1),
    max_passengers: String(route.max_passengers ?? 6),
    price: String(route.price ?? "0.00"),
    round_trip_price: String(route.round_trip_price ?? "0.00"),
    is_active: route.is_active !== false,
  };
}

function routeFormToPayload(form: RouteFormState) {
  return {
    product_id: Number(form.product),
    origin: form.origin.trim(),
    destination: form.destination.trim(),
    airport: form.airport.trim(),
    vehicle_type: form.vehicle_type,
    is_round_trip: form.is_round_trip,
    base_passengers: Number(form.base_passengers || 1),
    max_passengers: Number(form.max_passengers || 1),
    price: form.price || "0.00",
    round_trip_price: form.round_trip_price || "0.00",
    is_active: form.is_active,
  };
}

function bandToForm(band: TransferPriceBand): BandFormState {
  return {
    id: band.id,
    route: String(band.route || ""),
    name: band.name || "",
    min_passengers: String(band.min_passengers ?? 1),
    max_passengers: String(band.max_passengers ?? 6),
    vehicle_type: band.vehicle_type || "van",
    one_way_price: String(band.one_way_price ?? "0.00"),
    round_trip_price: band.round_trip_price ? String(band.round_trip_price) : "",
    is_active: band.is_active !== false,
    sort_order: String(band.sort_order ?? 0),
  };
}

function bandFormToPayload(form: BandFormState) {
  return {
    route_id: Number(form.route),
    name: form.name.trim(),
    min_passengers: Number(form.min_passengers || 1),
    max_passengers: Number(form.max_passengers || 1),
    vehicle_type: form.vehicle_type,
    one_way_price: form.one_way_price || "0.00",
    round_trip_price: form.round_trip_price || null,
    is_active: form.is_active,
    sort_order: Number(form.sort_order || 0),
  };
}

function getProductPublicUrl(organisationSlug: string, product: ExperienceProduct) {
  return `${window.location.origin}/experiences/${organisationSlug}/product/${product.slug}`;
}

function routeLabel(route: TransferRoute | null | undefined, t: (key: string) => string) {
  if (!route) return t("transfers.labels.routeNotConfigured");
  return `${route.origin || t("transfers.labels.origin")} → ${route.destination || t("transfers.labels.destination")}`;
}

function bandLabel(band: TransferPriceBand, t: (key: string) => string) {
  return `${band.min_passengers}-${band.max_passengers} ${t("transfers.labels.passengers")}`;
}

function getProductRoutes(product: ExperienceProduct, routes: TransferRoute[]) {
  return routes.filter((route) => route.product === product.id);
}

function getPrimaryRouteLabel(product: ExperienceProduct, routes: TransferRoute[], t: (key: string) => string) {
  const route = getProductRoutes(product, routes)[0] || product.transfer_routes?.[0];
  if (route) return routeLabel(route, t);
  return product.location || product.location_name || t("transfers.labels.routeNotConfigured");
}

export default function TicketingTransfersPage() {
  const { t } = useTicketingAdminTranslation();
  const statusOptions = statusOptionValues.map((value) => ({
    value,
    label: t(`transfers.status.${value}`),
  }));

  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [routes, setRoutes] = useState<TransferRoute[]>([]);
  const [priceBands, setPriceBands] = useState<TransferPriceBand[]>([]);

  const [selectedTransfer, setSelectedTransfer] = useState<ExperienceProduct | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<ExperienceProduct | null>(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferFormState>(blankTransferForm);

  const [editingRoute, setEditingRoute] = useState<TransferRoute | null>(null);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [routeForm, setRouteForm] = useState<RouteFormState>(blankRouteForm);

  const [editingBand, setEditingBand] = useState<TransferPriceBand | null>(null);
  const [showBandForm, setShowBandForm] = useState(false);
  const [bandForm, setBandForm] = useState<BandFormState>(blankBandForm);

  const [quoteRouteId, setQuoteRouteId] = useState("");
  const [quotePassengers, setQuotePassengers] = useState("1");
  const [quoteRoundTrip, setQuoteRoundTrip] = useState(false);
  const [quoteResult, setQuoteResult] = useState<QuoteResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quoting, setQuoting] = useState(false);

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

      const [productsResponse, categoriesResponse, routesResponse, bandsResponse] =
        await Promise.all([
          api.get("/ticketing/products/", { params: requestParams }),
          api.get("/ticketing/categories/", { params: requestParams }),
          api.get("/ticketing/transfer-routes/", { params: requestParams }),
          api.get("/ticketing/transfer-price-bands/", { params: requestParams }),
        ]);

      const allProducts = normalizeList<ExperienceProduct>(productsResponse.data);
      const transferProducts = allProducts.filter(
        (product) => product.product_type === "transfer"
      );

      const loadedRoutes = normalizeList<TransferRoute>(routesResponse.data);

      setProducts(transferProducts);
      setCategories(normalizeList<Category>(categoriesResponse.data));
      setRoutes(loadedRoutes);
      setPriceBands(normalizeList<TransferPriceBand>(bandsResponse.data));

      if (!quoteRouteId && loadedRoutes.length > 0) {
        setQuoteRouteId(String(loadedRoutes[0].id));
      }
    } catch (err: any) {
      console.error("Could not load transfers:", err);
      setError(getErrorMessage(err, t("transfers.errors.load")));
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

    const activeRoutes = routes.filter((route) => route.is_active !== false).length;
    const activeBands = priceBands.filter((band) => band.is_active !== false).length;

    const lowestPrice = priceBands.length
      ? Math.min(...priceBands.map((band) => Number(band.one_way_price || 0)))
      : 0;

    return {
      total: products.length,
      active,
      publicProducts,
      activeRoutes,
      activeBands,
      lowestPrice,
    };
  }, [products, routes, priceBands]);

  const filteredTransfers = useMemo(() => {
    return products.filter((product) => {
      const productRoutes = getProductRoutes(product, routes);
      const searchText = [
        product.name,
        product.slug,
        product.status,
        product.location,
        product.address,
        product.category_detail?.name,
        product.short_description,
        ...productRoutes.map((route) => routeLabel(route, t)),
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
  }, [products, routes, search, statusFilter, publicFilter]);

  function openCreateTransferForm() {
    setEditingTransfer(null);
    setSelectedTransfer(null);
    setTransferForm(blankTransferForm);
    setShowTransferForm(true);
    setError("");
    setSavedMessage("");
  }

  function openEditTransferForm(product: ExperienceProduct) {
    setEditingTransfer(product);
    setSelectedTransfer(null);
    setTransferForm(productToForm(product));
    setShowTransferForm(true);
    setError("");
    setSavedMessage("");
  }

  function openCreateRouteForm(product?: ExperienceProduct | null) {
    setEditingRoute(null);
    setRouteForm({
      ...blankRouteForm,
      product: product ? String(product.id) : "",
    });
    setShowRouteForm(true);
    setError("");
    setSavedMessage("");
  }

  function openEditRouteForm(route: TransferRoute) {
    setEditingRoute(route);
    setRouteForm(routeToForm(route));
    setShowRouteForm(true);
    setError("");
    setSavedMessage("");
  }

  function openCreateBandForm(route?: TransferRoute | null) {
    setEditingBand(null);
    setBandForm({
      ...blankBandForm,
      route: route ? String(route.id) : "",
    });
    setShowBandForm(true);
    setError("");
    setSavedMessage("");
  }

  function openEditBandForm(band: TransferPriceBand) {
    setEditingBand(band);
    setBandForm(bandToForm(band));
    setShowBandForm(true);
    setError("");
    setSavedMessage("");
  }

  function updateTransferForm<K extends keyof TransferFormState>(
    field: K,
    value: TransferFormState[K]
  ) {
    setTransferForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "name" && !current.id && !current.slug.trim()) {
        next.slug = slugify(String(value));
      }

      return next;
    });
  }

  function updateRouteForm<K extends keyof RouteFormState>(
    field: K,
    value: RouteFormState[K]
  ) {
    setRouteForm((current) => ({ ...current, [field]: value }));
  }

  function updateBandForm<K extends keyof BandFormState>(
    field: K,
    value: BandFormState[K]
  ) {
    setBandForm((current) => ({ ...current, [field]: value }));
  }

  async function saveTransfer() {
    if (!transferForm.name.trim()) {
      setError(t("transfers.errors.nameRequired"));
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const payload = transferFormToPayload(transferForm);

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

      setShowTransferForm(false);
      setEditingTransfer(null);
      setSavedMessage(editingTransfer ? t("transfers.messages.transferUpdated") : t("transfers.messages.transferCreated"));
    } catch (err: any) {
      console.error("Could not save transfer:", err);
      setError(getErrorMessage(err, t("transfers.errors.saveTransfer")));
    } finally {
      setSaving(false);
    }
  }

  async function saveRoute() {
    if (!routeForm.product) {
      setError(t("transfers.errors.selectProduct"));
      return;
    }

    if (!routeForm.origin.trim() || !routeForm.destination.trim()) {
      setError(t("transfers.errors.originDestination"));
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const payload = routeFormToPayload(routeForm);

      const response = editingRoute
        ? await api.patch(`/ticketing/transfer-routes/${editingRoute.id}/`, payload, {
            params: requestParams,
          })
        : await api.post("/ticketing/transfer-routes/", payload, {
            params: requestParams,
          });

      const savedRoute = response.data as TransferRoute;

      setRoutes((current) => {
        if (editingRoute) {
          return current.map((item) =>
            item.id === savedRoute.id ? savedRoute : item
          );
        }

        return [savedRoute, ...current];
      });

      if (!quoteRouteId) setQuoteRouteId(String(savedRoute.id));

      setShowRouteForm(false);
      setEditingRoute(null);
      setSavedMessage(editingRoute ? t("transfers.messages.routeUpdated") : t("transfers.messages.routeCreated"));
    } catch (err: any) {
      console.error("Could not save route:", err);
      setError(getErrorMessage(err, t("transfers.errors.saveRoute")));
    } finally {
      setSaving(false);
    }
  }

  async function saveBand() {
    if (!bandForm.route) {
      setError(t("transfers.errors.selectBandRoute"));
      return;
    }

    if (Number(bandForm.max_passengers) < Number(bandForm.min_passengers)) {
      setError(t("transfers.errors.passengerRange"));
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const payload = bandFormToPayload(bandForm);

      const response = editingBand
        ? await api.patch(`/ticketing/transfer-price-bands/${editingBand.id}/`, payload, {
            params: requestParams,
          })
        : await api.post("/ticketing/transfer-price-bands/", payload, {
            params: requestParams,
          });

      const savedBand = response.data as TransferPriceBand;

      setPriceBands((current) => {
        if (editingBand) {
          return current.map((item) => (item.id === savedBand.id ? savedBand : item));
        }

        return [savedBand, ...current];
      });

      setShowBandForm(false);
      setEditingBand(null);
      setSavedMessage(editingBand ? t("transfers.messages.bandUpdated") : t("transfers.messages.bandCreated"));
    } catch (err: any) {
      console.error("Could not save price band:", err);
      setError(getErrorMessage(err, t("transfers.errors.saveBand")));
    } finally {
      setSaving(false);
    }
  }

  async function deleteBand(band: TransferPriceBand) {
    const confirmed = window.confirm(t("transfers.confirm.deleteBand").replace("{band}", bandLabel(band, t)));
    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      await api.delete(`/ticketing/transfer-price-bands/${band.id}/`, {
        params: requestParams,
      });

      setPriceBands((current) => current.filter((item) => item.id !== band.id));
      setSavedMessage(t("transfers.messages.bandDeleted"));
    } catch (err: any) {
      console.error("Could not delete price band:", err);
      setError(getErrorMessage(err, t("transfers.errors.deleteBand")));
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
        { public_enabled: !product.public_enabled },
        { params: requestParams }
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
          ? t("transfers.messages.public")
          : t("transfers.messages.hidden")
      );
    } catch (err: any) {
      console.error("Could not update transfer:", err);
      setError(getErrorMessage(err, t("transfers.errors.update")));
    } finally {
      setSaving(false);
    }
  }

  async function copyPublicLink(product: ExperienceProduct) {
    try {
      await navigator.clipboard.writeText(getProductPublicUrl(organisationSlug, product));
      setSavedMessage(t("transfers.messages.linkCopied"));
    } catch {
      setError(t("transfers.errors.copy"));
    }
  }

  async function testQuote() {
    if (!quoteRouteId) {
      setError(t("transfers.errors.selectQuoteRoute"));
      return;
    }

    try {
      setQuoting(true);
      setError("");
      setQuoteResult(null);

      const response = await api.post(
        "/ticketing/transfer-price-bands/quote/",
        {
          route_id: Number(quoteRouteId),
          passengers: Number(quotePassengers || 1),
          round_trip: quoteRoundTrip,
        },
        { params: requestParams }
      );

      setQuoteResult(response.data as QuoteResult);
    } catch (err: any) {
      console.error("Could not calculate quote:", err);
      setError(getErrorMessage(err, t("transfers.errors.quote")));
    } finally {
      setQuoting(false);
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title={t("transfers.page.title")}
        subtitle={t("transfers.page.loadingSubtitle")}
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          {t("transfers.loading")}
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title={t("transfers.page.title")}
      subtitle={t("transfers.page.subtitle")}
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard title={t("transfers.stats.products")} value={String(stats.total)} helper={t("transfers.stats.services")} icon={<Car className="h-6 w-6 text-slate-700" />} />
          <StatCard title={t("transfers.stats.active")} value={String(stats.active)} helper={t("transfers.stats.available")} icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />} />
          <StatCard title={t("transfers.stats.public")} value={String(stats.publicProducts)} helper={t("transfers.stats.visibleOnline")} icon={<ExternalLink className="h-6 w-6 text-sky-600" />} />
          <StatCard title={t("transfers.stats.routes")} value={String(stats.activeRoutes)} helper={t("transfers.stats.activeRoutes")} icon={<MapPin className="h-6 w-6 text-amber-600" />} />
          <StatCard title={t("transfers.stats.priceBands")} value={String(stats.activeBands)} helper={t("transfers.stats.passengerRanges")} icon={<Users className="h-6 w-6 text-indigo-600" />} />
          <StatCard title={t("transfers.stats.from")} value={formatMoney(stats.lowestPrice)} helper={t("transfers.stats.lowestBand")} icon={<DollarSign className="h-6 w-6 text-emerald-600" />} />
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
              <h2 className="text-lg font-black text-slate-950">{t("transfers.manager.title")}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {t("transfers.manager.description")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={loadPage} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                <RefreshCw className="h-4 w-4" />
                {t("transfers.actions.refresh")}
              </button>

              <button type="button" onClick={() => openCreateRouteForm(selectedTransfer)} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                <MapPin className="h-4 w-4" />
                {t("transfers.actions.newRoute")}
              </button>

              <button type="button" onClick={() => openCreateBandForm()} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50">
                <DollarSign className="h-4 w-4" />
                {t("transfers.actions.newPriceBand")}
              </button>

              <button type="button" onClick={openCreateTransferForm} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800">
                <Plus className="h-4 w-4" />
                {t("transfers.actions.newTransfer")}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_220px_180px]">
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("transfers.filters.search")} className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" />
            </div>

            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none">
              <option value="">{t("transfers.filters.allStatuses")}</option>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>

            <select value={publicFilter} onChange={(event) => setPublicFilter(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none">
              <option value="">{t("transfers.filters.allVisibility")}</option>
              <option value="public">{t("transfers.status.public")}</option>
              <option value="hidden">{t("transfers.status.hidden")}</option>
            </select>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            {filteredTransfers.length === 0 ? (
              <EmptyState text={t("transfers.empty.services")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>{t("transfers.table.transfer")}</Th>
                      <Th>{t("transfers.table.primaryRoute")}</Th>
                      <Th>{t("transfers.table.routes")}</Th>
                      <Th>{t("transfers.table.priceBands")}</Th>
                      <Th>{t("transfers.table.status")}</Th>
                      <Th>{t("transfers.table.public")}</Th>
                      <Th>{t("transfers.table.actions")}</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredTransfers.map((product) => {
                      const productRoutes = getProductRoutes(product, routes);
                      const productBands = priceBands.filter((band) =>
                        productRoutes.some((route) => route.id === band.route)
                      );

                      return (
                        <tr key={product.id}>
                          <Td>
                            <div className="flex items-center gap-3">
                              <TransferImage product={product} />
                              <div>
                                <p className="font-black text-slate-950">{product.name}</p>
                                <p className="mt-1 text-xs font-bold text-slate-500">/product/{product.slug}</p>
                              </div>
                            </div>
                          </Td>

                          <Td>
                            <div>
                              <p className="font-black text-slate-900">{getPrimaryRouteLabel(product, routes, t)}</p>
                              <p className="mt-1 text-xs font-bold text-slate-500">{product.category_detail?.name || t("transfers.labels.transfer")}</p>
                            </div>
                          </Td>

                          <Td><p className="font-black text-slate-950">{productRoutes.length}</p></Td>
                          <Td><p className="font-black text-slate-950">{productBands.length}</p></Td>

                          <Td>
                            <span className={["inline-flex rounded-full px-3 py-1 text-xs font-black ring-1", getStatusClasses(product)].join(" ")}>{statusLabel(product.status, t)}</span>
                          </Td>

                          <Td>
                            <button type="button" disabled={saving} onClick={() => togglePublic(product)} className={["inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-3 text-xs font-black text-white transition disabled:opacity-60", product.public_enabled ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-500 hover:bg-slate-600"].join(" ")}>
                              {product.public_enabled ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                              {product.public_enabled ? t("transfers.status.public") : t("transfers.status.hidden")}
                            </button>
                          </Td>

                          <Td>
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={() => setSelectedTransfer(product)} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50">
                                <Eye className="h-4 w-4" /> {t("transfers.actions.view")}
                              </button>

                              <button type="button" onClick={() => openEditTransferForm(product)} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50">
                                <Edit3 className="h-4 w-4" /> {t("transfers.actions.edit")}
                              </button>

                              <button type="button" onClick={() => openCreateRouteForm(product)} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50">
                                <MapPin className="h-4 w-4" /> {t("transfers.actions.route")}
                              </button>
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
          <RoutesAndBandsPanel
            products={products}
            routes={routes}
            priceBands={priceBands}
            saving={saving}
            onEditRoute={openEditRouteForm}
            onCreateBand={openCreateBandForm}
            onEditBand={openEditBandForm}
            onDeleteBand={deleteBand}
          />

          <QuoteTester
            routes={routes}
            quoteRouteId={quoteRouteId}
            quotePassengers={quotePassengers}
            quoteRoundTrip={quoteRoundTrip}
            quoteResult={quoteResult}
            quoting={quoting}
            onRouteChange={setQuoteRouteId}
            onPassengersChange={setQuotePassengers}
            onRoundTripChange={setQuoteRoundTrip}
            onTest={testQuote}
          />
        </section>
      </div>

      {showTransferForm && (
        <TransferFormModal
          form={transferForm}
          categories={categories}
          editingTransfer={editingTransfer}
          saving={saving}
          onClose={() => {
            setShowTransferForm(false);
            setEditingTransfer(null);
          }}
          onChange={updateTransferForm}
          onSave={saveTransfer}
        />
      )}

      {showRouteForm && (
        <RouteFormModal
          form={routeForm}
          products={products}
          editingRoute={editingRoute}
          saving={saving}
          onClose={() => {
            setShowRouteForm(false);
            setEditingRoute(null);
          }}
          onChange={updateRouteForm}
          onSave={saveRoute}
        />
      )}

      {showBandForm && (
        <BandFormModal
          form={bandForm}
          routes={routes}
          editingBand={editingBand}
          saving={saving}
          onClose={() => {
            setShowBandForm(false);
            setEditingBand(null);
          }}
          onChange={updateBandForm}
          onSave={saveBand}
        />
      )}

      {selectedTransfer && (
        <TransferDetailModal
          product={selectedTransfer}
          routes={getProductRoutes(selectedTransfer, routes)}
          priceBands={priceBands}
          organisationSlug={organisationSlug}
          saving={saving}
          onClose={() => setSelectedTransfer(null)}
          onEdit={() => openEditTransferForm(selectedTransfer)}
          onCreateRoute={() => openCreateRouteForm(selectedTransfer)}
          onCreateBand={openCreateBandForm}
          onEditRoute={openEditRouteForm}
          onEditBand={openEditBandForm}
          onDeleteBand={deleteBand}
          onCopyLink={() => copyPublicLink(selectedTransfer)}
          onTogglePublic={() => togglePublic(selectedTransfer)}
        />
      )}
    </TicketingPageShell>
  );
}

function RoutesAndBandsPanel({
  products,
  routes,
  priceBands,
  saving,
  onEditRoute,
  onCreateBand,
  onEditBand,
  onDeleteBand,
}: {
  products: ExperienceProduct[];
  routes: TransferRoute[];
  priceBands: TransferPriceBand[];
  saving: boolean;
  onEditRoute: (route: TransferRoute) => void;
  onCreateBand: (route: TransferRoute) => void;
  onEditBand: (band: TransferPriceBand) => void;
  onDeleteBand: (band: TransferPriceBand) => void;
}) {
  const { t } = useTicketingAdminTranslation();
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-slate-950">{t("transfers.routesBands.title")}</h2>
      <p className="mt-1 text-sm font-semibold text-slate-500">{t("transfers.routesBands.description")}</p>

      <div className="mt-5 space-y-4">
        {routes.length === 0 ? (
          <EmptyState text={t("transfers.routesBands.emptyRoutes")} />
        ) : (
          routes.map((route) => {
            const product = products.find((item) => item.id === route.product);
            const routeBands = priceBands
              .filter((band) => band.route === route.id)
              .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

            return (
              <div key={route.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{product?.name || route.product_name || t("transfers.labels.transfer")}</p>
                    <h3 className="mt-1 text-base font-black text-slate-950">{routeLabel(route, t)}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-500">{route.airport || t("transfers.routesBands.noAirport")} · {formatVehicle(route.vehicle_type, t)} · {t("transfers.routesBands.legacyPrice")} {formatMoney(route.price)}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onEditRoute(route)} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
                      <Edit3 className="h-4 w-4" /> {t("transfers.actions.edit")} route
                    </button>
                    <button type="button" onClick={() => onCreateBand(route)} className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 text-xs font-black text-white">
                      <Plus className="h-4 w-4" /> {t("transfers.actions.addBand")}
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                  {routeBands.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm font-bold text-slate-500">{t("transfers.routesBands.noBands")}</div>
                  ) : (
                    routeBands.map((band) => (
                      <div key={band.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-slate-950">{band.name || bandLabel(band, t)}</p>
                            <p className="mt-1 text-xs font-bold text-slate-500">{bandLabel(band, t)} · {formatVehicle(band.vehicle_type, t)}</p>
                          </div>
                          <span className={["rounded-full px-2 py-1 text-[11px] font-black", band.is_active !== false ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"].join(" ")}>{band.is_active !== false ? t("transfers.status.active") : t("transfers.status.off")}</span>
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-lg font-black text-slate-950">{formatMoney(band.one_way_price)}</p>
                            <p className="text-xs font-bold text-slate-500">{t("transfers.routesBands.roundTrip")}: {band.round_trip_price ? formatMoney(band.round_trip_price) : "—"}</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => onEditBand(band)} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Edit3 className="h-4 w-4" /></button>
                            <button type="button" disabled={saving} onClick={() => onDeleteBand(band)} className="rounded-xl border border-red-100 p-2 text-red-600 hover:bg-red-50 disabled:opacity-60"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function QuoteTester({
  routes,
  quoteRouteId,
  quotePassengers,
  quoteRoundTrip,
  quoteResult,
  quoting,
  onRouteChange,
  onPassengersChange,
  onRoundTripChange,
  onTest,
}: {
  routes: TransferRoute[];
  quoteRouteId: string;
  quotePassengers: string;
  quoteRoundTrip: boolean;
  quoteResult: QuoteResult | null;
  quoting: boolean;
  onRouteChange: (value: string) => void;
  onPassengersChange: (value: string) => void;
  onRoundTripChange: (value: boolean) => void;
  onTest: () => void;
}) {
  const { t } = useTicketingAdminTranslation();
  const price = quoteResult?.total_price ?? quoteResult?.price ?? quoteResult?.one_way_price;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-slate-950">{t("transfers.quote.title")}</h2>
      <p className="mt-1 text-sm font-semibold text-slate-500">{t("transfers.quote.description")}</p>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">{t("transfers.quote.route")}</span>
          <select value={quoteRouteId} onChange={(event) => onRouteChange(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none">
            <option value="">{t("transfers.quote.selectRoute")}</option>
            {routes.map((route) => (
              <option key={route.id} value={String(route.id)}>{routeLabel(route, t)}</option>
            ))}
          </select>
        </label>

        <Input label={t("transfers.quote.passengers")} type="number" value={quotePassengers} onChange={onPassengersChange} />

        <Toggle label={t("transfers.quote.roundTrip")} description={t("transfers.quote.roundTripDescription")} checked={quoteRoundTrip} onChange={onRoundTripChange} />

        <button type="button" onClick={onTest} disabled={quoting || !quoteRouteId} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60">
          {quoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
          {t("transfers.actions.calculateQuote")}
        </button>

        {quoteResult && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{t("transfers.quote.calculatedPrice")}</p>
            <p className="mt-1 text-3xl font-black text-emerald-900">{formatMoney(price)}</p>
            <p className="mt-2 text-sm font-bold text-emerald-800">{quoteResult.price_band || `${quoteResult.passengers || quotePassengers} ${t("transfers.labels.passengers")}`} · {formatVehicle(quoteResult.vehicle_type || quoteResult.vehicle, t)}</p>
          </div>
        )}
      </div>
    </section>
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
  onChange: <K extends keyof TransferFormState>(field: K, value: TransferFormState[K]) => void;
  onSave: () => void;
}) {
  const { t } = useTicketingAdminTranslation();
  const statusOptions = statusOptionValues.map((value) => ({
    value,
    label: t(`transfers.status.${value}`),
  }));

  return (
    <ModalShell title={editingTransfer ? t("transfers.form.editTransfer") : t("transfers.form.newTransfer")} subtitle={form.name || t("transfers.form.transferService")} onClose={onClose}>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={t("transfers.form.basic.title")} description={t("transfers.form.basic.description")} icon={<Plane className="h-5 w-5" />}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label={t("transfers.form.transferName")} value={form.name} onChange={(value) => onChange("name", value)} placeholder={t("transfers.placeholders.transferName")} required />
            <Input label={t("transfers.form.slug")} value={form.slug} onChange={(value) => onChange("slug", slugify(value))} placeholder="private-transfers" />

            <label className="block">
              <span className="text-sm font-bold text-slate-700">{t("transfers.form.category")}</span>
              <select value={form.category} onChange={(event) => onChange("category", event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none">
                <option value="">{t("transfers.form.noCategory")}</option>
                {categories.map((category) => <option key={category.id} value={String(category.id)}>{category.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">{t("transfers.form.status")}</span>
              <select value={form.status} onChange={(event) => onChange("status", event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none">
                {statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </label>
          </div>

          <Textarea label={t("transfers.form.shortDescription")} value={form.short_description} onChange={(value) => onChange("short_description", value)} placeholder={t("transfers.placeholders.shortDescription")} />
          <Textarea label={t("transfers.form.fullDescription")} value={form.long_description} onChange={(value) => onChange("long_description", value)} placeholder={t("transfers.placeholders.fullDescription")} />
        </Panel>

        <Panel title={t("transfers.form.defaults.title")} description={t("transfers.form.defaults.description")} icon={<MapPin className="h-5 w-5" />}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label={t("transfers.form.basePrice")} type="number" value={form.base_price} onChange={(value) => onChange("base_price", value)} placeholder="0.00" />
            <Input label={t("transfers.form.depositAmount")} type="number" value={form.deposit_amount} onChange={(value) => onChange("deposit_amount", value)} placeholder="10.00" />
            <Input label={t("transfers.form.depositPercentage")} type="number" value={form.deposit_percentage} onChange={(value) => onChange("deposit_percentage", value)} placeholder="0.00" />
            <Input label={t("transfers.form.defaultCapacity")} type="number" value={form.capacity} onChange={(value) => onChange("capacity", value)} placeholder="6" />
            <Input label={t("transfers.form.durationText")} value={form.duration_text} onChange={(value) => onChange("duration_text", value)} placeholder={t("transfers.placeholders.duration")} />
            <Input label={t("transfers.form.locationLabel")} value={form.location} onChange={(value) => onChange("location", value)} placeholder={t("transfers.placeholders.location")} />
          </div>

          <Textarea label={t("transfers.form.meetingInstructions")} value={form.address} onChange={(value) => onChange("address", value)} placeholder={t("transfers.placeholders.meeting")} />

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Toggle label={t("transfers.form.active")} description={t("transfers.form.activeDescription")} checked={form.is_active} onChange={(value) => onChange("is_active", value)} />
            <Toggle label={t("transfers.form.public")} description={t("transfers.form.publicDescription")} checked={form.public_enabled} onChange={(value) => onChange("public_enabled", value)} />
            <Toggle label={t("transfers.form.sellerEnabled")} description={t("transfers.form.sellerEnabledDescription")} checked={form.seller_enabled} onChange={(value) => onChange("seller_enabled", value)} />
          </div>
        </Panel>
      </div>

      <ModalActions saving={saving} label={editingTransfer ? t("transfers.actions.saveTransfer") : t("transfers.actions.createTransfer")} onSave={onSave} />
    </ModalShell>
  );
}

function RouteFormModal({
  form,
  products,
  editingRoute,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  form: RouteFormState;
  products: ExperienceProduct[];
  editingRoute: TransferRoute | null;
  saving: boolean;
  onClose: () => void;
  onChange: <K extends keyof RouteFormState>(field: K, value: RouteFormState[K]) => void;
  onSave: () => void;
}) {
  const { t } = useTicketingAdminTranslation();

  const vehicleOptions = vehicleOptionValues.map((value) => ({
    value,
    label: t(
      value === "standard_car"
        ? "transfers.vehicles.standardCar"
        : `transfers.vehicles.${value}`
    ),
  }));
  return (
    <ModalShell title={editingRoute ? t("transfers.route.edit") : t("transfers.route.new")} subtitle={form.origin && form.destination ? `${form.origin} → ${form.destination}` : t("transfers.route.fallback")} onClose={onClose}>
      <Panel title={t("transfers.route.panelTitle")} description={t("transfers.route.panelDescription")} icon={<MapPin className="h-5 w-5" />}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-sm font-bold text-slate-700">{t("transfers.route.product")}</span>
            <select value={form.product} onChange={(event) => onChange("product", event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none">
              <option value="">{t("transfers.route.selectProduct")}</option>
              {products.map((product) => <option key={product.id} value={String(product.id)}>{product.name}</option>)}
            </select>
          </label>

          <Input label={t("transfers.route.origin")} value={form.origin} onChange={(value) => onChange("origin", value)} placeholder={t("transfers.placeholders.origin")} required />
          <Input label={t("transfers.route.destination")} value={form.destination} onChange={(value) => onChange("destination", value)} placeholder={t("transfers.placeholders.destination")} required />
          <Input label={t("transfers.route.airport")} value={form.airport} onChange={(value) => onChange("airport", value)} placeholder="PUJ" />

          <label className="block">
            <span className="text-sm font-bold text-slate-700">{t("transfers.route.defaultVehicle")}</span>
            <select value={form.vehicle_type} onChange={(event) => onChange("vehicle_type", event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none">
              {vehicleOptions.map((vehicle) => <option key={vehicle.value} value={vehicle.value}>{vehicle.label}</option>)}
            </select>
          </label>

          <Input label={t("transfers.route.legacyBasePassengers")} type="number" value={form.base_passengers} onChange={(value) => onChange("base_passengers", value)} />
          <Input label={t("transfers.route.legacyMaxPassengers")} type="number" value={form.max_passengers} onChange={(value) => onChange("max_passengers", value)} />
          <Input label={t("transfers.route.legacyOneWay")} type="number" value={form.price} onChange={(value) => onChange("price", value)} />
          <Input label={t("transfers.route.legacyRoundTrip")} type="number" value={form.round_trip_price} onChange={(value) => onChange("round_trip_price", value)} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Toggle label={t("transfers.route.roundTripSupported")} description={t("transfers.route.roundTripSupportedDescription")} checked={form.is_round_trip} onChange={(value) => onChange("is_round_trip", value)} />
          <Toggle label={t("transfers.form.active")} description={t("transfers.route.activeDescription")} checked={form.is_active} onChange={(value) => onChange("is_active", value)} />
        </div>
      </Panel>

      <ModalActions saving={saving} label={editingRoute ? t("transfers.actions.saveRoute") : t("transfers.actions.createRoute")} onSave={onSave} />
    </ModalShell>
  );
}

function BandFormModal({
  form,
  routes,
  editingBand,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  form: BandFormState;
  routes: TransferRoute[];
  editingBand: TransferPriceBand | null;
  saving: boolean;
  onClose: () => void;
  onChange: <K extends keyof BandFormState>(field: K, value: BandFormState[K]) => void;
  onSave: () => void;
}) {
  const { t } = useTicketingAdminTranslation();
  const vehicleOptions = vehicleOptionValues.map((value) => ({
    value,
    label: t(
      value === "standard_car"
        ? "transfers.vehicles.standardCar"
        : `transfers.vehicles.${value}`
    ),
  }));
  return (
    <ModalShell title={editingBand ? t("transfers.band.edit") : t("transfers.band.new")} subtitle={form.name || `${form.min_passengers}-${form.max_passengers} ${t("transfers.labels.passengers")}`} onClose={onClose}>
      <Panel title={t("transfers.band.panelTitle")} description={t("transfers.band.panelDescription")} icon={<DollarSign className="h-5 w-5" />}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="text-sm font-bold text-slate-700">{t("transfers.quote.route")}</span>
            <select value={form.route} onChange={(event) => onChange("route", event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none">
              <option value="">{t("transfers.quote.selectRoute")}</option>
              {routes.map((route) => <option key={route.id} value={String(route.id)}>{routeLabel(route, t)}</option>)}
            </select>
          </label>

          <Input label={t("transfers.band.name")} value={form.name} onChange={(value) => onChange("name", value)} placeholder={t("transfers.placeholders.bandName")} />
          <Input label={t("transfers.band.sortOrder")} type="number" value={form.sort_order} onChange={(value) => onChange("sort_order", value)} />
          <Input label={t("transfers.band.minPassengers")} type="number" value={form.min_passengers} onChange={(value) => onChange("min_passengers", value)} required />
          <Input label={t("transfers.band.maxPassengers")} type="number" value={form.max_passengers} onChange={(value) => onChange("max_passengers", value)} required />

          <label className="block">
            <span className="text-sm font-bold text-slate-700">{t("transfers.band.vehicle")}</span>
            <select value={form.vehicle_type} onChange={(event) => onChange("vehicle_type", event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none">
              {vehicleOptions.map((vehicle) => <option key={vehicle.value} value={vehicle.value}>{vehicle.label}</option>)}
            </select>
          </label>

          <Input label={t("transfers.band.oneWayPrice")} type="number" value={form.one_way_price} onChange={(value) => onChange("one_way_price", value)} required />
          <Input label={t("transfers.band.roundTripPrice")} type="number" value={form.round_trip_price} onChange={(value) => onChange("round_trip_price", value)} placeholder={t("transfers.band.optional")} />
        </div>

        <div className="mt-5">
          <Toggle label={t("transfers.form.active")} description={t("transfers.band.activeDescription")} checked={form.is_active} onChange={(value) => onChange("is_active", value)} />
        </div>
      </Panel>

      <ModalActions saving={saving} label={editingBand ? t("transfers.actions.savePriceBand") : t("transfers.actions.createPriceBand")} onSave={onSave} />
    </ModalShell>
  );
}

function TransferDetailModal({
  product,
  routes,
  priceBands,
  organisationSlug,
  saving,
  onClose,
  onEdit,
  onCreateRoute,
  onCreateBand,
  onEditRoute,
  onEditBand,
  onDeleteBand,
  onCopyLink,
  onTogglePublic,
}: {
  product: ExperienceProduct;
  routes: TransferRoute[];
  priceBands: TransferPriceBand[];
  organisationSlug: string;
  saving: boolean;
  onClose: () => void;
  onEdit: () => void;
  onCreateRoute: () => void;
  onCreateBand: (route: TransferRoute) => void;
  onEditRoute: (route: TransferRoute) => void;
  onEditBand: (band: TransferPriceBand) => void;
  onDeleteBand: (band: TransferPriceBand) => void;
  onCopyLink: () => void;
  onTogglePublic: () => void;
}) {
  const { t } = useTicketingAdminTranslation();
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="flex items-center gap-4">
            <TransferImage product={product} large />
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-600">{t("transfers.detail.title")}</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{product.name}</h2>
              <p className="mt-1 text-sm font-bold text-slate-500">{routes[0] ? routeLabel(routes[0], t) : t("transfers.detail.noRoute")}</p>
            </div>
          </div>

          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"><X className="h-5 w-5" /></button>
        </div>

        <div className="max-h-[calc(92vh-92px)] overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEdit} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"><Edit3 className="h-4 w-4" /> {t("transfers.actions.edit")} product</button>
            <button type="button" onClick={onCreateRoute} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><MapPin className="h-4 w-4" /> {t("transfers.actions.addRoute")}</button>
            <button type="button" onClick={onCopyLink} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><Copy className="h-4 w-4" /> {t("transfers.actions.copyPublicLink")}</button>
            <Link to={`/experiences/${organisationSlug}/product/${product.slug}`} target="_blank" className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><ExternalLink className="h-4 w-4" /> {t("transfers.actions.openPublicPage")}</Link>
            <button type="button" disabled={saving} onClick={onTogglePublic} className={["inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black text-white disabled:opacity-60", product.public_enabled ? "bg-red-600" : "bg-emerald-600"].join(" ")}>{product.public_enabled ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}{product.public_enabled ? t("transfers.actions.hidePublic") : t("transfers.actions.makePublic")}</button>
          </div>

          <section className="mt-5 grid gap-4 lg:grid-cols-4">
            <InfoCard icon={<DollarSign className="h-5 w-5" />} label={t("transfers.form.basePrice")} value={formatMoney(product.base_price)} helper={t("transfers.detail.fallbackOnly")} />
            <InfoCard icon={<Clock3 className="h-5 w-5" />} label={t("transfers.detail.duration")} value={String(product.duration_text || product.duration_minutes || "—")} helper={t("transfers.detail.productDefault")} />
            <InfoCard icon={<MapPin className="h-5 w-5" />} label={t("transfers.detail.routes")} value={String(routes.length)} helper={t("transfers.detail.configuredRoutes")} />
            <InfoCard icon={<Users className="h-5 w-5" />} label={t("transfers.detail.priceBands")} value={String(priceBands.filter((band) => routes.some((route) => route.id === band.route)).length)} helper={t("transfers.stats.passengerRanges")} />
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">{t("transfers.detail.routes")}</h3>
            <div className="mt-4 space-y-4">
              {routes.length === 0 ? (
                <EmptyState text={t("transfers.detail.noRoutes")} />
              ) : (
                routes.map((route) => {
                  const routeBands = priceBands.filter((band) => band.route === route.id);
                  return (
                    <div key={route.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                        <div>
                          <h4 className="font-black text-slate-950">{routeLabel(route, t)}</h4>
                          <p className="mt-1 text-xs font-bold text-slate-500">{formatVehicle(route.vehicle_type, t)} · {routeBands.length} {t("transfers.detail.priceBands").toLowerCase()}</p>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => onEditRoute(route)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600"><Edit3 className="h-4 w-4" /></button>
                          <button type="button" onClick={() => onCreateBand(route)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><Plus className="h-4 w-4" /> {t("transfers.actions.band")}</button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {routeBands.length === 0 ? (
                          <div className="rounded-2xl bg-white p-3 text-sm font-bold text-slate-500">{t("transfers.detail.noBands")}</div>
                        ) : (
                          routeBands.map((band) => (
                            <div key={band.id} className="rounded-2xl bg-white p-3">
                              <p className="font-black text-slate-950">{band.name || bandLabel(band, t)}</p>
                              <p className="mt-1 text-xs font-bold text-slate-500">{bandLabel(band, t)} · {formatVehicle(band.vehicle_type, t)}</p>
                              <p className="mt-2 text-sm font-black text-slate-900">{formatMoney(band.one_way_price)} / {band.round_trip_price ? formatMoney(band.round_trip_price) : "—"}</p>
                              <div className="mt-2 flex gap-2">
                                <button type="button" onClick={() => onEditBand(band)} className="rounded-xl border border-slate-200 p-2 text-slate-600"><Edit3 className="h-4 w-4" /></button>
                                <button type="button" onClick={() => onDeleteBand(band)} className="rounded-xl border border-red-100 p-2 text-red-600"><Trash2 className="h-4 w-4" /></button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function TransferImage({ product, large = false }: { product: ExperienceProduct; large?: boolean }) {
  const imageUrl = resolveAssetUrl(product.image_url || product.image);

  return (
    <div className={["flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-amber-100 text-amber-700", large ? "h-16 w-16" : "h-11 w-11"].join(" ")}>
      {imageUrl ? <img src={imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <Car className={large ? "h-8 w-8" : "h-5 w-5"} />}
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">{title}</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{subtitle}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[calc(92vh-92px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function ModalActions({ saving, label, onSave }: { saving: boolean; label: string; onSave: () => void }) {
  return (
    <div className="mt-5 flex justify-end">
      <button type="button" onClick={onSave} disabled={saving} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {label}
      </button>
    </div>
  );
}

function Panel({ title, description, icon, children }: { title: string; description: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">{icon}</div>
        <div>
          <h3 className="text-base font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function StatCard({ title, value, helper, icon }: { title: string; value: string; helper: string; icon: ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      {icon}
      <p className="mt-4 text-sm font-bold text-slate-500">{title}</p>
      <h2 className="mt-1 text-2xl font-black text-slate-950">{value}</h2>
      <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
    </div>
  );
}

function InfoCard({ icon, label, value, helper }: { icon: ReactNode; label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-amber-600">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
      {helper && <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{helper}</p>}
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}{required && <span className="text-red-500"> *</span>}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white" />
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white" />
    </label>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <span>
        <span className="block text-sm font-black text-slate-800">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-amber-500" />
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">{text}</div>;
}

function Th({ children }: { children: ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">{children}</th>;
}

function Td({ children }: { children: ReactNode }) {
  return <td className="whitespace-nowrap px-4 py-3 align-top text-sm font-semibold text-slate-600">{children}</td>;
}
