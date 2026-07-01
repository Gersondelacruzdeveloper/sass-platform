// src/modules/ticketing/pages/TicketingNewBookingPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  DollarSign,
  ExternalLink,
  Hotel,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Ticket,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

import api from "../../../api/axios";
import TicketingPageShell from "../components/TicketingPageShell";

type PaymentMode =
  | "customer_full_online"
  | "customer_deposit_online"
  | "customer_cash_to_seller"
  | "seller_full_payment"
  | "seller_deposit_payment"
  | "seller_commission_only"
  | "pending_payment"
  | "requires_supervisor_approval"
  | "manual_bank_transfer"
  | "mixed_payment";

type PaymentMethod =
  | "cash"
  | "card"
  | "online"
  | "bank_transfer"
  | "seller_collected"
  | "mixed"
  | "none";

type PaymentPayloadMethod =
  | "cash"
  | "card"
  | "online"
  | "bank_transfer"
  | "seller_balance"
  | "other";

type ProductType =
  | "excursion"
  | "transfer"
  | "ticket"
  | "event"
  | "nightlife"
  | "custom"
  | string;

type ExperienceProduct = {
  id: number;
  name: string;
  slug: string;
  product_type: ProductType;
  status?: string;
  is_active?: boolean;
  public_enabled?: boolean;
  seller_enabled?: boolean;

  short_description?: string | null;
  long_description?: string | null;
  description?: string | null;

  base_price?: string | number;
  cost_price?: string | number;
  deposit_amount?: string | number;
  deposit_percentage?: string | number;

  capacity?: number | string | null;
  max_capacity?: number | string | null;

  duration_text?: string | null;
  duration_minutes?: number | string | null;
  start_time?: string | null;
  end_time?: string | null;

  location?: string | null;
  location_name?: string | null;
  address?: string | null;
  meeting_point?: string | null;

  supports_pickup?: boolean;
  requires_pickup_location?: boolean;

  allow_full_payment?: boolean;
  allow_deposit_payment?: boolean;
  allow_pending_payment?: boolean;
  allow_cash_payment?: boolean;

  image_url?: string | null;
  image?: string | null;
};

type Seller = {
  id: number;
  full_name: string;
  seller_slug?: string;
  role?: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  commission_rate?: string | number;
  fixed_commission_amount?: string | number;
  can_take_deposits?: boolean;
  can_take_full_payments?: boolean;
  can_collect_cash_payment?: boolean;
  can_generate_ticket_without_customer_online_payment?: boolean;
  can_create_pending_payment_booking?: boolean;
  can_pay_full_amount_as_seller?: boolean;
  can_pay_deposit_as_seller?: boolean;
  can_pay_commission_only?: boolean;
  is_active?: boolean;
};

type PickupLocation = {
  id: number;
  name: string;
  slug?: string;
  zone?: number | null;
  zone_name?: string;
  location_type?: string;
  address?: string;
  default_pickup_point?: string;
  default_instructions?: string;
  is_active?: boolean;
};

type PickupSchedule = {
  id: number;
  product: number;
  product_name?: string;
  pickup_location: number;
  pickup_location_name?: string;
  day_of_week?: number | null;
  specific_date?: string | null;
  pickup_time?: string | null;
  pickup_point?: string;
  resolved_pickup_point?: string;
  instructions?: string;
  is_active?: boolean;
};

type Booking = {
  id: number;
  booking_code?: string;
  status?: string;
  payment_status?: string;
  total_amount?: string | number;
  deposit_paid?: string | number;
  balance_due?: string | number;
};

type FormState = {
  productId: string;
  sellerId: string;
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

  unitPrice: string;
  discountAmount: string;
  taxAmount: string;
  depositRequired: string;

  paymentMode: PaymentMode;
  paymentMethod: PaymentMethod;
  recordPayment: boolean;
  paymentAmount: string;
  paymentReference: string;
  paymentNote: string;
  paymentStatus: "confirmed" | "pending";

  transferOrigin: string;
  transferDestination: string;
  transferAirport: string;
  transferFlightNumber: string;
  transferVehicleType: string;
  transferRoundTrip: boolean;
  transferReturnDate: string;
  transferReturnTime: string;

  requiresSupervisorApproval: boolean;
  receiptSentBeforeFullPayment: boolean;
};

const initialForm: FormState = {
  productId: "",
  sellerId: "",
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

  unitPrice: "0.00",
  discountAmount: "0.00",
  taxAmount: "0.00",
  depositRequired: "0.00",

  paymentMode: "pending_payment",
  paymentMethod: "none",
  recordPayment: false,
  paymentAmount: "0.00",
  paymentReference: "",
  paymentNote: "",
  paymentStatus: "confirmed",

  transferOrigin: "",
  transferDestination: "",
  transferAirport: "",
  transferFlightNumber: "",
  transferVehicleType: "",
  transferRoundTrip: false,
  transferReturnDate: "",
  transferReturnTime: "",

  requiresSupervisorApproval: false,
  receiptSentBeforeFullPayment: false,
};

const paymentModeOptions: Array<{
  value: PaymentMode;
  label: string;
  helper: string;
  method: PaymentMethod;
}> = [
  {
    value: "pending_payment",
    label: "Pending payment",
    helper: "Create the booking without recording a payment.",
    method: "none",
  },
  {
    value: "customer_full_online",
    label: "Customer paid full online",
    helper: "Record the full amount as an online customer payment.",
    method: "online",
  },
  {
    value: "customer_deposit_online",
    label: "Customer paid deposit online",
    helper: "Record only the deposit as an online customer payment.",
    method: "online",
  },
  {
    value: "customer_cash_to_seller",
    label: "Customer paid cash to seller",
    helper: "Record cash collected by the selected seller.",
    method: "seller_collected",
  },
  {
    value: "seller_full_payment",
    label: "Seller paid full amount",
    helper: "Seller pays the company the full booking amount.",
    method: "seller_collected",
  },
  {
    value: "seller_deposit_payment",
    label: "Seller paid deposit",
    helper: "Seller pays only the required deposit.",
    method: "seller_collected",
  },
  {
    value: "seller_commission_only",
    label: "Seller commission only",
    helper: "Create a seller booking without customer online payment.",
    method: "none",
  },
  {
    value: "manual_bank_transfer",
    label: "Manual bank transfer",
    helper: "Record a bank transfer manually.",
    method: "bank_transfer",
  },
  {
    value: "mixed_payment",
    label: "Mixed payment",
    helper: "Record a custom amount for mixed payment scenarios.",
    method: "mixed",
  },
  {
    value: "requires_supervisor_approval",
    label: "Requires supervisor approval",
    helper: "Create the booking as pending approval.",
    method: "none",
  },
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

function formatTime(value?: string | null) {
  if (!value) return "—";

  const time = value.includes("T")
    ? value.split("T")[1]?.slice(0, 5)
    : value.slice(0, 5);

  const [hoursRaw, minutesRaw] = time.split(":");
  const hours = Number(hoursRaw);

  if (Number.isNaN(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${minutesRaw || "00"} ${suffix}`;
}

function statusLabel(value?: string | null) {
  if (!value) return "Unknown";

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isValidEmail(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function getProductLocation(product?: ExperienceProduct | null) {
  return product?.location || product?.location_name || product?.address || "No location";
}

function getProductCapacity(product?: ExperienceProduct | null) {
  return product?.capacity || product?.max_capacity || "—";
}

function getProductDuration(product?: ExperienceProduct | null) {
  if (!product) return "—";

  if (product.duration_text) return product.duration_text;

  const minutes = Number(product.duration_minutes || 0);

  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function getTotalGuests(form: FormState) {
  return Math.max(0, Number(form.adults || 0)) +
    Math.max(0, Number(form.children || 0)) +
    Math.max(0, Number(form.infants || 0));
}

function getChargeableGuests(form: FormState) {
  return Math.max(1, Number(form.adults || 0) + Number(form.children || 0));
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

function findSchedule(
  schedules: PickupSchedule[],
  productId: string,
  pickupLocationId: string,
  serviceDate: string
) {
  if (!productId || !pickupLocationId || !serviceDate) return null;

  const weekday = getPythonWeekday(serviceDate);

  const matching = schedules.filter((schedule) => {
    if (!schedule.is_active) return false;
    if (String(schedule.product) !== String(productId)) return false;
    if (String(schedule.pickup_location) !== String(pickupLocationId)) return false;

    return true;
  });

  const exactDate = matching.find(
    (schedule) => schedule.specific_date === serviceDate
  );

  if (exactDate) return exactDate;

  const daySchedule = matching.find(
    (schedule) =>
      schedule.specific_date == null &&
      schedule.day_of_week != null &&
      Number(schedule.day_of_week) === weekday
  );

  if (daySchedule) return daySchedule;

  return (
    matching.find(
      (schedule) => schedule.specific_date == null && schedule.day_of_week == null
    ) || null
  );
}

function paymentPayloadMethod(method: PaymentMethod): PaymentPayloadMethod {
  if (method === "seller_collected") return "cash";
  if (method === "mixed") return "other";
  if (method === "none") return "other";

  return method;
}

function getPaymentType(form: FormState, totalAmount: number, depositRequired: number) {
  const amount = numberValue(form.paymentAmount);

  if (form.paymentMode === "seller_commission_only") return "commission_only";
  if (amount >= totalAmount && totalAmount > 0) return "full";
  if (
    ["customer_deposit_online", "seller_deposit_payment"].includes(form.paymentMode) ||
    (depositRequired > 0 && amount >= depositRequired && amount < totalAmount)
  ) {
    return "deposit";
  }

  return "partial";
}

function shouldAttachSellerToPayment(paymentMode: PaymentMode) {
  return [
    "customer_cash_to_seller",
    "seller_full_payment",
    "seller_deposit_payment",
    "seller_commission_only",
  ].includes(paymentMode);
}

export default function TicketingNewBookingPage() {
  const params = useParams();
  const navigate = useNavigate();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [form, setForm] = useState<FormState>(initialForm);
  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [pickupSchedules, setPickupSchedules] = useState<PickupSchedule[]>([]);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);

  const [productSearch, setProductSearch] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  async function loadPage() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const [
        productsResponse,
        sellersResponse,
        pickupLocationsResponse,
        pickupSchedulesResponse,
      ] = await Promise.all([
        api.get("/ticketing/products/", { params: requestParams }),
        api.get("/ticketing/sellers/", { params: requestParams }),
        api.get("/ticketing/pickup-locations/", { params: requestParams }),
        api.get("/ticketing/pickup-schedules/", { params: requestParams }),
      ]);

      setProducts(normalizeList<ExperienceProduct>(productsResponse.data));
      setSellers(
        normalizeList<Seller>(sellersResponse.data).filter(
          (seller) => seller.is_active !== false
        )
      );
      setPickupLocations(
        normalizeList<PickupLocation>(pickupLocationsResponse.data).filter(
          (location) => location.is_active !== false
        )
      );
      setPickupSchedules(normalizeList<PickupSchedule>(pickupSchedulesResponse.data));
    } catch (err: any) {
      console.error("Could not load booking data:", err);
      setError(getErrorMessage(err, "Could not load booking data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [organisationSlug]);

  const selectedProduct = useMemo(() => {
    return products.find((product) => String(product.id) === form.productId) || null;
  }, [products, form.productId]);

  const selectedSeller = useMemo(() => {
    return sellers.find((seller) => String(seller.id) === form.sellerId) || null;
  }, [sellers, form.sellerId]);

  const selectedPickupLocation = useMemo(() => {
    return (
      pickupLocations.find(
        (location) => String(location.id) === form.pickupLocationId
      ) || null
    );
  }, [pickupLocations, form.pickupLocationId]);

  const assignedPickupSchedule = useMemo(() => {
    return findSchedule(
      pickupSchedules,
      form.productId,
      form.pickupLocationId,
      form.serviceDate
    );
  }, [pickupSchedules, form.productId, form.pickupLocationId, form.serviceDate]);

  const productTypes = useMemo(() => {
    return Array.from(
      new Set(products.map((product) => product.product_type).filter(Boolean))
    ).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const searchable = [
        product.name,
        product.slug,
        product.product_type,
        product.short_description,
        product.long_description,
        product.description,
        product.location,
        product.location_name,
      ]
        .join(" ")
        .toLowerCase();

      if (
        productSearch.trim() &&
        !searchable.includes(productSearch.trim().toLowerCase())
      ) {
        return false;
      }

      if (productTypeFilter && product.product_type !== productTypeFilter) {
        return false;
      }

      return product.is_active !== false && product.status !== "archived";
    });
  }, [products, productSearch, productTypeFilter]);

  const subtotal = useMemo(() => {
    return numberValue(form.unitPrice) * getChargeableGuests(form);
  }, [form.unitPrice, form.adults, form.children]);

  const discountAmount = numberValue(form.discountAmount);
  const taxAmount = numberValue(form.taxAmount);
  const totalAmount = Math.max(subtotal - discountAmount + taxAmount, 0);

  const depositRequired = useMemo(() => {
    const manualDeposit = numberValue(form.depositRequired);

    if (manualDeposit > 0) return manualDeposit;

    return calculateDepositRequired(selectedProduct, subtotal);
  }, [form.depositRequired, selectedProduct, subtotal]);

  const balanceDue = Math.max(totalAmount - numberValue(form.paymentAmount), 0);

  const requiresPickup =
    Boolean(selectedProduct?.requires_pickup_location) ||
    Boolean(selectedProduct?.supports_pickup);

  function updateForm<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function selectProduct(product: ExperienceProduct) {
    const price = numberValue(product.base_price);
    const deposit = calculateDepositRequired(product, price);

    setForm((current) => ({
      ...current,
      productId: String(product.id),
      unitPrice: moneyString(price),
      depositRequired: deposit > 0 ? moneyString(deposit) : "0.00",
      serviceTime: product.start_time?.slice(0, 5) || current.serviceTime,
      pickupLocationId:
        product.supports_pickup || product.requires_pickup_location
          ? current.pickupLocationId
          : "",
    }));
  }

  function updatePaymentMode(paymentMode: PaymentMode) {
    const option = paymentModeOptions.find((item) => item.value === paymentMode);
    const method = option?.method || "none";
    let nextRecordPayment = false;
    let nextAmount = "0.00";
    let nextStatus: "confirmed" | "pending" = "confirmed";

    if (paymentMode === "customer_full_online") {
      nextRecordPayment = true;
      nextAmount = moneyString(totalAmount);
    }

    if (paymentMode === "customer_deposit_online") {
      nextRecordPayment = true;
      nextAmount = moneyString(depositRequired || totalAmount);
    }

    if (paymentMode === "customer_cash_to_seller") {
      nextRecordPayment = true;
      nextAmount = moneyString(totalAmount);
    }

    if (paymentMode === "seller_full_payment") {
      nextRecordPayment = true;
      nextAmount = moneyString(totalAmount);
    }

    if (paymentMode === "seller_deposit_payment") {
      nextRecordPayment = true;
      nextAmount = moneyString(depositRequired || totalAmount);
    }

    if (paymentMode === "manual_bank_transfer" || paymentMode === "mixed_payment") {
      nextRecordPayment = true;
      nextAmount = moneyString(depositRequired || totalAmount);
      nextStatus = "pending";
    }

    setForm((current) => ({
      ...current,
      paymentMode,
      paymentMethod: method,
      recordPayment: nextRecordPayment,
      paymentAmount: nextAmount,
      paymentStatus: nextStatus,
      requiresSupervisorApproval: paymentMode === "requires_supervisor_approval",
    }));
  }

  function fillHotelFromPickupLocation(location: PickupLocation) {
    setForm((current) => ({
      ...current,
      pickupLocationId: String(location.id),
      customerHotel: current.customerHotel || location.name,
    }));
  }

  async function saveBooking() {
    if (!selectedProduct) {
      setError("Select a product before creating the booking.");
      return;
    }

    if (!form.serviceDate) {
      setError("Service date is required.");
      return;
    }

    if (!form.customerName.trim()) {
      setError("Customer name is required.");
      return;
    }

    if (form.customerEmail.trim() && !isValidEmail(form.customerEmail)) {
      setError("Customer email is optional, but if entered it must be valid.");
      return;
    }

    if (requiresPickup && !form.pickupLocationId) {
      setError("This product requires a hotel or pickup location.");
      return;
    }

    if (
      requiresPickup &&
      form.pickupLocationId &&
      !assignedPickupSchedule &&
      selectedProduct.requires_pickup_location
    ) {
      setError(
        "No pickup schedule was found for this product, date and pickup location."
      );
      return;
    }

    if (
      shouldAttachSellerToPayment(form.paymentMode) &&
      form.recordPayment &&
      numberValue(form.paymentAmount) > 0 &&
      !form.sellerId
    ) {
      setError("Select a seller for seller-collected or seller-paid bookings.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const paymentsPayload =
        form.recordPayment && numberValue(form.paymentAmount) > 0
          ? [
              {
                seller_id:
                  shouldAttachSellerToPayment(form.paymentMode) && form.sellerId
                    ? Number(form.sellerId)
                    : null,
                amount: form.paymentAmount,
                payment_type: getPaymentType(form, totalAmount, depositRequired),
                payer_type: form.paymentMode.startsWith("seller_")
                  ? "seller"
                  : "customer",
                method: paymentPayloadMethod(form.paymentMethod),
                status: form.paymentStatus,
                reference: form.paymentReference,
                note: form.paymentNote,
              },
            ]
          : [];

      const payload: Record<string, unknown> = {
        primary_product: selectedProduct.id,
        seller: form.sellerId ? Number(form.sellerId) : null,
        source: "owner_dashboard",
        status: form.requiresSupervisorApproval
          ? "pending_approval"
          : "pending_payment",
        payment_status:
          form.recordPayment && numberValue(form.paymentAmount) > 0
            ? form.paymentStatus === "confirmed"
              ? "partially_paid"
              : "pending"
            : "unpaid",
        payment_mode: form.paymentMode,
        payment_method: form.paymentMethod,
        service_date: form.serviceDate,
        service_time: form.serviceTime || selectedProduct.start_time || null,

        customer_name: form.customerName.trim(),
        customer_whatsapp: form.customerWhatsapp.trim() || null,
        customer_email: form.customerEmail.trim() || null,
        customer_hotel:
          form.customerHotel.trim() || selectedPickupLocation?.name || "",
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

        requires_supervisor_approval: form.requiresSupervisorApproval,
        receipt_sent_before_full_payment: form.receiptSentBeforeFullPayment,

        transfer_origin: form.transferOrigin.trim(),
        transfer_destination: form.transferDestination.trim(),
        transfer_airport: form.transferAirport.trim(),
        transfer_flight_number: form.transferFlightNumber.trim(),
        transfer_vehicle_type: form.transferVehicleType.trim(),
        transfer_round_trip: form.transferRoundTrip,
        transfer_return_date: form.transferReturnDate || null,
        transfer_return_time: form.transferReturnTime || null,

        pickup_location_id: form.pickupLocationId
          ? Number(form.pickupLocationId)
          : null,

        items_payload: [
          {
            product_id: selectedProduct.id,
            product_name: selectedProduct.name,
            service_date: form.serviceDate,
            service_time: form.serviceTime || selectedProduct.start_time || null,
            quantity: getChargeableGuests(form),
            unit_price: form.unitPrice,
            unit_cost: selectedProduct.cost_price || "0.00",
            instructions: form.customerNotes,
          },
        ],
        payments_payload: paymentsPayload,
      };

      const response = await api.post<Booking>("/ticketing/bookings/", payload, {
        params: requestParams,
      });

      setCreatedBooking(response.data);
      setSavedMessage(
        `Booking created${response.data.booking_code ? `: ${response.data.booking_code}` : ""}.`
      );
      setForm(initialForm);
    } catch (err: any) {
      console.error("Could not create booking:", err);
      setError(getErrorMessage(err, "Could not create booking."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title="New Booking"
        subtitle="Create a seller-assisted or owner-created booking."
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          Loading booking form...
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title="New Booking"
      subtitle="Create a seller-assisted or owner-created booking."
    >
      <div className="space-y-5 pb-24">
        {error && (
          <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        {savedMessage && (
          <div className="flex flex-col gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{savedMessage}</span>
            </div>

            {createdBooking && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/ticketing/${organisationSlug}/bookings`)
                  }
                  className="inline-flex h-10 items-center justify-center rounded-2xl bg-emerald-600 px-4 text-xs font-black text-white"
                >
                  View bookings
                </button>
              </div>
            )}
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <div className="space-y-5">
            <Panel
              title="1. Select product"
              description="Choose the excursion, transfer, event, ticket or custom product."
              icon={<Package className="h-5 w-5" />}
            >
              <div className="grid gap-3 xl:grid-cols-[1fr_220px]">
                <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Search product, Saona, transfer, event..."
                    className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
                  />
                </div>

                <select
                  value={productTypeFilter}
                  onChange={(event) => setProductTypeFilter(event.target.value)}
                  className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
                >
                  <option value="">All product types</option>
                  {productTypes.map((type) => (
                    <option key={type} value={type}>
                      {statusLabel(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {filteredProducts.slice(0, 8).map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => selectProduct(product)}
                    className={[
                      "rounded-3xl border p-4 text-left transition",
                      form.productId === String(product.id)
                        ? "border-amber-400 bg-amber-50 ring-2 ring-amber-100"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">
                          {product.name}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          {statusLabel(product.product_type)} · {getProductLocation(product)}
                        </p>
                      </div>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                        {formatMoney(product.base_price)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <MiniPill text={`Capacity ${getProductCapacity(product)}`} />
                      <MiniPill text={getProductDuration(product)} />
                      {(product.supports_pickup ||
                        product.requires_pickup_location) && (
                        <MiniPill text="Pickup" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {filteredProducts.length === 0 && (
                <EmptyState text="No products found." />
              )}
            </Panel>

            <Panel
              title="2. Customer and service details"
              description="Enter the customer, service date and guest quantity."
              icon={<UserRound className="h-5 w-5" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Customer name"
                  value={form.customerName}
                  onChange={(value) => updateForm("customerName", value)}
                  placeholder="Customer full name"
                  required
                />

                <Input
                  label="WhatsApp"
                  value={form.customerWhatsapp}
                  onChange={(value) => updateForm("customerWhatsapp", value)}
                  placeholder="+1 809 000 0000"
                />

                <Input
                  label="Email"
                  type="email"
                  value={form.customerEmail}
                  onChange={(value) => updateForm("customerEmail", value)}
                  placeholder="customer@email.com"
                />

                <Input
                  label="Hotel / pickup location name"
                  value={form.customerHotel}
                  onChange={(value) => updateForm("customerHotel", value)}
                  placeholder="Hotel name"
                />

                <Input
                  label="Service date"
                  type="date"
                  value={form.serviceDate}
                  onChange={(value) => updateForm("serviceDate", value)}
                  required
                />

                <Input
                  label="Service time"
                  type="time"
                  value={form.serviceTime}
                  onChange={(value) => updateForm("serviceTime", value)}
                />
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Input
                  label="Adults"
                  type="number"
                  value={String(form.adults)}
                  onChange={(value) => updateForm("adults", Number(value || 0))}
                />

                <Input
                  label="Children"
                  type="number"
                  value={String(form.children)}
                  onChange={(value) => updateForm("children", Number(value || 0))}
                />

                <Input
                  label="Infants"
                  type="number"
                  value={String(form.infants)}
                  onChange={(value) => updateForm("infants", Number(value || 0))}
                />
              </div>

              <Textarea
                label="Customer notes"
                value={form.customerNotes}
                onChange={(value) => updateForm("customerNotes", value)}
                placeholder="Special instructions, allergies, room number, pickup notes..."
              />
            </Panel>

            {selectedProduct?.product_type === "transfer" && (
              <Panel
                title="Transfer information"
                description="Optional fields for airport, hotel and private transfers."
                icon={<MapPin className="h-5 w-5" />}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="Origin"
                    value={form.transferOrigin}
                    onChange={(value) => updateForm("transferOrigin", value)}
                    placeholder="PUJ Airport"
                  />

                  <Input
                    label="Destination"
                    value={form.transferDestination}
                    onChange={(value) => updateForm("transferDestination", value)}
                    placeholder="Bávaro hotel"
                  />

                  <Input
                    label="Airport"
                    value={form.transferAirport}
                    onChange={(value) => updateForm("transferAirport", value)}
                    placeholder="PUJ"
                  />

                  <Input
                    label="Flight number"
                    value={form.transferFlightNumber}
                    onChange={(value) =>
                      updateForm("transferFlightNumber", value)
                    }
                    placeholder="AA123"
                  />

                  <Input
                    label="Vehicle type"
                    value={form.transferVehicleType}
                    onChange={(value) => updateForm("transferVehicleType", value)}
                    placeholder="Private van"
                  />

                  <Toggle
                    label="Round trip"
                    description="The transfer includes a return service."
                    checked={form.transferRoundTrip}
                    onChange={(value) => updateForm("transferRoundTrip", value)}
                  />

                  {form.transferRoundTrip && (
                    <>
                      <Input
                        label="Return date"
                        type="date"
                        value={form.transferReturnDate}
                        onChange={(value) =>
                          updateForm("transferReturnDate", value)
                        }
                      />

                      <Input
                        label="Return time"
                        type="time"
                        value={form.transferReturnTime}
                        onChange={(value) =>
                          updateForm("transferReturnTime", value)
                        }
                      />
                    </>
                  )}
                </div>
              </Panel>
            )}

            <Panel
              title="3. Pickup assignment"
              description="Pickup time is automatically selected from ProductPickupSchedule."
              icon={<Hotel className="h-5 w-5" />}
            >
              {requiresPickup ? (
                <>
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">
                      Hotel / pickup location
                    </span>
                    <select
                      value={form.pickupLocationId}
                      onChange={(event) => {
                        const location = pickupLocations.find(
                          (item) => String(item.id) === event.target.value
                        );

                        if (location) {
                          fillHotelFromPickupLocation(location);
                        } else {
                          updateForm("pickupLocationId", "");
                        }
                      }}
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                    >
                      <option value="">Select hotel / pickup location</option>
                      {pickupLocations.map((location) => (
                        <option key={location.id} value={String(location.id)}>
                          {location.name}
                          {location.zone_name ? ` · ${location.zone_name}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                    {assignedPickupSchedule ? (
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-600" />
                        <div>
                          <p className="text-sm font-black text-slate-950">
                            Pickup assigned
                          </p>
                          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                            {selectedPickupLocation?.name || "Selected location"} ·{" "}
                            {formatTime(assignedPickupSchedule.pickup_time)} ·{" "}
                            {assignedPickupSchedule.resolved_pickup_point ||
                              assignedPickupSchedule.pickup_point ||
                              selectedPickupLocation?.default_pickup_point ||
                              "Pickup point not configured"}
                          </p>
                          {assignedPickupSchedule.instructions && (
                            <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                              {assignedPickupSchedule.instructions}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : form.pickupLocationId && form.serviceDate ? (
                      <div className="flex items-start gap-3">
                        <AlertCircle className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
                        <div>
                          <p className="text-sm font-black text-slate-950">
                            No pickup schedule found
                          </p>
                          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                            Add a ProductPickupSchedule for this product, hotel
                            and date/day before creating the booking.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3">
                        <Clock3 className="mt-1 h-5 w-5 shrink-0 text-slate-500" />
                        <div>
                          <p className="text-sm font-black text-slate-950">
                            Waiting for pickup selection
                          </p>
                          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                            Select service date and pickup location to assign
                            the pickup time automatically.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600">
                  This product does not require pickup.
                </div>
              )}
            </Panel>

            <Panel
              title="4. Seller and payment"
              description="Choose seller-assisted booking and payment mode."
              icon={<CreditCard className="h-5 w-5" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    Seller
                  </span>
                  <select
                    value={form.sellerId}
                    onChange={(event) => updateForm("sellerId", event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                  >
                    <option value="">Owner / direct booking</option>
                    {sellers.map((seller) => (
                      <option key={seller.id} value={String(seller.id)}>
                        {seller.full_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    Payment mode
                  </span>
                  <select
                    value={form.paymentMode}
                    onChange={(event) =>
                      updatePaymentMode(event.target.value as PaymentMode)
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                  >
                    {paymentModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
                {
                  paymentModeOptions.find(
                    (option) => option.value === form.paymentMode
                  )?.helper
                }
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Toggle
                  label="Record payment now"
                  description="Add a BookingPayment when this booking is created."
                  checked={form.recordPayment}
                  onChange={(value) => updateForm("recordPayment", value)}
                />

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    Payment status
                  </span>
                  <select
                    value={form.paymentStatus}
                    onChange={(event) =>
                      updateForm(
                        "paymentStatus",
                        event.target.value as "confirmed" | "pending"
                      )
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                    disabled={!form.recordPayment}
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="pending">Pending</option>
                  </select>
                </label>

                <Input
                  label="Payment amount"
                  type="number"
                  value={form.paymentAmount}
                  onChange={(value) => updateForm("paymentAmount", value)}
                  disabled={!form.recordPayment}
                />

                <Input
                  label="Payment reference"
                  value={form.paymentReference}
                  onChange={(value) => updateForm("paymentReference", value)}
                  placeholder="Receipt, transaction or note"
                  disabled={!form.recordPayment}
                />
              </div>

              <Textarea
                label="Payment note"
                value={form.paymentNote}
                onChange={(value) => updateForm("paymentNote", value)}
                placeholder="Optional internal payment note"
                disabled={!form.recordPayment}
              />

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Toggle
                  label="Requires supervisor approval"
                  description="Create this booking as pending approval."
                  checked={form.requiresSupervisorApproval}
                  onChange={(value) =>
                    updateForm("requiresSupervisorApproval", value)
                  }
                />

                <Toggle
                  label="Receipt before full payment"
                  description="Allow receipt/ticket before full balance is paid."
                  checked={form.receiptSentBeforeFullPayment}
                  onChange={(value) =>
                    updateForm("receiptSentBeforeFullPayment", value)
                  }
                />
              </div>

              {selectedSeller && (
                <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-black text-slate-950">
                    Selected seller permissions
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSeller.can_generate_ticket_without_customer_online_payment && (
                      <MiniPill text="Can generate unpaid tickets" />
                    )}
                    {selectedSeller.can_create_pending_payment_booking && (
                      <MiniPill text="Can create pending bookings" />
                    )}
                    {selectedSeller.can_collect_cash_payment && (
                      <MiniPill text="Can collect cash" />
                    )}
                    {selectedSeller.can_pay_deposit_as_seller && (
                      <MiniPill text="Can pay deposit" />
                    )}
                    {selectedSeller.can_pay_full_amount_as_seller && (
                      <MiniPill text="Can pay full amount" />
                    )}
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <aside className="space-y-5">
            <section className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <Ticket className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-950">
                    Booking summary
                  </h2>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                    Review totals before creating.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <SummaryLine
                  label="Product"
                  value={selectedProduct?.name || "Not selected"}
                />
                <SummaryLine
                  label="Seller"
                  value={selectedSeller?.full_name || "Owner / direct"}
                />
                <SummaryLine
                  label="Service date"
                  value={form.serviceDate || "—"}
                />
                <SummaryLine
                  label="Guests"
                  value={`${getTotalGuests(form)} total · ${getChargeableGuests(
                    form
                  )} charged`}
                />
                <SummaryLine
                  label="Unit price"
                  value={formatMoney(form.unitPrice)}
                />
                <SummaryLine label="Subtotal" value={formatMoney(subtotal)} />
                <SummaryLine
                  label="Discount"
                  value={`-${formatMoney(discountAmount)}`}
                />
                <SummaryLine label="Tax" value={formatMoney(taxAmount)} />
                <SummaryLine
                  label="Total"
                  value={formatMoney(totalAmount)}
                  strong
                />
                <SummaryLine
                  label="Required deposit"
                  value={formatMoney(depositRequired)}
                />
                <SummaryLine
                  label="Payment now"
                  value={form.recordPayment ? formatMoney(form.paymentAmount) : "No payment"}
                />
                <SummaryLine
                  label="Balance after payment"
                  value={formatMoney(balanceDue)}
                  strong
                />
              </div>

              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  onClick={saveBooking}
                  disabled={saving}
                  className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Create booking
                </button>

                <Link
                  to={`/ticketing/${organisationSlug}/bookings`}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  Back to bookings
                </Link>

                <button
                  type="button"
                  onClick={loadPage}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh data
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <Wallet className="mt-1 h-5 w-5 shrink-0 text-amber-700" />
                <div>
                  <h3 className="text-sm font-black text-amber-950">
                    Seller payment flexibility
                  </h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
                    Use pending payment or seller commission only when the seller
                    is allowed to create the booking without forcing the customer
                    to pay online.
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <MapPin className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <h3 className="text-sm font-black text-slate-950">
                    Automatic pickup
                  </h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                    This page only sends the pickup location. Your backend finds
                    the matching schedule and creates the booking pickup info.
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </TicketingPageShell>
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

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  disabled?: boolean;
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
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-amber-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <textarea
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-amber-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
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

function MiniPill({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
      {text}
    </span>
  );
}

function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <span
        className={[
          "max-w-48 truncate text-right text-sm",
          strong ? "font-black text-slate-950" : "font-bold text-slate-700",
        ].join(" ")}
      >
        {value}
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
