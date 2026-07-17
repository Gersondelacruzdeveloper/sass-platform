// src/modules/ticketing/pages/TicketingProductsPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  DollarSign,
  Edit3,
  Filter,
  ExternalLink,
  Eye,
  Image,
  Loader2,
  Languages,
  MapPin,
  Package,
  Percent,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Tag,
  Ticket,
  Trash2,
  X,
} from "lucide-react";

import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";
import ticketingApi from "../api/ticketingApi";
import type {
  ExperienceCategory,
  ExperienceProduct,
  ProductGalleryImage,
  ProductStatus,
  ProductTranslation,
  ProductTranslations,
  SupportedProductLanguage,
  ProductType,
} from "../types/ticketingTypes";

type ProductFormState = {
  category_id: string;
  name: string;
  slug: string;
  product_type: ProductType;
  sku: string;
  short_description: string;
  long_description: string;
  adult_price: string;
  adult_cost_price: string;
  child_price: string;
  child_cost_price: string;
  infant_price: string;
  infant_cost_price: string;
  deposit_amount: string;
  deposit_percentage: string;
  capacity: string;
  duration_text: string;
  start_time: string;
  end_time: string;
  location: string;
  address: string;
  google_maps_link: string;
  cancellation_policy: string;
  instructions: string;
  ticket_information: string;
  pickup_instructions: string;
  supports_pickup: boolean;
  requires_pickup_location: boolean;
  allow_full_payment: boolean;
  allow_deposit_payment: boolean;
  allow_pending_payment: boolean;
  allow_cash_payment: boolean;
  seller_enabled: boolean;
  public_enabled: boolean;
  is_featured: boolean;
  is_recommended: boolean;
  is_top_excursion: boolean;
  is_top_transfer: boolean;
  is_best_seller: boolean;
  status: ProductStatus;
  seo_title: string;
  meta_description: string;
  canonical_url: string;
  og_title: string;
  og_description: string;
  twitter_title: string;
  twitter_description: string;
  image_alt_text: string;
  external_provider: "local" | "wellet";
  external_product_id: string;
  is_cocobongo_product: boolean;
  is_active: boolean;
};

const productTypes: { value: ProductType; label: string }[] = [
  { value: "excursion", label: "Excursion" },
  { value: "transfer", label: "Transfer" },
  { value: "ticket", label: "Ticket" },
  { value: "event", label: "Event" },
  { value: "nightlife", label: "Nightlife" },
  { value: "custom", label: "Custom" },
];

const productStatuses: { value: ProductStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "sold_out", label: "Sold Out" },
  { value: "archived", label: "Archived" },
];



const supportedLanguages: {
  value: SupportedProductLanguage;
  label: string;
  nativeLabel: string;
  flag: string;
}[] = [
  { value: "en", label: "English", nativeLabel: "English", flag: "🇺🇸" },
  { value: "es", label: "Spanish", nativeLabel: "Español", flag: "🇪🇸" },
  { value: "fr", label: "French", nativeLabel: "Français", flag: "🇫🇷" },
  { value: "pt", label: "Portuguese", nativeLabel: "Português", flag: "🇵🇹" },
  { value: "de", label: "German", nativeLabel: "Deutsch", flag: "🇩🇪" },
];

const emptyTranslation: ProductTranslation = {
  name: "",
  short_description: "",
  long_description: "",
  includes: [],
  excludes: [],
  itinerary: [],
  faqs: [],
  meeting_point: "",
  ticket_information: "",
  instructions: "",
  cancellation_policy: "",
};

function getLanguageLabel(language: SupportedProductLanguage) {
  return (
    supportedLanguages.find((item) => item.value === language)?.nativeLabel ||
    language.toUpperCase()
  );
}

function getLanguageFlag(language: SupportedProductLanguage) {
  return (
    supportedLanguages.find((item) => item.value === language)?.flag || "🌐"
  );
}

function listToTextarea(value: unknown) {
  if (!Array.isArray(value)) return "";

  return value
    .map((item) => {
      if (typeof item === "string") return item;
      return JSON.stringify(item);
    })
    .join("\n");
}

function textareaToList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTranslationDraft(
  translations: ProductTranslations,
  language: SupportedProductLanguage,
): ProductTranslation {
  const translation = translations[language];

  return {
    ...emptyTranslation,
    ...(translation || {}),
    includes: Array.isArray(translation?.includes) ? translation.includes : [],
    excludes: Array.isArray(translation?.excludes) ? translation.excludes : [],
    itinerary: Array.isArray(translation?.itinerary)
      ? translation.itinerary
      : [],
    faqs: Array.isArray(translation?.faqs) ? translation.faqs : [],
  };
}

const emptyForm: ProductFormState = {
  category_id: "",
  name: "",
  slug: "",
  product_type: "excursion",
  sku: "",
  short_description: "",
  long_description: "",
  adult_price: "0.00",
  adult_cost_price: "0.00",
  child_price: "0.00",
  child_cost_price: "0.00",
  infant_price: "0.00",
  infant_cost_price: "0.00",
  deposit_amount: "0.00",
  deposit_percentage: "0.00",
  capacity: "0",
  duration_text: "",
  start_time: "",
  end_time: "",
  location: "",
  address: "",
  google_maps_link: "",
  cancellation_policy: "",
  instructions: "",
  ticket_information: "",
  pickup_instructions: "",
  supports_pickup: false,
  requires_pickup_location: false,
  allow_full_payment: true,
  allow_deposit_payment: true,
  allow_pending_payment: true,
  allow_cash_payment: true,
  seller_enabled: true,
  public_enabled: true,
  is_featured: false,
  is_recommended: false,
  is_top_excursion: false,
  is_top_transfer: false,
  is_best_seller: false,
  status: "active",
  seo_title: "",
  meta_description: "",
  canonical_url: "",
  og_title: "",
  og_description: "",
  twitter_title: "",
  twitter_description: "",
  image_alt_text: "",
  external_provider: "local",
  external_product_id: "",
  is_cocobongo_product: false,
  is_active: true,
};

function moneyToString(value: unknown, fallback = "0.00") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function text(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function numberText(value: unknown, fallback = "0") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function formatMoney(value: unknown, symbol = "US$") {
  const amount = Number(value || 0);

  return `${symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getProfit(product: ExperienceProduct) {
  const price = Number((product as any).adult_price ?? product.base_price ?? 0);
  const cost = Number(
    (product as any).adult_cost_price ?? product.cost_price ?? 0,
  );

  return price - cost;
}

function getProfitMargin(product: ExperienceProduct) {
  const price = Number((product as any).adult_price ?? product.base_price ?? 0);

  if (price <= 0) return 0;

  return (getProfit(product) / price) * 100;
}

function getTypeLabel(value: ProductType | string) {
  return productTypes.find((type) => type.value === value)?.label || value;
}

function getStatusLabel(value: ProductStatus | string) {
  return (
    productStatuses.find((status) => status.value === value)?.label || value
  );
}

function getGalleryImages(product: ExperienceProduct): ProductGalleryImage[] {
  return Array.isArray(product.gallery_images) ? product.gallery_images : [];
}

function getGalleryCount(product: ExperienceProduct) {
  return getGalleryImages(product).length;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function compressImageFile(file: File, maxWidth = 1600, quality = 0.84) {
  if (!isImageFile(file)) return file;

  try {
    const imageBitmap = await createImageBitmap(file);

    const scale = Math.min(1, maxWidth / imageBitmap.width);
    const width = Math.round(imageBitmap.width * scale);
    const height = Math.round(imageBitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) return file;

    context.drawImage(imageBitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });

    if (!blob) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn(
      "Product image compression failed, using original file.",
      error,
    );
    return file;
  }
}

function getProductForm(product?: ExperienceProduct | null): ProductFormState {
  if (!product) return emptyForm;

  return {
    category_id: product.category ? String(product.category) : "",
    name: text(product.name),
    slug: text(product.slug),
    product_type: product.product_type || "excursion",
    sku: text(product.sku),
    short_description: text(product.short_description),
    long_description: text(product.long_description),
    adult_price: moneyToString(
      (product as any).adult_price ?? product.base_price,
    ),
    adult_cost_price: moneyToString(
      (product as any).adult_cost_price ?? product.cost_price,
    ),
    child_price: moneyToString((product as any).child_price),
    child_cost_price: moneyToString((product as any).child_cost_price),
    infant_price: moneyToString((product as any).infant_price),
    infant_cost_price: moneyToString((product as any).infant_cost_price),
    deposit_amount: moneyToString(product.deposit_amount),
    deposit_percentage: moneyToString(product.deposit_percentage),
    capacity: numberText(product.capacity),
    duration_text: text(product.duration_text),
    start_time: text(product.start_time),
    end_time: text(product.end_time),
    location: text(product.location),
    address: text(product.address),
    google_maps_link: text(product.google_maps_link),
    cancellation_policy: text(product.cancellation_policy),
    instructions: text(product.instructions),
    ticket_information: text((product as any).ticket_information),
    pickup_instructions: text(product.pickup_instructions),
    supports_pickup: bool(product.supports_pickup),
    requires_pickup_location: bool(product.requires_pickup_location),
    allow_full_payment: bool(product.allow_full_payment, true),
    allow_deposit_payment: bool(product.allow_deposit_payment, true),
    allow_pending_payment: bool(product.allow_pending_payment, true),
    allow_cash_payment: bool(product.allow_cash_payment, true),
    seller_enabled: bool(product.seller_enabled, true),
    public_enabled: bool(product.public_enabled, true),
    is_featured: bool(product.is_featured),
    is_recommended: bool(product.is_recommended),
    is_top_excursion: bool(product.is_top_excursion),
    is_top_transfer: bool(product.is_top_transfer),
    is_best_seller: bool(product.is_best_seller),
    status: product.status || "active",
    seo_title: text(product.seo_title),
    meta_description: text(product.meta_description),
    canonical_url: text(product.canonical_url),
    og_title: text(product.og_title),
    og_description: text(product.og_description),
    twitter_title: text(product.twitter_title),
    twitter_description: text(product.twitter_description),
    image_alt_text: text(product.image_alt_text),
    external_provider:
      (product as any).external_provider === "wellet" ||
      bool((product as any).is_cocobongo_product)
        ? "wellet"
        : "local",
    external_product_id: text((product as any).external_product_id),
    is_cocobongo_product:
      bool((product as any).is_cocobongo_product) ||
      (product as any).external_provider === "wellet",
    is_active: bool(product.is_active, true),
  };
}

function appendText(formData: FormData, key: string, value: unknown) {
  formData.append(key, text(value));
}

function appendBoolean(formData: FormData, key: string, value: boolean) {
  formData.append(key, value ? "true" : "false");
}

function appendNumberText(formData: FormData, key: string, value: string) {
  formData.append(key, value === "" ? "0" : value);
}

function buildProductPayload(form: ProductFormState, imageFile: File | null) {
  const formData = new FormData();

  if (form.category_id) {
    formData.append("category_id", form.category_id);
  }

  appendText(formData, "name", form.name);
  appendText(formData, "slug", form.slug || slugify(form.name));
  appendText(formData, "product_type", form.product_type);
  appendText(
    formData,
    "external_provider",
    form.is_cocobongo_product ? "wellet" : "local",
  );
  appendText(
    formData,
    "external_product_id",
    form.is_cocobongo_product ? form.external_product_id.trim() : "",
  );
  appendBoolean(formData, "is_cocobongo_product", form.is_cocobongo_product);
  appendText(formData, "sku", form.sku);
  appendText(formData, "short_description", form.short_description);
  appendText(formData, "long_description", form.long_description);

  appendNumberText(formData, "adult_price", form.adult_price);
  appendNumberText(formData, "adult_cost_price", form.adult_cost_price);
  appendNumberText(formData, "child_price", form.child_price);
  appendNumberText(formData, "child_cost_price", form.child_cost_price);
  appendNumberText(formData, "infant_price", form.infant_price);
  appendNumberText(formData, "infant_cost_price", form.infant_cost_price);

  // Keep legacy fields in sync for old API/UI/report compatibility.
  appendNumberText(formData, "base_price", form.adult_price);
  appendNumberText(formData, "cost_price", form.adult_cost_price);
  appendNumberText(formData, "deposit_amount", form.deposit_amount);
  appendNumberText(formData, "deposit_percentage", form.deposit_percentage);
  appendNumberText(formData, "capacity", form.capacity);

  appendText(formData, "duration_text", form.duration_text);
  appendText(formData, "start_time", form.start_time);
  appendText(formData, "end_time", form.end_time);
  appendText(formData, "location", form.location);
  appendText(formData, "address", form.address);
  appendText(formData, "google_maps_link", form.google_maps_link);

  appendText(formData, "cancellation_policy", form.cancellation_policy);
  appendText(formData, "instructions", form.instructions);
  appendText(formData, "ticket_information", form.ticket_information);
  appendText(formData, "pickup_instructions", form.pickup_instructions);

  appendBoolean(formData, "supports_pickup", form.supports_pickup);
  appendBoolean(
    formData,
    "requires_pickup_location",
    form.requires_pickup_location,
  );
  appendBoolean(formData, "allow_full_payment", form.allow_full_payment);
  appendBoolean(formData, "allow_deposit_payment", form.allow_deposit_payment);
  appendBoolean(formData, "allow_pending_payment", form.allow_pending_payment);
  appendBoolean(formData, "allow_cash_payment", form.allow_cash_payment);
  appendBoolean(formData, "seller_enabled", form.seller_enabled);
  appendBoolean(formData, "public_enabled", form.public_enabled);

  appendBoolean(formData, "is_featured", form.is_featured);
  appendBoolean(formData, "is_recommended", form.is_recommended);
  appendBoolean(formData, "is_top_excursion", form.is_top_excursion);
  appendBoolean(formData, "is_top_transfer", form.is_top_transfer);
  appendBoolean(formData, "is_best_seller", form.is_best_seller);

  appendText(formData, "status", form.status);
  appendBoolean(formData, "is_active", form.is_active);

  appendText(formData, "seo_title", form.seo_title);
  appendText(formData, "meta_description", form.meta_description);
  appendText(formData, "canonical_url", form.canonical_url);
  appendText(formData, "og_title", form.og_title);
  appendText(formData, "og_description", form.og_description);
  appendText(formData, "twitter_title", form.twitter_title);
  appendText(formData, "twitter_description", form.twitter_description);
  appendText(formData, "image_alt_text", form.image_alt_text);

  if (imageFile) {
    formData.append("image", imageFile);
  }

  return formData;
}

function buildPublicProductPath(organisationSlug: string, productSlug: string) {
  return `/experiences/${organisationSlug}/product/${productSlug}`;
}

function buildPublicProductUrl(organisationSlug: string, productSlug: string) {
  if (typeof window === "undefined") {
    return buildPublicProductPath(organisationSlug, productSlug);
  }

  return `${window.location.origin}${buildPublicProductPath(
    organisationSlug,
    productSlug,
  )}`;
}

export default function TicketingProductsPage() {
  const { t } = useTicketingAdminTranslation();
  const params = useParams();
  const slug = params.organisationSlug || params.slug || "";

  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [categories, setCategories] = useState<ExperienceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ProductType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "all">(
    "all",
  );
  const [visibilityFilter, setVisibilityFilter] = useState<
    "all" | "public" | "seller" | "pickup"
  >("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] =
    useState<ExperienceProduct | null>(null);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [galleryProduct, setGalleryProduct] =
    useState<ExperienceProduct | null>(null);
  const [gallerySaving, setGallerySaving] = useState(false);


  const [translationProduct, setTranslationProduct] =
    useState<ExperienceProduct | null>(null);
  const [translationLanguage, setTranslationLanguage] =
    useState<SupportedProductLanguage>("es");
  const [translationDraft, setTranslationDraft] =
    useState<ProductTranslation>(emptyTranslation);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationSaving, setTranslationSaving] = useState(false);
  const [translationGenerating, setTranslationGenerating] = useState(false);
  const [translationDeleting, setTranslationDeleting] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [translationMessage, setTranslationMessage] = useState("");
  const [translations, setTranslations] = useState<ProductTranslations>({});
  const [aiReady, setAiReady] = useState(false);
  const [aiTranslationsEnabled, setAiTranslationsEnabled] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const [productsResponse, categoriesResponse] = await Promise.all([
        ticketingApi.getProducts(slug, {}),
        ticketingApi.getCategories(slug, { is_active: true }),
      ]);

      setProducts(productsResponse);
      setCategories(categoriesResponse);
    } catch (err: any) {
      console.error("Could not load ticketing products:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          t("products.errors.load"),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (slug) {
      loadData();
    }
  }, [slug]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const textMatch = search.trim()
        ? `${product.name} ${product.short_description} ${product.location} ${product.sku || ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase())
        : true;

      const typeMatch =
        typeFilter === "all" ? true : product.product_type === typeFilter;

      const statusMatch =
        statusFilter === "all" ? true : product.status === statusFilter;

      const visibilityMatch =
        visibilityFilter === "all"
          ? true
          : visibilityFilter === "public"
            ? product.public_enabled
            : visibilityFilter === "seller"
              ? product.seller_enabled
              : product.supports_pickup || product.requires_pickup_location;

      return textMatch && typeMatch && statusMatch && visibilityMatch;
    });
  }, [products, search, typeFilter, statusFilter, visibilityFilter]);

  const summary = useMemo(() => {
    return {
      total: products.length,
      active: products.filter((product) => product.status === "active").length,
      public: products.filter((product) => product.public_enabled).length,
      seller: products.filter((product) => product.seller_enabled).length,
      pickup: products.filter(
        (product) =>
          product.supports_pickup || product.requires_pickup_location,
      ).length,
    };
  }, [products]);

  function openCreateModal(type: ProductType = "excursion") {
    setEditingProduct(null);
    setImageFile(null);
    setForm({
      ...emptyForm,
      product_type: type,
    });
    setModalOpen(true);
  }

  function openEditModal(product: ExperienceProduct) {
    setEditingProduct(product);
    setImageFile(null);
    setForm(getProductForm(product));
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditingProduct(null);
    setImageFile(null);
    setForm(emptyForm);
  }

  function openGalleryModal(product: ExperienceProduct) {
    setGalleryProduct(product);
  }

  function closeGalleryModal() {
    if (gallerySaving) return;
    setGalleryProduct(null);
  }

  async function refreshProduct(productId: number) {
    const updated = await ticketingApi.getProduct(productId, slug);

    setProducts((current) =>
      current.map((product) => (product.id === updated.id ? updated : product)),
    );

    setGalleryProduct((current) =>
      current && current.id === updated.id ? updated : current,
    );

    return updated;
  }

  async function handleUploadGalleryImages(files: FileList | File[]) {
    if (!galleryProduct) return;

    const list = Array.from(files).filter(isImageFile);

    if (!list.length) {
      setError(t("products.errors.invalidImages"));
      return;
    }

    try {
      setGallerySaving(true);
      setError("");
      setSavedMessage("");

      const existingCount = getGalleryCount(galleryProduct);

      for (const [index, file] of list.entries()) {
        const compressed = await compressImageFile(file, 1800, 0.84);
        const formData = new FormData();

        formData.append("product_id", String(galleryProduct.id));
        formData.append("image", compressed);
        formData.append(
          "alt_text",
          galleryProduct.image_alt_text || galleryProduct.name,
        );
        formData.append("caption", galleryProduct.name);
        formData.append("sort_order", String(existingCount + index));
        formData.append("is_active", "true");

        if (existingCount === 0 && index === 0 && !galleryProduct.image_url) {
          formData.append("is_cover", "true");
        }

        await ticketingApi.createProductGalleryImage(formData, slug);
      }

      await refreshProduct(galleryProduct.id);
      setSavedMessage(t("products.messages.galleryUploaded"));
    } catch (err: any) {
      console.error("Could not upload gallery images:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.image?.[0] ||
          err?.response?.data?.message ||
          t("products.errors.galleryUpload"),
      );
    } finally {
      setGallerySaving(false);
    }
  }

  async function handleMakeGalleryCover(image: ProductGalleryImage) {
    if (!galleryProduct) return;

    try {
      setGallerySaving(true);
      setError("");
      setSavedMessage("");

      await ticketingApi.makeProductGalleryImageCover(image.id, slug);
      await refreshProduct(galleryProduct.id);
      setSavedMessage(t("products.messages.coverUpdated"));
    } catch (err: any) {
      console.error("Could not make gallery image cover:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          t("products.errors.coverUpdate"),
      );
    } finally {
      setGallerySaving(false);
    }
  }

  async function handleDeleteGalleryImage(image: ProductGalleryImage) {
    if (!galleryProduct) return;

    const confirmed = window.confirm(t("products.confirm.deleteGalleryImage"));

    if (!confirmed) return;

    try {
      setGallerySaving(true);
      setError("");
      setSavedMessage("");

      await ticketingApi.deleteProductGalleryImage(image.id, slug);
      await refreshProduct(galleryProduct.id);
      setSavedMessage(t("products.messages.galleryDeleted"));
    } catch (err: any) {
      console.error("Could not delete gallery image:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          t("products.errors.galleryDelete"),
      );
    } finally {
      setGallerySaving(false);
    }
  }

  function updateForm<K extends keyof ProductFormState>(
    field: K,
    value: ProductFormState[K],
  ) {
    setForm((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === "name" && !current.slug.trim()) {
        return {
          ...next,
          slug: slugify(String(value)),
        };
      }

      if (field === "is_cocobongo_product") {
        const enabled = Boolean(value);

        return {
          ...next,
          external_provider: enabled ? "wellet" : "local",
          external_product_id: enabled ? current.external_product_id : "",
        };
      }

      return next;
    });
  }


  async function openTranslationsModal(product: ExperienceProduct) {
    const productTranslations =
      (product as any).translations as ProductTranslations | undefined;

    setTranslationProduct(product);
    setTranslationLanguage(
      ((product as any).default_language === "es" ? "en" : "es"),
    );
    setTranslationDraft(emptyTranslation);
    setTranslations(productTranslations || {});
    setTranslationError("");
    setTranslationMessage("");
    setTranslationLoading(true);

    try {
      const [translationResponse, aiResponse] = await Promise.all([
        ticketingApi.getProductTranslations(product.id, slug),
        ticketingApi
          .getOrganisationAISettings(slug)
          .catch(() => null),
      ]);

      setTranslations(translationResponse.translations || {});

      const initialLanguage =
        translationResponse.default_language === "es" ? "en" : "es";

      setTranslationLanguage(initialLanguage);
      setTranslationDraft(
        getTranslationDraft(
          translationResponse.translations || {},
          initialLanguage,
        ),
      );

      setAiReady(Boolean(aiResponse?.ai_ready));
      setAiTranslationsEnabled(
        Boolean(aiResponse?.translations_enabled),
      );
    } catch (err: any) {
      console.error("Could not load product translations:", err);

      setTranslationError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          t("products.errors.translationLoad"),
      );
    } finally {
      setTranslationLoading(false);
    }
  }

  function closeTranslationsModal() {
    if (
      translationSaving ||
      translationGenerating ||
      translationDeleting
    ) {
      return;
    }

    setTranslationProduct(null);
    setTranslationError("");
    setTranslationMessage("");
    setTranslations({});
    setTranslationDraft(emptyTranslation);
  }

  function selectTranslationLanguage(language: SupportedProductLanguage) {
    setTranslationLanguage(language);
    setTranslationDraft(getTranslationDraft(translations, language));
    setTranslationError("");
    setTranslationMessage("");
  }

  function updateTranslationDraft<K extends keyof ProductTranslation>(
    field: K,
    value: ProductTranslation[K],
  ) {
    setTranslationDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSaveTranslation() {
    if (!translationProduct) return;

    try {
      setTranslationSaving(true);
      setTranslationError("");
      setTranslationMessage("");

      const response = await ticketingApi.saveProductTranslation(
        translationProduct.id,
        translationLanguage,
        translationDraft,
        slug,
      );

      const nextTranslations = {
        ...translations,
        [translationLanguage]: response.translation,
      };

      setTranslations(nextTranslations);
      setTranslationDraft(response.translation);
      setTranslationMessage(
        t("products.messages.translationSaved", { language: getLanguageLabel(translationLanguage) }),
      );

      const refreshed = await refreshProduct(translationProduct.id);
      setTranslationProduct(refreshed);
    } catch (err: any) {
      console.error("Could not save product translation:", err);

      setTranslationError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          t("products.errors.translationSave"),
      );
    } finally {
      setTranslationSaving(false);
    }
  }

  async function handleGenerateTranslation() {
    if (!translationProduct) return;

    const currentTranslation = translations[translationLanguage];
    const isManual = Boolean(currentTranslation?._meta?.manually_edited);

    if (isManual) {
      const confirmed = window.confirm(
        t("products.confirm.overwriteManualTranslation"),
      );

      if (!confirmed) return;
    }

    try {
      setTranslationGenerating(true);
      setTranslationError("");
      setTranslationMessage("");

      const response = await ticketingApi.generateProductTranslation(
        translationProduct.id,
        translationLanguage,
        {
          force: isManual,
        },
        slug,
      );

      const nextTranslations = {
        ...translations,
        [translationLanguage]: response.translation,
      };

      setTranslations(nextTranslations);
      setTranslationDraft(response.translation);
      setTranslationMessage(
        t("products.messages.translationGenerated", { language: getLanguageLabel(translationLanguage) }),
      );

      const refreshed = await refreshProduct(translationProduct.id);
      setTranslationProduct(refreshed);
    } catch (err: any) {
      console.error("Could not generate product translation:", err);

      setTranslationError(
        err?.response?.data?.detail ||
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          t("products.errors.translationGenerate"),
      );
    } finally {
      setTranslationGenerating(false);
    }
  }

  async function handleDeleteTranslation() {
    if (!translationProduct) return;

    if (!translations[translationLanguage]) {
      setTranslationDraft(emptyTranslation);
      return;
    }

    const confirmed = window.confirm(
      t("products.confirm.deleteTranslation", { language: getLanguageLabel(translationLanguage) }),
    );

    if (!confirmed) return;

    try {
      setTranslationDeleting(true);
      setTranslationError("");
      setTranslationMessage("");

      await ticketingApi.deleteProductTranslation(
        translationProduct.id,
        translationLanguage,
        slug,
      );

      const nextTranslations = { ...translations };
      delete nextTranslations[translationLanguage];

      setTranslations(nextTranslations);
      setTranslationDraft(emptyTranslation);
      setTranslationMessage(
        t("products.messages.translationDeleted", { language: getLanguageLabel(translationLanguage) }),
      );

      const refreshed = await refreshProduct(translationProduct.id);
      setTranslationProduct(refreshed);
    } catch (err: any) {
      console.error("Could not delete product translation:", err);

      setTranslationError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          t("products.errors.translationDelete"),
      );
    } finally {
      setTranslationDeleting(false);
    }
  }

  async function handleSaveProduct() {
    if (!form.name.trim()) {
      setError(t("products.errors.nameRequired"));
      return;
    }

    try {
      setSaving(true);
      setCompressing(false);
      setError("");
      setSavedMessage("");

      const compressedImage = imageFile
        ? await (async () => {
            setCompressing(true);
            return compressImageFile(imageFile);
          })()
        : null;

      const payload = buildProductPayload(form, compressedImage);

      const savedProduct = editingProduct
        ? await ticketingApi.updateProduct(editingProduct.id, payload, slug)
        : await ticketingApi.createProduct(payload, slug);

      setProducts((current) => {
        if (editingProduct) {
          return current.map((product) =>
            product.id === savedProduct.id ? savedProduct : product,
          );
        }

        return [savedProduct, ...current];
      });

      setSavedMessage(
        editingProduct
          ? t("products.messages.updated")
          : t("products.messages.created"),
      );

      closeModal();
    } catch (err: any) {
      console.error("Could not save ticketing product:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.name?.[0] ||
          err?.response?.data?.slug?.[0] ||
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          t("products.errors.save"),
      );
    } finally {
      setSaving(false);
      setCompressing(false);
    }
  }

  async function handleCopyPublicUrl(product: ExperienceProduct) {
    if (!slug || !product.slug) return;

    const url = buildPublicProductUrl(slug, product.slug);

    try {
      await navigator.clipboard.writeText(url);
      setSavedMessage(t("products.messages.urlCopied"));
    } catch {
      window.prompt(t("products.prompts.copyPublicUrl"), url);
    }
  }

  async function handleToggleProduct(product: ExperienceProduct) {
    try {
      setError("");
      setSavedMessage("");

      const nextStatus: ProductStatus =
        product.status === "active" ? "inactive" : "active";

      const updated = await ticketingApi.updateProduct(
        product.id,
        {
          status: nextStatus,
          is_active: nextStatus === "active",
        },
        slug,
      );

      setProducts((current) =>
        current.map((item) => (item.id === product.id ? updated : item)),
      );

      setSavedMessage(
        nextStatus === "active" ? t("products.messages.activated") : t("products.messages.deactivated"),
      );
    } catch (err: any) {
      console.error("Could not update product status:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          t("products.errors.statusUpdate"),
      );
    }
  }

  async function handleDeleteProduct(product: ExperienceProduct) {
    const confirmed = window.confirm(
      t("products.confirm.deleteProduct", { name: product.name }),
    );

    if (!confirmed) return;

    try {
      setDeletingId(product.id);
      setError("");
      setSavedMessage("");

      await ticketingApi.deleteProduct(product.id, slug);

      setProducts((current) =>
        current.filter((item) => item.id !== product.id),
      );
      setSavedMessage(t("products.messages.deleted"));
    } catch (err: any) {
      console.error("Could not delete ticketing product:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          t("products.errors.delete"),
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600">
        {t("products.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Package className="h-7 w-7" />
          </div>

          <div>
            <p className="text-sm font-black uppercase tracking-wide text-amber-600">
              {t("products.header.eyebrow")}
            </p>

            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              {t("products.header.title")}
            </h1>

            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              {t("products.header.description")}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={loadData}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            {t("products.actions.refresh")}
          </button>

          <button
            type="button"
            onClick={() => openCreateModal("excursion")}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            {t("products.actions.new")}
          </button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title={t("products.stats.total")}
          value={String(summary.total)}
          helper={t("products.stats.allProducts")}
          icon={Package}
        />

        <StatCard
          title={t("products.stats.active")}
          value={String(summary.active)}
          helper={t("products.stats.currentlySellable")}
          icon={CheckCircle2}
        />

        <StatCard
          title={t("products.stats.public")}
          value={String(summary.public)}
          helper={t("products.stats.publicWebsite")}
          icon={Eye}
        />

        <StatCard
          title={t("products.stats.seller")}
          value={String(summary.seller)}
          helper={t("products.stats.sellerDashboard")}
          icon={Ticket}
        />

        <StatCard
          title={t("products.stats.pickup")}
          value={String(summary.pickup)}
          helper={t("products.stats.pickupEnabled")}
          icon={MapPin}
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

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_170px_170px_170px]">
          <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("products.filters.searchPlaceholder")}
              className="h-full flex-1 bg-transparent text-sm font-semibold outline-none"
            />
          </div>

          <Select
            label={t("products.filters.type")}
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as ProductType | "all")}
            options={[{ value: "all", label: t("products.filters.allTypes") }, ...productTypes.map((type) => ({ ...type, label: t(`products.types.${type.value}`) }))]}
          />

          <Select
            label={t("products.filters.status")}
            value={statusFilter}
            onChange={(value) =>
              setStatusFilter(value as ProductStatus | "all")
            }
            options={[
              { value: "all", label: t("products.filters.allStatuses") },
              ...productStatuses.map((status) => ({
                ...status,
                label: t(`products.statuses.${status.value}`),
              })),
            ]}
          />

          <Select
            label={t("products.filters.visibility")}
            value={visibilityFilter}
            onChange={(value) =>
              setVisibilityFilter(
                value as "all" | "public" | "seller" | "pickup",
              )
            }
            options={[
              { value: "all", label: t("products.filters.all") },
              { value: "public", label: t("products.visibility.public") },
              { value: "seller", label: t("products.visibility.seller") },
              { value: "pickup", label: t("products.visibility.pickup") },
            ]}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {productTypes.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setTypeFilter(type.value)}
              className={`rounded-2xl px-4 py-2 text-xs font-black transition ${
                typeFilter === type.value
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t(`products.types.${type.value}`)}
            </button>
          ))}
        </div>
      </section>

      {filteredProducts.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-100 text-amber-700">
            <Package className="h-8 w-8" />
          </div>

          <h2 className="mt-4 text-xl font-black text-slate-950">
            {t("products.empty.title")}
          </h2>

          <p className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-500">
            {t("products.empty.description")}
          </p>

          <button
            type="button"
            onClick={() => openCreateModal("excursion")}
            className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            {t("products.actions.create")}
          </button>
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              organisationSlug={slug}
              onEdit={() => openEditModal(product)}
              onGallery={() => openGalleryModal(product)}
              onTranslations={() => openTranslationsModal(product)}
              onCopyPublicUrl={() => handleCopyPublicUrl(product)}
              onToggle={() => handleToggleProduct(product)}
              onDelete={() => handleDeleteProduct(product)}
              deleting={deletingId === product.id}
            />
          ))}
        </section>
      )}

      {modalOpen && (
        <ProductModal
          title={editingProduct ? t("products.actions.edit") : t("products.actions.create")}
          product={editingProduct}
          form={form}
          categories={categories}
          imageFile={imageFile}
          saving={saving}
          compressing={compressing}
          onClose={closeModal}
          onSave={handleSaveProduct}
          onChange={updateForm}
          onImageChange={setImageFile}
        />
      )}

      {galleryProduct && (
        <ProductGalleryModal
          product={galleryProduct}
          saving={gallerySaving}
          onClose={closeGalleryModal}
          onUpload={handleUploadGalleryImages}
          onMakeCover={handleMakeGalleryCover}
          onDelete={handleDeleteGalleryImage}
        />
      )}


      {translationProduct && (
        <ProductTranslationsModal
          product={translationProduct}
          activeLanguage={translationLanguage}
          translations={translations}
          draft={translationDraft}
          loading={translationLoading}
          saving={translationSaving}
          generating={translationGenerating}
          deleting={translationDeleting}
          aiReady={aiReady}
          aiTranslationsEnabled={aiTranslationsEnabled}
          error={translationError}
          message={translationMessage}
          onClose={closeTranslationsModal}
          onSelectLanguage={selectTranslationLanguage}
          onChange={updateTranslationDraft}
          onSave={handleSaveTranslation}
          onGenerate={handleGenerateTranslation}
          onDelete={handleDeleteTranslation}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  organisationSlug,
  onEdit,
  onGallery,
  onTranslations,
  onCopyPublicUrl,
  onToggle,
  onDelete,
  deleting,
}: {
  product: ExperienceProduct;
  organisationSlug: string;
  onEdit: () => void;
  onGallery: () => void;
  onTranslations: () => void;
  onCopyPublicUrl: () => void;
  onToggle: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { t } = useTicketingAdminTranslation();
  const profit = getProfit(product);
  const margin = getProfitMargin(product);
  const publicPath =
    organisationSlug && product.slug
      ? buildPublicProductPath(organisationSlug, product.slug)
      : "";

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-4 p-4 sm:grid-cols-[150px_1fr]">
        <div className="flex h-36 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
          {product.image_url || product.image ? (
            <img
              src={(product.image_url || product.image) as string}
              alt={product.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <Image className="h-8 w-8 text-slate-300" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge label={getTypeLabel(product.product_type)} tone="amber" />
            <Badge
              label={getStatusLabel(product.status)}
              tone={product.status === "active" ? "green" : "slate"}
            />

            {product.public_enabled && <Badge label={t("products.visibility.public")} tone="blue" />}
            {product.seller_enabled && <Badge label={t("products.visibility.seller")} tone="purple" />}
            {(product.supports_pickup || product.requires_pickup_location) && (
              <Badge label={t("products.visibility.pickup")} tone="orange" />
            )}

            {((product as any).is_cocobongo_product ||
              (product as any).external_provider === "wellet") && (
              <Badge label="Coco Bongo" tone="pink" />
            )}


            {Object.keys((product as any).translations || {}).length > 0 && (
              <Badge
                label={`${Object.keys((product as any).translations || {}).length} languages`}
                tone="indigo"
              />
            )}
          </div>

          <h2 className="mt-3 truncate text-xl font-black text-slate-950">
            {product.name}
          </h2>

          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-500">
            {product.short_description || "No short description yet."}
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <MiniMetric
              label={t("products.metrics.price")}
              value={formatMoney(
                (product as any).adult_price ?? product.base_price,
              )}
              icon={DollarSign}
            />
            <MiniMetric
              label={t("products.metrics.cost")}
              value={formatMoney(
                (product as any).adult_cost_price ?? product.cost_price,
              )}
              icon={Tag}
            />
            <MiniMetric
              label={t("products.metrics.profit")}
              value={formatMoney(profit)}
              icon={DollarSign}
            />
            <MiniMetric
              label={t("products.metrics.margin")}
              value={`${margin.toFixed(1)}%`}
              icon={Percent}
            />
          </div>

          {product.public_enabled &&
            product.status === "active" &&
            publicPath && (
              <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                      Public page
                    </p>
                    <p className="mt-1 truncate text-xs font-bold text-blue-900">
                      {publicPath}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <a
                      href={publicPath}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-700"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View Page
                    </a>

                    <button
                      type="button"
                      onClick={onCopyPublicUrl}
                      className="inline-flex items-center gap-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-50"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy URL
                    </button>
                  </div>
                </div>
              </div>
            )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-bold text-slate-400">
              {product.location
                ? `Location: ${product.location}`
                : "No location"}
              {product.capacity ? ` · Capacity: ${product.capacity}` : ""}
              {` · Gallery: ${getGalleryCount(product)}`}
              {product.booking_count
                ? ` · Bookings: ${product.booking_count}`
                : ""}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onToggle}
                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
              >
                {product.status === "active" ? "Deactivate" : "Activate"}
              </button>

              <button
                type="button"
                onClick={onGallery}
                className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
              >
                <Image className="h-3.5 w-3.5" />
                Gallery
              </button>


              <button
                type="button"
                onClick={onTranslations}
                className="inline-flex items-center gap-1 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700 transition hover:bg-indigo-100"
              >
                <Languages className="h-3.5 w-3.5" />
                Translations
              </button>

              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit
              </button>

              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}


function ProductTranslationsModal({
  product,
  activeLanguage,
  translations,
  draft,
  loading,
  saving,
  generating,
  deleting,
  aiReady,
  aiTranslationsEnabled,
  error,
  message,
  onClose,
  onSelectLanguage,
  onChange,
  onSave,
  onGenerate,
  onDelete,
}: {
  product: ExperienceProduct;
  activeLanguage: SupportedProductLanguage;
  translations: ProductTranslations;
  draft: ProductTranslation;
  loading: boolean;
  saving: boolean;
  generating: boolean;
  deleting: boolean;
  aiReady: boolean;
  aiTranslationsEnabled: boolean;
  error: string;
  message: string;
  onClose: () => void;
  onSelectLanguage: (language: SupportedProductLanguage) => void;
  onChange: <K extends keyof ProductTranslation>(
    field: K,
    value: ProductTranslation[K],
  ) => void;
  onSave: () => void;
  onGenerate: () => void;
  onDelete: () => void;
}) {
  const { t } = useTicketingAdminTranslation();
  const defaultLanguage = (product as any).default_language || "en";
  const activeTranslation = translations[activeLanguage];
  const isDefaultLanguage = activeLanguage === defaultLanguage;
  const isBusy = loading || saving || generating || deleting;

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 max-w-6xl rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-indigo-600">
                Product translations
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {product.name}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Edit translations manually or generate them once with AI.
                Manual changes are protected from automatic overwrite.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {supportedLanguages.map((language) => {
              const hasTranslation = Boolean(translations[language.value]);
              const isDefault = language.value === defaultLanguage;

              return (
                <button
                  key={language.value}
                  type="button"
                  onClick={() => onSelectLanguage(language.value)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${
                    activeLanguage === language.value
                      ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="block text-sm font-black">
                    {language.flag} {language.nativeLabel}
                  </span>
                  <span className="mt-1 block text-[11px] font-bold uppercase tracking-wide opacity-70">
                    {isDefault
                      ? "Default"
                      : hasTranslation
                        ? "Translated"
                        : "Not translated"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-5 p-5">
          {error && (
            <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          {message && (
            <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              {message}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-6 text-sm font-bold text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading translations...
            </div>
          ) : isDefaultLanguage ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
              <h3 className="text-lg font-black text-amber-950">
                {getLanguageFlag(activeLanguage)}{" "}
                {getLanguageLabel(activeLanguage)} is the default language
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
                Edit the default-language content in the normal product form.
                The translations JSON only stores the other languages.
              </p>
            </div>
          ) : (
            <>
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                  <div>
                    <p className="text-sm font-black uppercase tracking-wide text-indigo-600">
                      {getLanguageFlag(activeLanguage)}{" "}
                      {getLanguageLabel(activeLanguage)}
                    </p>
                    <h3 className="mt-1 text-lg font-black text-slate-950">
                      Translation content
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {activeTranslation?._meta?.source === "ai"
                        ? "Originally generated with AI."
                        : activeTranslation
                          ? "Created manually."
                          : "No saved translation yet."}
                      {activeTranslation?._meta?.manually_edited
                        ? " This version has manual edits."
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onGenerate}
                      disabled={
                        isBusy ||
                        !aiReady ||
                        !aiTranslationsEnabled
                      }
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {generating ? "Generating..." : "Generate with AI"}
                    </button>

                    <button
                      type="button"
                      onClick={onDelete}
                      disabled={isBusy || !activeTranslation}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      {deleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Delete
                    </button>
                  </div>
                </div>

                {!aiReady || !aiTranslationsEnabled ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
                    AI generation is unavailable. Configure an API key and
                    enable AI translations in Organisation Settings. Manual
                    translation remains fully available.
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <Input
                    label="Product name"
                    value={text(draft.name)}
                    onChange={(value) => onChange("name", value)}
                  />

                  <Input
                    label="Meeting point"
                    value={text(draft.meeting_point)}
                    onChange={(value) =>
                      onChange("meeting_point", value)
                    }
                  />

                  <Textarea
                    label="Short description"
                    value={text(draft.short_description)}
                    onChange={(value) =>
                      onChange("short_description", value)
                    }
                  />

                  <Textarea
                    label="Long description"
                    value={text(draft.long_description)}
                    onChange={(value) =>
                      onChange("long_description", value)
                    }
                  />

                  <Textarea
                    label="Includes"
                    value={listToTextarea(draft.includes)}
                    onChange={(value) =>
                      onChange("includes", textareaToList(value))
                    }
                    placeholder="One item per line"
                  />

                  <Textarea
                    label="Excludes"
                    value={listToTextarea(draft.excludes)}
                    onChange={(value) =>
                      onChange("excludes", textareaToList(value))
                    }
                    placeholder="One item per line"
                  />

                  <Textarea
                    label="Itinerary"
                    value={listToTextarea(draft.itinerary)}
                    onChange={(value) =>
                      onChange("itinerary", textareaToList(value))
                    }
                    placeholder="One itinerary item per line"
                  />

                  <Textarea
                    label="FAQs"
                    value={listToTextarea(draft.faqs)}
                    onChange={(value) =>
                      onChange("faqs", textareaToList(value))
                    }
                    placeholder="One FAQ item per line"
                  />

                  <Textarea
                    label="Instructions"
                    value={text(draft.instructions)}
                    onChange={(value) =>
                      onChange("instructions", value)
                    }
                  />

                  <Textarea
                    label="Ticket information"
                    value={text(draft.ticket_information)}
                    onChange={(value) =>
                      onChange("ticket_information", value)
                    }
                  />

                  <Textarea
                    label="Cancellation policy"
                    value={text(draft.cancellation_policy)}
                    onChange={(value) =>
                      onChange("cancellation_policy", value)
                    }
                  />
                </div>
              </section>
            </>
          )}
        </div>

        {!isDefaultLanguage && !loading && (
          <div className="sticky bottom-0 flex flex-col justify-end gap-3 border-t border-slate-200 bg-white/95 p-5 backdrop-blur sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              disabled={isBusy}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              Close
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={isBusy}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? t("products.translations.saving") : t("products.translations.save")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductGalleryModal({
  product,
  saving,
  onClose,
  onUpload,
  onMakeCover,
  onDelete,
}: {
  product: ExperienceProduct;
  saving: boolean;
  onClose: () => void;
  onUpload: (files: FileList | File[]) => void;
  onMakeCover: (image: ProductGalleryImage) => void;
  onDelete: (image: ProductGalleryImage) => void;
}) {
  const galleryImages = getGalleryImages(product);

  return (
    <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 max-w-5xl rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-amber-600">
              Product gallery
            </p>
            <h2 className="text-xl font-black text-slate-950">
              {product.name}
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Upload multiple images. Mark one as cover to use it as the main
              product image.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <label className="block rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
            <span className="text-sm font-black text-slate-800">
              Upload gallery images
            </span>

            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              Select several images at once. They will be compressed before
              upload.
            </p>

            <input
              type="file"
              multiple
              accept="image/*"
              disabled={saving}
              onChange={(event) => {
                const files = event.target.files;

                if (files?.length) {
                  onUpload(files);
                  event.target.value = "";
                }
              }}
              className="mt-4 w-full text-sm font-semibold text-slate-600"
            />
          </label>

          {galleryImages.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
              <Image className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-3 text-lg font-black text-slate-950">
                No gallery images yet
              </h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Upload images so the public product detail can show a modern
                gallery.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {galleryImages.map((image) => (
                <div
                  key={image.id}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="relative h-48 bg-slate-100">
                    {image.image_url || image.image ? (
                      <img
                        src={(image.image_url || image.image) as string}
                        alt={image.alt_text || product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <Image className="h-8 w-8 text-slate-300" />
                      </div>
                    )}

                    {image.is_cover && (
                      <span className="absolute left-3 top-3 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800 shadow">
                        Cover
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    <p className="line-clamp-1 text-sm font-black text-slate-900">
                      {image.caption || image.alt_text || product.name}
                    </p>

                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Sort order: {image.sort_order}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onMakeCover(image)}
                        disabled={saving || image.is_cover}
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                      >
                        Make cover
                      </button>

                      <button
                        type="button"
                        onClick={() => onDelete(image)}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {saving && (
            <div className="flex items-center gap-2 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              Updating gallery...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductModal({
  title,
  product,
  form,
  categories,
  imageFile,
  saving,
  compressing,
  onClose,
  onSave,
  onChange,
  onImageChange,
}: {
  title: string;
  product: ExperienceProduct | null;
  form: ProductFormState;
  categories: ExperienceCategory[];
  imageFile: File | null;
  saving: boolean;
  compressing: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: <K extends keyof ProductFormState>(
    field: K,
    value: ProductFormState[K],
  ) => void;
  onImageChange: (file: File | null) => void;
}) {
  const { t } = useTicketingAdminTranslation();

  const imagePreview = imageFile
    ? URL.createObjectURL(imageFile)
    : product?.image_url || product?.image || "";

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 max-w-6xl rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-amber-600">
              Product
            </p>
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <FormSection
            title={t("products.modal.sections.basic.title")}
            description={t("products.modal.sections.basic.description")}
            icon={Package}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Input
                label={t("products.modal.fields.name")}
                value={form.name}
                onChange={(value) => onChange("name", value)}
                placeholder="Isla Saona Full Day"
              />

              <Input
                label={t("products.modal.fields.slug")}
                value={form.slug}
                onChange={(value) => onChange("slug", slugify(value))}
                placeholder="isla-saona-full-day"
              />

              <Select
                label={t("products.modal.fields.type")}
                value={form.product_type}
                onChange={(value) =>
                  onChange("product_type", value as ProductType)
                }
                options={productTypes.map((type) => ({ ...type, label: t(`products.types.${type.value}`) }))}
              />

              <Select
                label={t("products.modal.fields.category")}
                value={form.category_id}
                onChange={(value) => onChange("category_id", value)}
                options={[
                  { value: "", label: t("products.modal.options.noCategory") },
                  ...categories.map((category) => ({
                    value: String(category.id),
                    label: category.name,
                  })),
                ]}
              />

              <Input
                label={t("products.modal.fields.sku")}
                value={form.sku}
                onChange={(value) => onChange("sku", value)}
                placeholder="SAONA-001"
              />

              <Textarea
                label={t("products.modal.fields.shortDescription")}
                value={form.short_description}
                onChange={(value) => onChange("short_description", value)}
                placeholder="Short text shown in cards and summaries."
              />

              <Textarea
                label={t("products.modal.fields.longDescription")}
                value={form.long_description}
                onChange={(value) => onChange("long_description", value)}
                placeholder="Full description for the product page."
              />
            </div>
          </FormSection>

          <FormSection
            title={t("products.modal.sections.wellet.title")}
            description={t("products.modal.sections.wellet.description")}
            icon={Ticket}
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <Toggle
                label={t("products.modal.fields.isCocoBongo")}
                description={t("products.modal.fields.isCocoBongoDescription")}
                checked={form.is_cocobongo_product}
                onChange={(value) => onChange("is_cocobongo_product", value)}
              />

              <Input
                label={t("products.modal.fields.externalProductId")}
                value={form.external_product_id}
                onChange={(value) => onChange("external_product_id", value)}
                placeholder={t("products.modal.placeholders.externalProductId")}
              />
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
              {t("products.modal.providerSent")}{" "}
              <span className="font-black">
                {form.is_cocobongo_product ? "wellet" : "local"}
              </span>
            </div>
          </FormSection>

          <FormSection
            title={t("products.modal.sections.image.title")}
            description={t("products.modal.sections.image.description")}
            icon={Image}
          >
            <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
              <div className="flex h-48 items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt={form.name || t("products.modal.imageFallbackAlt")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Image className="h-10 w-10 text-slate-300" />
                )}
              </div>

              <label className="block rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
                <span className="text-sm font-black text-slate-800">
                  Upload product image
                </span>

                <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                  {t("products.modal.image.uploadDescription")}
                </p>

                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;

                    if (file && !isImageFile(file)) {
                      onImageChange(null);
                      return;
                    }

                    onImageChange(file);
                  }}
                  className="mt-4 w-full text-sm font-semibold text-slate-600"
                />

                {imageFile && (
                  <p className="mt-3 text-xs font-bold text-slate-500">
                    {t("products.modal.image.selected")} {imageFile.name} ·{" "}
                    {formatFileSize(imageFile.size)}
                  </p>
                )}

                <Input
                  label={t("products.modal.fields.imageAltText")}
                  value={form.image_alt_text}
                  onChange={(value) => onChange("image_alt_text", value)}
                  placeholder={t("products.modal.placeholders.imageAltText")}
                />
              </label>
            </div>
          </FormSection>

          <FormSection
            title={t("products.modal.sections.pricing.title")}
            description={t("products.modal.sections.pricing.description")}
            icon={DollarSign}
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <Input
                label={t("products.modal.fields.adultPrice")}
                type="number"
                min="0"
                step="0.01"
                value={form.adult_price}
                onChange={(value) => onChange("adult_price", value)}
              />

              <Input
                label={t("products.modal.fields.adultCost")}
                type="number"
                min="0"
                step="0.01"
                value={form.adult_cost_price}
                onChange={(value) => onChange("adult_cost_price", value)}
              />

              <Input
                label={t("products.modal.fields.childPrice")}
                type="number"
                min="0"
                step="0.01"
                value={form.child_price}
                onChange={(value) => onChange("child_price", value)}
              />

              <Input
                label={t("products.modal.fields.childCost")}
                type="number"
                min="0"
                step="0.01"
                value={form.child_cost_price}
                onChange={(value) => onChange("child_cost_price", value)}
              />

              <Input
                label={t("products.modal.fields.infantPrice")}
                type="number"
                min="0"
                step="0.01"
                value={form.infant_price}
                onChange={(value) => onChange("infant_price", value)}
              />

              <Input
                label={t("products.modal.fields.infantCost")}
                type="number"
                min="0"
                step="0.01"
                value={form.infant_cost_price}
                onChange={(value) => onChange("infant_cost_price", value)}
              />

              <Input
                label={t("products.modal.fields.depositAmount")}
                type="number"
                min="0"
                step="0.01"
                value={form.deposit_amount}
                onChange={(value) => onChange("deposit_amount", value)}
              />

              <Input
                label={t("products.modal.fields.depositPercentage")}
                type="number"
                min="0"
                step="0.01"
                value={form.deposit_percentage}
                onChange={(value) => onChange("deposit_percentage", value)}
              />

              <Input
                label={t("products.modal.fields.capacity")}
                type="number"
                min="0"
                step="1"
                value={form.capacity}
                onChange={(value) => onChange("capacity", value)}
              />
            </div>
          </FormSection>

          <FormSection
            title={t("products.modal.sections.schedule.title")}
            description={t("products.modal.sections.schedule.description")}
            icon={MapPin}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Input
                label={t("products.modal.fields.duration")}
                value={form.duration_text}
                onChange={(value) => onChange("duration_text", value)}
                placeholder="Full day, 4 hours, 8:00 AM - 5:00 PM"
              />

              <Input
                label={t("products.modal.fields.location")}
                value={form.location}
                onChange={(value) => onChange("location", value)}
                placeholder="Punta Cana, Dominican Republic"
              />

              <Input
                label={t("products.modal.fields.startTime")}
                type="time"
                value={form.start_time}
                onChange={(value) => onChange("start_time", value)}
              />

              <Input
                label={t("products.modal.fields.endTime")}
                type="time"
                value={form.end_time}
                onChange={(value) => onChange("end_time", value)}
              />

              <Input
                label={t("products.modal.fields.address")}
                value={form.address}
                onChange={(value) => onChange("address", value)}
                placeholder="Meeting point or attraction address"
              />

              <Input
                label={t("products.modal.fields.googleMapsLink")}
                value={form.google_maps_link}
                onChange={(value) => onChange("google_maps_link", value)}
                placeholder="https://maps.google.com/..."
              />
            </div>
          </FormSection>

          <FormSection
            title={t("products.modal.sections.bookingRules.title")}
            description={t("products.modal.sections.bookingRules.description")}
            icon={Ticket}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Toggle
                label={t("products.modal.fields.publicEnabled")}
                description={t("products.modal.fields.publicEnabledDescription")}
                checked={form.public_enabled}
                onChange={(value) => onChange("public_enabled", value)}
              />

              <Toggle
                label={t("products.modal.fields.sellerEnabled")}
                description={t("products.modal.fields.sellerEnabledDescription")}
                checked={form.seller_enabled}
                onChange={(value) => onChange("seller_enabled", value)}
              />

              <Toggle
                label={t("products.modal.fields.fullPayment")}
                description={t("products.modal.fields.fullPaymentDescription")}
                checked={form.allow_full_payment}
                onChange={(value) => onChange("allow_full_payment", value)}
              />

              <Toggle
                label={t("products.modal.fields.depositPayment")}
                description={t("products.modal.fields.depositPaymentDescription")}
                checked={form.allow_deposit_payment}
                onChange={(value) => onChange("allow_deposit_payment", value)}
              />

              <Toggle
                label={t("products.modal.fields.pendingPayment")}
                description={t("products.modal.fields.pendingPaymentDescription")}
                checked={form.allow_pending_payment}
                onChange={(value) => onChange("allow_pending_payment", value)}
              />

              <Toggle
                label={t("products.modal.fields.cashPayment")}
                description={t("products.modal.fields.cashPaymentDescription")}
                checked={form.allow_cash_payment}
                onChange={(value) => onChange("allow_cash_payment", value)}
              />

              <Toggle
                label={t("products.modal.fields.supportsPickup")}
                description={t("products.modal.fields.supportsPickupDescription")}
                checked={form.supports_pickup}
                onChange={(value) => onChange("supports_pickup", value)}
              />

              <Toggle
                label={t("products.modal.fields.requiresPickupLocation")}
                description={t("products.modal.fields.requiresPickupLocationDescription")}
                checked={form.requires_pickup_location}
                onChange={(value) =>
                  onChange("requires_pickup_location", value)
                }
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Textarea
                label={t("products.modal.fields.pickupInstructions")}
                value={form.pickup_instructions}
                onChange={(value) => onChange("pickup_instructions", value)}
                placeholder={t("products.modal.placeholders.pickupInstructions")}
              />

              <Textarea
                label={t("products.modal.fields.instructions")}
                value={form.instructions}
                onChange={(value) => onChange("instructions", value)}
                placeholder={t("products.modal.placeholders.instructions")}
              />
              <div className="lg:col-span-2">
                <Textarea
                  label={t("products.modal.fields.ticketInformation")}
                  value={form.ticket_information}
                  onChange={(value) => onChange("ticket_information", value)}
                  placeholder={t("products.modal.placeholders.ticketInformation")}
                />
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                  {t("products.modal.ticketInformationHelp")}
                </p>
              </div>
            </div>
          </FormSection>

          <FormSection
            title={t("products.modal.sections.ranking.title")}
            description={t("products.modal.sections.ranking.description")}
            icon={Sparkles}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Select
                label={t("products.filters.status")}
                value={form.status}
                onChange={(value) => onChange("status", value as ProductStatus)}
                options={productStatuses.map((status) => ({ ...status, label: t(`products.statuses.${status.value}`) }))}
              />

              <Toggle
                label={t("products.modal.fields.active")}
                description={t("products.modal.fields.activeDescription")}
                checked={form.is_active}
                onChange={(value) => onChange("is_active", value)}
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Toggle
                label={t("products.modal.fields.featured")}
                checked={form.is_featured}
                onChange={(value) => onChange("is_featured", value)}
              />

              <Toggle
                label={t("products.modal.fields.recommended")}
                checked={form.is_recommended}
                onChange={(value) => onChange("is_recommended", value)}
              />

              <Toggle
                label={t("products.modal.fields.topExcursion")}
                checked={form.is_top_excursion}
                onChange={(value) => onChange("is_top_excursion", value)}
              />

              <Toggle
                label={t("products.modal.fields.topTransfer")}
                checked={form.is_top_transfer}
                onChange={(value) => onChange("is_top_transfer", value)}
              />

              <Toggle
                label={t("products.modal.fields.bestSeller")}
                checked={form.is_best_seller}
                onChange={(value) => onChange("is_best_seller", value)}
              />
            </div>
          </FormSection>

          <FormSection
            title={t("products.modal.sections.seo.title")}
            description={t("products.modal.sections.seo.description")}
            icon={Search}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Input
                label={t("products.modal.fields.seoTitle")}
                value={form.seo_title}
                onChange={(value) => onChange("seo_title", value)}
                placeholder="Isla Saona Tour from Punta Cana"
              />

              <Input
                label={t("products.modal.fields.canonicalUrl")}
                value={form.canonical_url}
                onChange={(value) => onChange("canonical_url", value)}
                placeholder="https://example.com/product/isla-saona"
              />

              <Textarea
                label={t("products.modal.fields.metaDescription")}
                value={form.meta_description}
                onChange={(value) => onChange("meta_description", value)}
                placeholder="Book Isla Saona with hotel pickup, lunch and catamaran..."
              />

              <Textarea
                label={t("products.modal.fields.ogDescription")}
                value={form.og_description}
                onChange={(value) => onChange("og_description", value)}
                placeholder="Social sharing description."
              />

              <Input
                label={t("products.modal.fields.ogTitle")}
                value={form.og_title}
                onChange={(value) => onChange("og_title", value)}
                placeholder="Isla Saona Tour"
              />

              <Input
                label={t("products.modal.fields.twitterTitle")}
                value={form.twitter_title}
                onChange={(value) => onChange("twitter_title", value)}
                placeholder="Isla Saona Tour"
              />

              <Textarea
                label={t("products.modal.fields.twitterDescription")}
                value={form.twitter_description}
                onChange={(value) => onChange("twitter_description", value)}
                placeholder="Twitter/X sharing description."
              />

              <Textarea
                label={t("products.modal.fields.cancellationPolicy")}
                value={form.cancellation_policy}
                onChange={(value) => onChange("cancellation_policy", value)}
                placeholder="Free cancellation up to 24 hours before service."
              />
            </div>
          </FormSection>
        </div>

        <div className="sticky bottom-0 flex flex-col justify-end gap-3 border-t border-slate-200 bg-white/95 p-5 backdrop-blur sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving
              ? compressing
                ? t("products.modal.actions.compressing")
                : t("products.modal.actions.saving")
              : t("products.modal.actions.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  helper,
  icon: Icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="h-6 w-6 text-amber-600" />
      <p className="mt-4 text-sm font-bold text-slate-500">{title}</p>
      <h2 className="mt-1 text-3xl font-black text-slate-950">{value}</h2>
      <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <Icon className="h-4 w-4 text-slate-400" />
      <p className="mt-2 text-xs font-bold text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "amber" | "green" | "slate" | "blue" | "purple" | "orange" | "pink" | "indigo";
}) {
  const tones = {
    amber: "bg-amber-100 text-amber-700",
    green: "bg-emerald-100 text-emerald-700",
    slate: "bg-slate-100 text-slate-600",
    blue: "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700",
    orange: "bg-orange-100 text-orange-700",
    pink: "bg-pink-100 text-pink-700",
    indigo: "bg-indigo-100 text-indigo-700",
  };

  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black ${tones[tone]}`}
    >
      {label}
    </span>
  );
}

function FormSection({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: ElementType;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>

        <div>
          <h3 className="text-lg font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            {description}
          </p>
        </div>
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
  min,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <input
        type={type}
        min={min}
        step={step}
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
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>

      <div className="flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3">
        <Filter className="h-4 w-4 text-slate-400" />

        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full w-full bg-transparent text-sm font-bold text-slate-700 outline-none"
        >
          {options.map((option) => (
            <option key={`${label}-${option.value}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
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
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100">
      <span>
        <span className="block text-sm font-black text-slate-800">{label}</span>

        {description && (
          <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
            {description}
          </span>
        )}
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
