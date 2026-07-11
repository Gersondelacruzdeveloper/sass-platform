// src/modules/ticketing/pages/seller/TicketingSellerNewBookingPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Hotel,
  Loader2,
  Minus,
  Plus,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  Ticket,
  UserRound,
  Users,
} from "lucide-react";

import ticketingApi from "../../api/ticketingApi";
import type {
  Booking,
  BookingCreatePayload,
  BookingPaymentPayload,
  ExperienceProduct,
  PaymentMethod,
  PaymentMode,
  PickupLocation,
  PickupResolveResponse,
  ProductPickupSchedule,
  Seller,
} from "../../types/ticketingTypes";

type SellerPaymentAction =
  | "pending_payment"
  | "deposit_online"
  | "full_online"
  | "cash_full"
  | "seller_deposit"
  | "seller_full"
  | "commission_only"
  | "generate_ticket"
  | "requires_supervisor_approval";

type FormState = {
  productId: string;
  serviceDate: string;
  serviceTime: string;
  customerName: string;
  customerWhatsapp: string;
  customerEmail: string;
  customerHotel: string;
  customerNotes: string;
  adults: number;
  children: number;
  infants: number;
  pickupLocationId: string;
  discountAmount: string;
  paymentAction: SellerPaymentAction;
  paymentReference: string;
  paymentNote: string;
  receiptSentBeforeFullPayment: boolean;
};

type PickupScheduleRule = ProductPickupSchedule & {
  product?: number | string | null;
  product_id?: number | string | null;
  pickup_location?: number | string | null;
  pickup_location_id?: number | string | null;
  pickup_location_name?: string;
  day_of_week?: number | string | null;
  specific_date?: string | null;
  pickup_time?: string | null;
  pickup_point?: string | null;
  resolved_pickup_point?: string | null;
  instructions?: string | null;
  is_active?: boolean;
};

type LiveTicketOption = {
  provider: "wellet" | "local" | string;
  external_product_id?: string;
  external_variant_id?: string;
  external_availability_id?: string;
  name?: string;
  option_name?: string;
  price?: number | string;
  currency?: string;
  available?: boolean;
  available_quantity?: number | null;
  sold_out?: boolean;
  service_date?: string;
  start_time?: string;
  end_time?: string;
  checkin_time?: string;
  performance_id?: string;
  description?: string;
  features?: string[];
  high_demand?: boolean;
  raw?: unknown;
};

type LiveAvailabilityResponse = {
  ok: boolean;
  provider: "wellet" | "local" | string;
  product?: {
    id: number;
    name: string;
    slug: string;
    external_product_id?: string;
  };
  service_date?: string;
  options: LiveTicketOption[];
  error?: string;
};

const initialForm: FormState = {
  productId: "",
  serviceDate: "",
  serviceTime: "",
  customerName: "",
  customerWhatsapp: "",
  customerEmail: "",
  customerHotel: "",
  customerNotes: "",
  adults: 1,
  children: 0,
  infants: 0,
  pickupLocationId: "",
  discountAmount: "0.00",
  paymentAction: "pending_payment",
  paymentReference: "",
  paymentNote: "",
  receiptSentBeforeFullPayment: false,
};

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

function moneyString(value: number) {
  return value.toFixed(2);
}

function formatMoney(value?: string | number | null, symbol = "US$") {
  const number = numberValue(value);
  return `${symbol} ${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isValidEmail(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function getChargeableGuests(form: FormState) {
  return Math.max(1, Number(form.adults || 0) + Number(form.children || 0));
}

function getTotalGuests(form: FormState) {
  return (
    Math.max(0, Number(form.adults || 0)) +
    Math.max(0, Number(form.children || 0)) +
    Math.max(0, Number(form.infants || 0))
  );
}

function calculateDepositRequired(product: ExperienceProduct | null, subtotal: number) {
  if (!product) return 0;
  const depositAmount = numberValue(product.deposit_amount);
  const depositPercentage = numberValue(product.deposit_percentage);
  if (depositAmount > 0) return depositAmount;
  if (depositPercentage > 0) return (subtotal * depositPercentage) / 100;
  return 0;
}

function getPythonWeekday(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getDay() + 6) % 7;
}

function getScheduleProductId(schedule: PickupScheduleRule) {
  return String(schedule.product || schedule.product_id || (schedule as any).productId || "");
}

function getPickupLocationIdFromSchedule(schedule: PickupScheduleRule) {
  return String(schedule.pickup_location || schedule.pickup_location_id || (schedule as any).location || "");
}

function findSchedule(
  schedules: ProductPickupSchedule[],
  productId: string,
  pickupLocationId: string,
  serviceDate: string
) {
  if (!productId || !pickupLocationId || !serviceDate) return null;
  const weekday = getPythonWeekday(serviceDate);

  const matching = schedules.filter((schedule) => {
    if (schedule.is_active === false) return false;
    if (getScheduleProductId(schedule as PickupScheduleRule) !== String(productId)) return false;
    if (getPickupLocationIdFromSchedule(schedule as PickupScheduleRule) !== String(pickupLocationId)) return false;
    return true;
  });

  const exactDate = matching.find((schedule) => schedule.specific_date === serviceDate);
  if (exactDate) return exactDate;

  const daySchedule = matching.find(
    (schedule) =>
      schedule.specific_date == null &&
      schedule.day_of_week != null &&
      Number(schedule.day_of_week) === weekday
  );
  if (daySchedule) return daySchedule;

  return matching.find((schedule) => schedule.specific_date == null && schedule.day_of_week == null) || null;
}

function getProductPickupSchedules(product: ExperienceProduct | null): PickupScheduleRule[] {
  if (!product) return [];
  const schedules = Array.isArray((product as any).pickup_schedules)
    ? ((product as any).pickup_schedules as PickupScheduleRule[])
    : [];
  return schedules.filter((schedule) => schedule.is_active !== false);
}

function getProductSchedules(schedules: ProductPickupSchedule[], productId: string): PickupScheduleRule[] {
  if (!productId) return [];
  return (schedules as PickupScheduleRule[]).filter(
    (schedule) => schedule.is_active !== false && getScheduleProductId(schedule) === String(productId)
  );
}

function getVisiblePickupLocationsForProduct(
  product: ExperienceProduct | null,
  pickupLocations: PickupLocation[],
  fallbackSchedules: ProductPickupSchedule[]
) {
  const productSchedules = getProductPickupSchedules(product);
  const schedulesToUse = productSchedules.length
    ? productSchedules
    : getProductSchedules(fallbackSchedules, String(product?.id || ""));

  const scheduledLocationIds = new Set(schedulesToUse.map(getPickupLocationIdFromSchedule).filter(Boolean));
  if (!scheduledLocationIds.size) return pickupLocations;
  return pickupLocations.filter((location) => scheduledLocationIds.has(String(location.id)));
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

function getPaymentMode(action: SellerPaymentAction): PaymentMode {
  if (action === "deposit_online") return "customer_deposit_online";
  if (action === "full_online") return "customer_full_online";
  if (action === "cash_full") return "customer_cash_to_seller";
  if (action === "seller_deposit") return "seller_deposit_payment";
  if (action === "seller_full") return "seller_full_payment";
  if (action === "commission_only") return "seller_commission_only";
  if (action === "generate_ticket") return "seller_commission_only";
  if (action === "requires_supervisor_approval") return "requires_supervisor_approval";
  return "pending_payment";
}

function getPaymentMethod(action: SellerPaymentAction): PaymentMethod {
  if (action === "cash_full") return "seller_collected";
  if (["deposit_online", "full_online"].includes(action)) return "online";
  if (["seller_deposit", "seller_full"].includes(action)) return "seller_collected";
  return "none";
}

function getPaymentPayload(
  action: SellerPaymentAction,
  totalAmount: number,
  depositRequired: number,
  reference: string,
  note: string
): BookingPaymentPayload | null {
  if (action === "deposit_online") {
    return { amount: moneyString(depositRequired || totalAmount), payment_type: "deposit", payer_type: "customer", method: "online", status: "confirmed", reference, note };
  }
  if (action === "full_online") {
    return { amount: moneyString(totalAmount), payment_type: "full", payer_type: "customer", method: "online", status: "confirmed", reference, note };
  }
  if (action === "cash_full") {
    return { amount: moneyString(totalAmount), payment_type: "full", payer_type: "customer", method: "cash", status: "confirmed", reference, note };
  }
  if (action === "seller_deposit") {
    return { amount: moneyString(depositRequired || totalAmount), payment_type: "deposit", payer_type: "seller", method: "cash", status: "confirmed", reference, note };
  }
  if (action === "seller_full") {
    return { amount: moneyString(totalAmount), payment_type: "full", payer_type: "seller", method: "cash", status: "confirmed", reference, note };
  }
  return null;
}

function getAllowedPaymentActions(seller: Seller | null) {
  if (!seller) return [] as Array<{ value: SellerPaymentAction; label: string; shortLabel: string; icon: ReactNode }>;

  const actions: Array<{ value: SellerPaymentAction; label: string; shortLabel: string; icon: ReactNode }> = [];

  if (seller.can_take_deposits) actions.push({ value: "deposit_online", label: "Deposit", shortLabel: "Deposit", icon: <CreditCard className="h-5 w-5" /> });
  if (seller.can_take_full_payments) actions.push({ value: "full_online", label: "Full payment", shortLabel: "Full", icon: <CreditCard className="h-5 w-5" /> });
  if (seller.can_collect_cash_payment && seller.can_take_full_payments) actions.push({ value: "cash_full", label: "Cash", shortLabel: "Cash", icon: <Banknote className="h-5 w-5" /> });
  if (seller.can_create_pending_payment_booking) actions.push({ value: "pending_payment", label: "Pay later", shortLabel: "Later", icon: <ReceiptText className="h-5 w-5" /> });
  if (seller.can_generate_ticket_without_customer_online_payment) actions.push({ value: "generate_ticket", label: "Generate ticket", shortLabel: "Ticket", icon: <Ticket className="h-5 w-5" /> });
  if (seller.can_pay_deposit_as_seller) actions.push({ value: "seller_deposit", label: "Seller deposit", shortLabel: "Seller deposit", icon: <ShieldCheck className="h-5 w-5" /> });
  if (seller.can_pay_full_amount_as_seller) actions.push({ value: "seller_full", label: "Seller full", shortLabel: "Seller full", icon: <ShieldCheck className="h-5 w-5" /> });
  if (seller.can_pay_commission_only) actions.push({ value: "commission_only", label: "Commission only", shortLabel: "Commission", icon: <ShieldCheck className="h-5 w-5" /> });
  if (seller.can_request_supervisor_approval) actions.push({ value: "requires_supervisor_approval", label: "Ask approval", shortLabel: "Approval", icon: <Send className="h-5 w-5" /> });

  return actions;
}


function isCocoBongoProduct(product: ExperienceProduct | null) {
  if (!product) return false;

  const provider = String((product as any).external_provider || "").toLowerCase();
  const slug = String(product.slug || "").toLowerCase();
  const name = String(product.name || "").toLowerCase();
  const externalProductId = String(
    (product as any).external_product_id || ""
  ).toLowerCase();

  return (
    provider === "wellet" ||
    Boolean((product as any).is_cocobongo_product) ||
    slug.includes("coco-bongo") ||
    name.includes("coco bongo") ||
    externalProductId.includes("coco-bongo")
  );
}

function cleanLiveText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function asObject(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function getLiveOptionKey(option: LiveTicketOption) {
  return String(
    option.external_availability_id ||
      option.external_variant_id ||
      option.external_product_id ||
      option.option_name ||
      option.name ||
      ""
  );
}

function getLiveOptionLabel(option: LiveTicketOption) {
  return option.option_name || option.name || "Ticket option";
}

function getLiveOptionPrice(option: LiveTicketOption | null) {
  return numberValue(option?.price);
}

function getRawLivePrice(product: Record<string, any>) {
  const prices = Array.isArray(product.prices) ? product.prices : [];
  const firstPrice = asObject(prices[0]) || {};

  return {
    amount: Number(
      firstPrice.amount ??
        firstPrice.amountWithoutDiscount ??
        product.amount ??
        product.price ??
        0
    ),
    currency: String(
      firstPrice.currencyCode ||
        firstPrice.currency ||
        product.currencyCode ||
        product.currency ||
        "USD"
    ),
  };
}

function getRawAvailableQuantity(product: Record<string, any>) {
  const value =
    product.itemsAvailable ??
    product.stock ??
    product.available_quantity;

  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function flattenRawWelletProducts(
  option: LiveTicketOption
): LiveTicketOption[] {
  const raw = asObject(option.raw);

  if (!raw) return [option];

  const performance = asObject(raw.performance) || {};
  const products = Array.isArray(raw.products)
    ? raw.products
    : raw.product && typeof raw.product === "object"
      ? [raw.product]
      : [];

  if (!products.length) return [option];

  const performanceId = cleanLiveText(performance.id);
  const startTime = cleanLiveText(
    performance.timeStart || performance.time || performance.startTime
  );
  const endTime = cleanLiveText(
    performance.timeEnd || performance.endTime
  );
  const checkinTime = cleanLiveText(performance.timeCheckIn);

  return products
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const productItem = item as Record<string, any>;
      const price = getRawLivePrice(productItem);
      const productId = cleanLiveText(productItem.id);
      const availableQuantity = getRawAvailableQuantity(productItem);

      const soldOut =
        productItem.isSoldOut === true ||
        productItem.isSoldOut === "true" ||
        productItem.isUnavailable === true ||
        productItem.isUnavailable === "true";

      const available =
        option.available !== false &&
        option.sold_out !== true &&
        performance.isActive !== false &&
        !soldOut &&
        (availableQuantity === null || availableQuantity > 0);

      return {
        ...option,
        provider: "wellet",
        external_product_id: productId,
        external_variant_id: productId,
        external_availability_id:
          performanceId && productId
            ? `${performanceId}:${productId}`
            : productId,
        performance_id: performanceId,
        option_name:
          cleanLiveText(productItem.name) ||
          cleanLiveText(productItem.description) ||
          getLiveOptionLabel(option),
        description: cleanLiveText(productItem.description),
        features: Array.isArray(productItem.features)
          ? productItem.features.map(cleanLiveText).filter(Boolean)
          : [],
        price: price.amount,
        currency: price.currency,
        available,
        available_quantity: availableQuantity,
        sold_out: !available,
        service_date: option.service_date,
        start_time: startTime || option.start_time,
        end_time: endTime || option.end_time,
        checkin_time: checkinTime,
        raw: {
          performance,
          product: productItem,
        },
      };
    });
}

function normalizeLiveTicketOptions(options: LiveTicketOption[]) {
  const flattened = options.flatMap(flattenRawWelletProducts);
  const seen = new Set<string>();

  return flattened.filter((option, index) => {
    const key = getLiveOptionKey(option) || `live-option-${index}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function getProductImage(product: ExperienceProduct) {
  return product.image_url || product.image || product.gallery_images?.find((image) => image.is_cover)?.image_url || "";
}

export default function TicketingSellerNewBookingPage() {
  const params = useParams<{ organisationSlug?: string; slug?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const slug = params.organisationSlug || params.slug || "";
  const productIdFromUrl = searchParams.get("product") || "";

  const [form, setForm] = useState<FormState>({ ...initialForm, productId: productIdFromUrl });
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [pickupSchedules, setPickupSchedules] = useState<ProductPickupSchedule[]>([]);
  const [resolvedPickup, setResolvedPickup] = useState<PickupResolveResponse | null>(null);
  const [resolvingPickup, setResolvingPickup] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [hotelSearch, setHotelSearch] = useState("");
  const [showOptionalCustomer, setShowOptionalCustomer] = useState(false);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [liveAvailability, setLiveAvailability] =
    useState<LiveAvailabilityResponse | null>(null);
  const [loadingLiveAvailability, setLoadingLiveAvailability] = useState(false);
  const [liveAvailabilityError, setLiveAvailabilityError] = useState("");
  const [selectedLiveOptionId, setSelectedLiveOptionId] = useState("");

  async function loadPage() {
    if (!slug) return;

    try {
      setLoading(true);
      setErrorMessage("");

      const [sellerData, productsData, pickupLocationsResponse, pickupSchedulesResponse] = await Promise.all([
        ticketingApi.getSellerMe(slug),
        ticketingApi.getSellerProducts(slug, { is_active: true }),
        ticketingApi.getPickupLocations(slug, { is_active: true }),
        ticketingApi.getPickupSchedules(slug),
      ]);

      const normalizedProductsData = normalizeList<ExperienceProduct>(productsData);
      let publicProductsData: ExperienceProduct[] = [];

      try {
        publicProductsData = await ticketingApi.getPublicProducts(slug, { status: "active" });
      } catch (publicProductError) {
        console.warn("Could not load public product data for pickup schedules:", publicProductError);
      }

      const publicProductById = new Map(publicProductsData.map((product) => [String(product.id), product]));
      const availableProducts = normalizedProductsData
        .filter((product) => product.is_active !== false && product.status !== "archived" && product.seller_enabled !== false)
        .map((product) => {
          const publicProduct = publicProductById.get(String(product.id));
          return publicProduct
            ? {
                ...product,
                pickup_schedules: (publicProduct as any).pickup_schedules,
                availability: (publicProduct as any).availability,
                allow_deposit_payment: publicProduct.allow_deposit_payment,
                allow_full_payment: publicProduct.allow_full_payment,
                allow_pending_payment: publicProduct.allow_pending_payment,
                allow_cash_payment: publicProduct.allow_cash_payment,
              }
            : product;
        });

      setSeller(sellerData);
      setProducts(availableProducts);
      setPickupLocations(normalizeList<PickupLocation>(pickupLocationsResponse).filter((location) => location.is_active !== false));
      setPickupSchedules(normalizeList<ProductPickupSchedule>(pickupSchedulesResponse));

      const initialProductId =
        productIdFromUrl && availableProducts.some((product) => String(product.id) === String(productIdFromUrl))
          ? productIdFromUrl
          : String(availableProducts[0]?.id || "");
      const initialProduct = availableProducts.find((product) => String(product.id) === String(initialProductId));

      setForm((current) => ({
        ...current,
        productId: initialProductId,
        serviceTime: initialProduct?.start_time?.slice(0, 5) || current.serviceTime,
      }));
    } catch (error: any) {
      console.error(error);
      setErrorMessage(getErrorMessage(error, "Could not load seller booking form."));
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [slug, productIdFromUrl]);

  const selectedProduct = useMemo(() => products.find((product) => String(product.id) === String(form.productId)) || null, [products, form.productId]);

  const isLiveCocoBongoProduct = useMemo(
    () => isCocoBongoProduct(selectedProduct),
    [selectedProduct]
  );

  const liveAvailabilityOptions = useMemo(
    () => normalizeLiveTicketOptions(liveAvailability?.options || []),
    [liveAvailability]
  );

  const selectedLiveOption = useMemo(() => {
    if (!selectedLiveOptionId) return null;

    return (
      liveAvailabilityOptions.find(
        (option) => getLiveOptionKey(option) === selectedLiveOptionId
      ) || null
    );
  }, [selectedLiveOptionId, liveAvailabilityOptions]);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveAvailability() {
      if (
        !slug ||
        !selectedProduct ||
        !isLiveCocoBongoProduct ||
        !form.serviceDate
      ) {
        setLiveAvailability(null);
        setSelectedLiveOptionId("");
        setLiveAvailabilityError("");
        setLoadingLiveAvailability(false);
        return;
      }

      try {
        setLoadingLiveAvailability(true);
        setLiveAvailabilityError("");

        const response = await ticketingApi.getPublicProductAvailability(
          slug,
          selectedProduct.slug,
          { date: form.serviceDate }
        );

        if (cancelled) return;

        setLiveAvailability(response);

        const options = normalizeLiveTicketOptions(response.options || []);
        const firstAvailable = options.find(
          (option) =>
            option.available !== false &&
            option.sold_out !== true
        );

        setSelectedLiveOptionId(
          firstAvailable ? getLiveOptionKey(firstAvailable) : ""
        );
      } catch (error: any) {
        if (cancelled) return;

        console.error("Could not load Coco Bongo availability:", error);
        setLiveAvailability(null);
        setSelectedLiveOptionId("");
        setLiveAvailabilityError(
          getErrorMessage(
            error,
            "Coco Bongo availability is not available for this date."
          )
        );
      } finally {
        if (!cancelled) {
          setLoadingLiveAvailability(false);
        }
      }
    }

    loadLiveAvailability();

    return () => {
      cancelled = true;
    };
  }, [
    slug,
    selectedProduct?.id,
    selectedProduct?.slug,
    isLiveCocoBongoProduct,
    form.serviceDate,
  ]);

  const selectedPickupLocation = useMemo(
    () => pickupLocations.find((location) => String(location.id) === String(form.pickupLocationId)) || null,
    [pickupLocations, form.pickupLocationId]
  );

  const selectedProductSchedules = useMemo(() => {
    const schedulesFromProduct = getProductPickupSchedules(selectedProduct);
    return schedulesFromProduct.length ? schedulesFromProduct : getProductSchedules(pickupSchedules, form.productId);
  }, [selectedProduct, pickupSchedules, form.productId]);

  const visiblePickupLocations = useMemo(() => getVisiblePickupLocationsForProduct(selectedProduct, pickupLocations, pickupSchedules), [selectedProduct, pickupLocations, pickupSchedules]);

  const assignedPickupSchedule = useMemo(
    () => findSchedule(pickupSchedules, form.productId, form.pickupLocationId, form.serviceDate),
    [pickupSchedules, form.productId, form.pickupLocationId, form.serviceDate]
  );

  const requiresPickup = Boolean(selectedProduct?.supports_pickup) || Boolean(selectedProduct?.requires_pickup_location) || selectedProductSchedules.length > 0;

  useEffect(() => {
    async function resolvePickup() {
      if (!slug || !selectedProduct || !form.serviceDate || !form.pickupLocationId) {
        setResolvedPickup(null);
        return;
      }

      try {
        setResolvingPickup(true);
        let response: PickupResolveResponse;

        try {
          response = await ticketingApi.resolvePublicPickupSchedule(slug, selectedProduct.id, Number(form.pickupLocationId), form.serviceDate);
        } catch {
          response = await ticketingApi.resolvePickupSchedule(slug, selectedProduct.id, Number(form.pickupLocationId), form.serviceDate);
        }

        setResolvedPickup(response);

        if (response.found && response.schedule) {
          setForm((current) => ({
            ...current,
            customerHotel: selectedPickupLocation?.name || current.customerHotel,
            serviceTime: current.serviceTime || selectedProduct.start_time?.slice(0, 5) || "",
          }));
        }
      } catch (error) {
        console.warn("Could not resolve pickup schedule:", error);
        setResolvedPickup({ found: false, message: "Pickup time is not available yet for this product, date and hotel/location." });
      } finally {
        setResolvingPickup(false);
      }
    }

    resolvePickup();
  }, [slug, selectedProduct?.id, form.serviceDate, form.pickupLocationId, selectedPickupLocation?.name]);

  useEffect(() => {
    if (!form.pickupLocationId) return;
    const stillVisible = visiblePickupLocations.some((location) => String(location.id) === String(form.pickupLocationId));
    if (!stillVisible) {
      setForm((current) => ({ ...current, pickupLocationId: "", customerHotel: "" }));
      setResolvedPickup(null);
    }
  }, [visiblePickupLocations, form.pickupLocationId]);

  const liveTicketQuantity = Math.max(1, getTotalGuests(form));
  const unitPrice = isLiveCocoBongoProduct
    ? getLiveOptionPrice(selectedLiveOption)
    : numberValue(selectedProduct?.base_price);
  const subtotal =
    unitPrice *
    (isLiveCocoBongoProduct
      ? liveTicketQuantity
      : getChargeableGuests(form));
  const discountAmount = seller?.can_apply_discounts ? numberValue(form.discountAmount) : 0;
  const taxAmount = 0;
  const totalAmount = Math.max(subtotal - discountAmount + taxAmount, 0);
  const depositRequired = calculateDepositRequired(selectedProduct, subtotal);
  const paymentPayload = getPaymentPayload(form.paymentAction, totalAmount, depositRequired, form.paymentReference, form.paymentNote);
  const paymentNow = paymentPayload ? numberValue(paymentPayload.amount) : 0;
  const balanceDue = Math.max(totalAmount - paymentNow, 0);
  const allowedPaymentActions = getAllowedPaymentActions(seller);
  const selectedAction = allowedPaymentActions.find((action) => action.value === form.paymentAction);

  const pickupTime = resolvedPickup?.found && resolvedPickup.schedule ? resolvedPickup.schedule.pickup_time : assignedPickupSchedule?.pickup_time || null;
  const pickupPoint =
    resolvedPickup?.found && resolvedPickup.schedule
      ? resolvedPickup.schedule.resolved_pickup_point || resolvedPickup.schedule.pickup_point || selectedPickupLocation?.default_pickup_point || "Lobby"
      : assignedPickupSchedule?.resolved_pickup_point || assignedPickupSchedule?.pickup_point || selectedPickupLocation?.default_pickup_point || "Lobby";

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => [product.name, product.product_type, product.location].join(" ").toLowerCase().includes(query));
  }, [products, productSearch]);

  const filteredPickupLocations = useMemo(() => {
    const query = hotelSearch.trim().toLowerCase();
    if (!query) return visiblePickupLocations;
    return visiblePickupLocations.filter((location) => [location.name, location.zone_name, location.address].join(" ").toLowerCase().includes(query));
  }, [visiblePickupLocations, hotelSearch]);

  function updateForm<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function selectProduct(productId: string) {
    const product = products.find((item) => String(item.id) === productId);
    setResolvedPickup(null);
    setLiveAvailability(null);
    setSelectedLiveOptionId("");
    setLiveAvailabilityError("");
    setForm((current) => ({
      ...current,
      productId,
      serviceTime: product?.start_time?.slice(0, 5) || "",
      pickupLocationId: "",
      customerHotel: "",
    }));
  }

  function selectPickupLocation(locationId: string) {
    const location = visiblePickupLocations.find((item) => String(item.id) === locationId);
    setResolvedPickup(null);
    setForm((current) => ({ ...current, pickupLocationId: locationId, customerHotel: location?.name || "" }));
  }

  function selectPaymentAction(action: SellerPaymentAction) {
    setForm((current) => ({
      ...current,
      paymentAction: action,
      receiptSentBeforeFullPayment:
        action === "generate_ticket" && seller?.can_send_receipt_before_full_payment
          ? current.receiptSentBeforeFullPayment
          : current.receiptSentBeforeFullPayment,
    }));
  }

  function changeGuest(field: "adults" | "children" | "infants", delta: number) {
    setForm((current) => ({ ...current, [field]: Math.max(field === "adults" ? 1 : 0, Number(current[field] || 0) + delta) }));
  }

  async function saveBooking() {
    if (!seller) return setErrorMessage("No active seller profile was found for this user.");
    if (!seller.can_create_bookings) return setErrorMessage("You do not have permission to create bookings.");
    if (!selectedProduct) return setErrorMessage("Select a tour before creating the booking.");
    if (!form.serviceDate) return setErrorMessage("Service date is required.");
    if (!form.customerName.trim()) return setErrorMessage("Customer name is required.");
    if (form.customerEmail.trim() && !isValidEmail(form.customerEmail)) return setErrorMessage("Customer email is optional, but if entered it must be valid.");
    if (requiresPickup && !form.pickupLocationId) return setErrorMessage("This product requires a hotel or pickup location.");
    if (requiresPickup && form.pickupLocationId && !resolvedPickup?.found && !assignedPickupSchedule && selectedProduct.requires_pickup_location) {
      return setErrorMessage("No pickup schedule was found for this product, date and pickup location.");
    }
    if (isLiveCocoBongoProduct && loadingLiveAvailability) {
      return setErrorMessage("Please wait while Coco Bongo availability is checked.");
    }
    if (isLiveCocoBongoProduct && liveAvailabilityError) {
      return setErrorMessage(liveAvailabilityError);
    }
    if (isLiveCocoBongoProduct && !selectedLiveOption) {
      return setErrorMessage("Select an available Coco Bongo ticket option.");
    }
    if (
      selectedLiveOption &&
      (selectedLiveOption.available === false ||
        selectedLiveOption.sold_out === true)
    ) {
      return setErrorMessage("The selected Coco Bongo option is sold out.");
    }
    if (!selectedAction) return setErrorMessage("Select an allowed payment option before creating the booking.");

    try {
      setSaving(true);
      setErrorMessage("");
      setSuccessMessage("");

      const paymentMode = getPaymentMode(form.paymentAction);
      const paymentMethod = getPaymentMethod(form.paymentAction);

      const liveOptionInstructions = selectedLiveOption
        ? [
            `Ticket option: ${getLiveOptionLabel(selectedLiveOption)}`,
            selectedLiveOption.description
              ? `Description: ${selectedLiveOption.description}`
              : "",
            selectedLiveOption.features?.length
              ? `Includes: ${selectedLiveOption.features.join(", ")}`
              : "",
            selectedLiveOption.checkin_time
              ? `Check-in time: ${selectedLiveOption.checkin_time}`
              : "",
            selectedLiveOption.start_time
              ? `Show time: ${selectedLiveOption.start_time}`
              : "",
            selectedLiveOption.performance_id
              ? `Performance ID: ${selectedLiveOption.performance_id}`
              : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "";

      const itemPayload: any = {
        product_id: selectedProduct.id,
        product_name: selectedLiveOption
          ? getLiveOptionLabel(selectedLiveOption)
          : selectedProduct.name,
        service_date: form.serviceDate,
        // Coco Bongo/Wellet show times are external metadata, not Django TimeField values.
        service_time: isLiveCocoBongoProduct
          ? null
          : form.serviceTime || selectedProduct.start_time || null,
        quantity: isLiveCocoBongoProduct
          ? liveTicketQuantity
          : getChargeableGuests(form),
        unit_price: moneyString(unitPrice),
        unit_cost: selectedProduct.cost_price || "0.00",
        instructions: [form.customerNotes.trim(), liveOptionInstructions]
          .filter(Boolean)
          .join("\n"),
      };

      if (selectedLiveOption) {
        itemPayload.selected_external_product_id =
          getLiveOptionKey(selectedLiveOption);
        itemPayload.external_provider =
          selectedLiveOption.provider || "wellet";
        itemPayload.external_product_id =
          selectedLiveOption.external_product_id || "";
        itemPayload.external_variant_id =
          selectedLiveOption.external_variant_id || "";
        itemPayload.external_availability_id =
          selectedLiveOption.external_availability_id || "";
        itemPayload.external_option_name =
          getLiveOptionLabel(selectedLiveOption);
        itemPayload.external_start_time =
          selectedLiveOption.start_time || "";
        itemPayload.external_end_time =
          selectedLiveOption.end_time || "";
        itemPayload.external_checkin_time =
          selectedLiveOption.checkin_time || "";
        itemPayload.external_performance_id =
          selectedLiveOption.performance_id || "";
      }

      const payload: BookingCreatePayload = {
        primary_product: selectedProduct.id,
        source: "seller_dashboard",
        status: form.paymentAction === "requires_supervisor_approval" ? "pending_approval" : "pending_payment",
        payment_status: paymentPayload ? "pending" : "unpaid",
        payment_mode: paymentMode,
        payment_method: paymentMethod,
        service_date: form.serviceDate,
        service_time: isLiveCocoBongoProduct
          ? null
          : form.serviceTime || selectedProduct.start_time || null,
        customer_name: form.customerName.trim(),
        customer_whatsapp: form.customerWhatsapp.trim() || null,
        customer_email: form.customerEmail.trim() || null,
        customer_hotel: form.customerHotel.trim() || selectedPickupLocation?.name || "",
        customer_notes: form.customerNotes.trim(),
        adults: Number(form.adults || 0),
        children: Number(form.children || 0),
        infants: Number(form.infants || 0),
        subtotal_amount: moneyString(subtotal),
        discount_amount: moneyString(discountAmount),
        tax_amount: moneyString(taxAmount),
        total_amount: moneyString(totalAmount),
        deposit_required: moneyString(depositRequired),
        deposit_paid: "0.00",
        balance_due: moneyString(totalAmount),
        requires_supervisor_approval: form.paymentAction === "requires_supervisor_approval",
        receipt_sent_before_full_payment: seller.can_send_receipt_before_full_payment && form.receiptSentBeforeFullPayment,
        pickup_location_id: form.pickupLocationId ? Number(form.pickupLocationId) : null,
        items_payload: [itemPayload],
        payments_payload: paymentPayload ? [paymentPayload] : [],
      };

      let booking = await ticketingApi.createSellerBooking(payload, slug);

      if (form.paymentAction === "generate_ticket") {
        booking = await ticketingApi.markSellerTicketGenerated(booking.id, slug);
      }
      setCreatedBooking(booking);
      setSuccessMessage(`Booking created${booking.booking_code ? `: ${booking.booking_code}` : ""}.`);
    } catch (error: any) {
      console.error(error);
      setErrorMessage(getErrorMessage(error, "Could not create seller booking."));
    } finally {
      setSaving(false);
    }
  }

  function resetForAnotherBooking() {
    setCreatedBooking(null);
    setSuccessMessage("");
    setErrorMessage("");
    setResolvedPickup(null);
    setHotelSearch("");
    setShowOptionalCustomer(false);
    setShowPaymentDetails(false);
    setForm((current) => ({
      ...initialForm,
      productId: current.productId,
      serviceDate: current.serviceDate,
      serviceTime: selectedProduct?.start_time?.slice(0, 5) || "",
      paymentAction: allowedPaymentActions[0]?.value || "pending_payment",
    }));
  }

  useEffect(() => {
    if (!allowedPaymentActions.length) return;
    if (!allowedPaymentActions.some((action) => action.value === form.paymentAction)) {
      updateForm("paymentAction", allowedPaymentActions[0].value);
    }
  }, [allowedPaymentActions.length, form.paymentAction]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm font-black text-slate-500 shadow-sm">
        Loading seller checkout...
      </div>
    );
  }

  if (createdBooking) {
    return (
      <div className="mx-auto max-w-3xl space-y-5 pb-24">
        <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white">
            <CheckCircle2 className="h-9 w-9" />
          </div>
          <p className="mt-4 text-sm font-black uppercase tracking-wide text-emerald-700">Booking created</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">{createdBooking.booking_code || "New booking"}</h1>
          <p className="mt-2 text-sm font-bold text-emerald-700">{successMessage}</p>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="space-y-3">
            <SummaryLine label="Customer" value={createdBooking.customer_name || form.customerName} />
            <SummaryLine label="Tour" value={selectedProduct?.name || createdBooking.primary_product_detail?.name || "—"} />
            <SummaryLine label="Hotel" value={createdBooking.customer_hotel || selectedPickupLocation?.name || "—"} />
            <SummaryLine label="Today paid" value={formatMoney(paymentNow)} strong />
            <SummaryLine label="Balance" value={formatMoney(balanceDue)} strong />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={resetForAnotherBooking} className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white">
              Create another
            </button>
            <button type="button" onClick={() => navigate(`/ticketing/${slug}/seller/bookings`)} className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700">
              View bookings
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col justify-between gap-4 rounded-[2rem] bg-slate-950 p-6 text-white shadow-sm lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-amber-300">Seller POS</p>
          <h1 className="mt-2 text-3xl font-black">New booking</h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">Fast checkout for sellers. Select tour, date, hotel, customer, payment.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/10">{seller?.full_name || "Seller"}</div>
          <Link to={`/ticketing/${slug}/seller/products`} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4" />
            Products
          </Link>
        </div>
      </div>

      {errorMessage && <AlertBox tone="red" icon={<AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />}>{errorMessage}</AlertBox>}
      {seller && !seller.can_create_bookings && <AlertBox tone="red" icon={<AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />}>Your seller account cannot create bookings.</AlertBox>}

      <section className="grid gap-5 xl:grid-cols-[1fr_390px]">
        <div className="space-y-5">
          <Panel eyebrow="Step 1" title="Choose tour" icon={<Ticket className="h-5 w-5" />}>
            <SearchInput value={productSearch} onChange={setProductSearch} placeholder="Search tour..." />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((product) => {
                const selected = String(product.id) === String(form.productId);
                const image = getProductImage(product);
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => selectProduct(String(product.id))}
                    className={[
                      "overflow-hidden rounded-[1.6rem] border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                      selected ? "border-amber-400 ring-4 ring-amber-100" : "border-slate-200",
                    ].join(" ")}
                  >
                    <div className="relative h-36 bg-slate-100">
                      {image ? <img src={image} alt={product.image_alt_text || product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><Ticket className="h-10 w-10" /></div>}
                      {selected && <span className="absolute right-3 top-3 rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-slate-950">Selected</span>}
                    </div>
                    <div className="p-4">
                      <p className="line-clamp-2 min-h-10 text-sm font-black text-slate-950">{product.name}</p>
                      <p className="mt-2 text-lg font-black text-slate-950">{formatMoney(product.base_price)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel eyebrow="Step 2" title="Choose date" icon={<CalendarDays className="h-5 w-5" />}>
            <Input label="Service date" type="date" value={form.serviceDate} onChange={(value) => updateForm("serviceDate", value)} required />

            {isLiveCocoBongoProduct && (
              <div className="mt-5 rounded-[1.6rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                    <Ticket className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-950">
                      Live Coco Bongo availability
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                      Select a date to load the live ticket products and prices.
                    </p>
                  </div>
                </div>

                {!form.serviceDate ? (
                  <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-bold text-slate-500">
                    Choose the service date first.
                  </p>
                ) : loadingLiveAvailability ? (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-4 text-sm font-bold text-slate-600">
                    <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
                    Checking live ticket availability...
                  </div>
                ) : liveAvailabilityError ? (
                  <AlertBox
                    tone="red"
                    icon={<AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />}
                  >
                    {liveAvailabilityError}
                  </AlertBox>
                ) : liveAvailabilityOptions.length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
                    No Coco Bongo ticket options are available for this date.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {liveAvailabilityOptions.map((option) => {
                      const optionKey = getLiveOptionKey(option);
                      const selected = optionKey === selectedLiveOptionId;
                      const unavailable =
                        option.available === false || option.sold_out === true;

                      return (
                        <button
                          key={optionKey}
                          type="button"
                          disabled={unavailable}
                          onClick={() => setSelectedLiveOptionId(optionKey)}
                          className={[
                            "w-full rounded-2xl border p-4 text-left transition",
                            selected
                              ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100"
                              : "border-slate-200 bg-white hover:border-violet-300",
                            unavailable
                              ? "cursor-not-allowed opacity-55"
                              : "",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-black text-slate-950">
                                {getLiveOptionLabel(option)}
                              </p>

                              {option.description && (
                                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                  {option.description}
                                </p>
                              )}

                              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                                {option.start_time && (
                                  <span className="rounded-full bg-slate-100 px-2.5 py-1">
                                    Show {formatTime(option.start_time)}
                                  </span>
                                )}
                                {option.available_quantity !== null &&
                                  option.available_quantity !== undefined && (
                                    <span className="rounded-full bg-slate-100 px-2.5 py-1">
                                      {option.available_quantity} available
                                    </span>
                                  )}
                                {unavailable && (
                                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-700">
                                    Sold out
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-lg font-black text-slate-950">
                                {formatMoney(option.price)}
                              </p>
                              {selected && (
                                <CheckCircle2 className="ml-auto mt-2 h-5 w-5 text-violet-600" />
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Panel>

          <Panel eyebrow="Step 3" title="Choose hotel" icon={<Hotel className="h-5 w-5" />}>
            {requiresPickup ? (
              <>
                <SearchInput value={hotelSearch} onChange={setHotelSearch} placeholder="Search hotel or pickup point..." />
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {filteredPickupLocations.map((location) => {
                    const selected = String(location.id) === String(form.pickupLocationId);
                    return (
                      <button
                        key={location.id}
                        type="button"
                        onClick={() => selectPickupLocation(String(location.id))}
                        className={[
                          "flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition",
                          selected ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <span>
                          <span className="block text-sm font-black text-slate-950">{location.name}</span>
                          <span className="mt-1 block text-xs font-bold text-slate-500">{location.zone_name || location.default_pickup_point || "Pickup location"}</span>
                        </span>
                        {selected && <CheckCircle2 className="h-5 w-5 text-amber-600" />}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  {resolvingPickup ? (
                    <div className="flex items-center gap-3 text-sm font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Finding pickup...</div>
                  ) : selectedPickupLocation && (resolvedPickup?.found || assignedPickupSchedule) ? (
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-600" />
                      <div>
                        <p className="text-sm font-black text-slate-950">Pickup assigned</p>
                        <p className="mt-1 text-lg font-black text-slate-950">{formatTime(pickupTime)}</p>
                        <p className="mt-1 text-sm font-bold text-slate-600">{selectedPickupLocation.name} · {pickupPoint}</p>
                      </div>
                    </div>
                  ) : form.pickupLocationId && form.serviceDate ? (
                    <div className="flex items-start gap-3 text-amber-700"><AlertCircle className="mt-1 h-5 w-5 shrink-0" /><p className="text-sm font-bold">{resolvedPickup?.message || "No pickup schedule found for this product, date and location."}</p></div>
                  ) : (
                    <p className="text-sm font-bold text-slate-500">Select the date and hotel. Pickup time appears automatically.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">This tour does not require pickup.</div>
            )}
          </Panel>

          <Panel eyebrow="Step 4" title="Customer" icon={<UserRound className="h-5 w-5" />}>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Customer name" value={form.customerName} onChange={(value) => updateForm("customerName", value)} required />
              <Input label="WhatsApp" value={form.customerWhatsapp} onChange={(value) => updateForm("customerWhatsapp", value)} placeholder="+1 809 000 0000" />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <GuestCounter label="Adults" value={form.adults} onMinus={() => changeGuest("adults", -1)} onPlus={() => changeGuest("adults", 1)} />
              <GuestCounter label="Children" value={form.children} onMinus={() => changeGuest("children", -1)} onPlus={() => changeGuest("children", 1)} />
              <GuestCounter label="Infants" value={form.infants} onMinus={() => changeGuest("infants", -1)} onPlus={() => changeGuest("infants", 1)} />
            </div>

            <button type="button" onClick={() => setShowOptionalCustomer((current) => !current)} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700">
              <ChevronDown className={["h-4 w-4 transition", showOptionalCustomer ? "rotate-180" : ""].join(" ")} />
              Add email / notes
            </button>

            {showOptionalCustomer && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input label="Email" type="email" value={form.customerEmail} onChange={(value) => updateForm("customerEmail", value)} placeholder="customer@email.com" />
                {seller?.can_apply_discounts && <Input label="Discount" type="number" value={form.discountAmount} onChange={(value) => updateForm("discountAmount", value)} />}
                <div className="md:col-span-2"><Textarea label="Notes" value={form.customerNotes} onChange={(value) => updateForm("customerNotes", value)} placeholder="Room number, allergies, special requests..." /></div>
              </div>
            )}
          </Panel>

          <Panel eyebrow="Step 5" title="Payment" icon={<CreditCard className="h-5 w-5" />}>
            {allowedPaymentActions.length === 0 ? (
              <AlertBox tone="amber" icon={<AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />}>No payment actions are enabled for your seller account.</AlertBox>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {allowedPaymentActions.map((action) => (
                  <button
                    key={action.value}
                    type="button"
                    onClick={() => selectPaymentAction(action.value)}
                    className={[
                      "flex items-center gap-3 rounded-[1.4rem] border p-4 text-left transition",
                      form.paymentAction === action.value ? "border-amber-400 bg-amber-50 ring-2 ring-amber-100" : "border-slate-200 bg-white hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">{action.icon}</span>
                    <span className="text-sm font-black text-slate-950">{action.label}</span>
                  </button>
                ))}
              </div>
            )}

            {paymentPayload && (
              <>
                <button type="button" onClick={() => setShowPaymentDetails((current) => !current)} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700">
                  <ChevronDown className={["h-4 w-4 transition", showPaymentDetails ? "rotate-180" : ""].join(" ")} />
                  Add payment reference
                </button>
                {showPaymentDetails && (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Input label="Payment reference" value={form.paymentReference} onChange={(value) => updateForm("paymentReference", value)} placeholder="Receipt, transfer or note" />
                    <Input label="Payment note" value={form.paymentNote} onChange={(value) => updateForm("paymentNote", value)} placeholder="Optional payment note" />
                  </div>
                )}
              </>
            )}

            {seller?.can_send_receipt_before_full_payment && (
              <label className="mt-4 flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span><span className="block text-sm font-black text-slate-800">Send receipt before full payment</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">Use only when allowed for this seller.</span></span>
                <input type="checkbox" checked={form.receiptSentBeforeFullPayment} onChange={(event) => updateForm("receiptSentBeforeFullPayment", event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-amber-500" />
              </label>
            )}
          </Panel>
        </div>

        <aside className="space-y-5">
          <section className="sticky top-6 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white"><ReceiptText className="h-6 w-6" /></div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Booking summary</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{selectedProduct?.name || "Choose tour"}</h2>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] bg-slate-50 p-4">
              <SummaryLine label="Date" value={form.serviceDate || "—"} />
              {isLiveCocoBongoProduct && (
                <SummaryLine
                  label="Ticket option"
                  value={
                    selectedLiveOption
                      ? getLiveOptionLabel(selectedLiveOption)
                      : "Select availability"
                  }
                />
              )}
              <SummaryLine
                label="Guests"
                value={
                  isLiveCocoBongoProduct
                    ? `${getTotalGuests(form)} ticket${getTotalGuests(form) === 1 ? "" : "s"}`
                    : `${getTotalGuests(form)} total · ${getChargeableGuests(form)} charged`
                }
              />
              <SummaryLine label="Hotel" value={selectedPickupLocation?.name || "—"} />
              <SummaryLine label="Pickup" value={pickupTime ? `${formatTime(pickupTime)} · ${pickupPoint}` : "—"} />
            </div>

            <div className="mt-5 space-y-3">
              <SummaryLine label="Subtotal" value={formatMoney(subtotal)} />
              {seller?.can_apply_discounts && discountAmount > 0 && <SummaryLine label="Discount" value={`-${formatMoney(discountAmount)}`} />}
              <BigMoney label="Total" value={formatMoney(totalAmount)} />
              <BigMoney label="Today" value={paymentPayload ? formatMoney(paymentPayload.amount) : "No payment"} />
              <BigMoney label="Balance" value={formatMoney(balanceDue)} muted />
            </div>

            <button
              type="button"
              onClick={saveBooking}
              disabled={
                saving ||
                !seller?.can_create_bookings ||
                (isLiveCocoBongoProduct &&
                  (loadingLiveAvailability || !selectedLiveOption))
              }
              className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Create booking
            </button>

            <Link to={`/ticketing/${slug}/seller/bookings`} className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50">
              Back to bookings
            </Link>
          </section>
        </aside>
      </section>
    </div>
  );
}

function Panel({ eyebrow, title, icon, children }: { eyebrow: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">{icon}</div>
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-amber-600">{eyebrow}</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{title}</h2>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold outline-none transition focus:border-amber-400 focus:bg-white" />
    </label>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}{required && <span className="text-red-500"> *</span>}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-amber-400 focus:bg-white" />
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-amber-400 focus:bg-white" />
    </label>
  );
}

function GuestCounter({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-sm font-black text-slate-700"><Users className="h-4 w-4" />{label}</div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <button type="button" onClick={onMinus} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700"><Minus className="h-4 w-4" /></button>
        <span className="text-2xl font-black text-slate-950">{value}</span>
        <button type="button" onClick={onPlus} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-white"><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 first:pt-0 last:border-b-0 last:pb-0">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span className={["max-w-48 truncate text-right text-sm", strong ? "font-black text-slate-950" : "font-bold text-slate-700"].join(" ")}>{value}</span>
    </div>
  );
}

function BigMoney({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-black uppercase tracking-wide text-slate-500">{label}</span>
      <span className={["text-xl font-black", muted ? "text-slate-600" : "text-slate-950"].join(" ")}>{value}</span>
    </div>
  );
}

function AlertBox({ tone, icon, children }: { tone: "red" | "amber"; icon: ReactNode; children: ReactNode }) {
  const classes = tone === "red" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800";
  return <div className={["flex items-start gap-3 rounded-3xl border p-4 text-sm font-bold", classes].join(" ")}>{icon}{children}</div>;
}
