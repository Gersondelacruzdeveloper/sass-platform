// src/modules/ticketing/pages/TicketingReportsPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  DollarSign,
  Download,
  Package,
  RefreshCw,
  Search,
  Ticket,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

import api from "../../../api/axios";
import TicketingPageShell from "../components/TicketingPageShell";

type Booking = {
  id: number;
  booking_code?: string;
  status?: string;
  payment_status?: string;
  payment_mode?: string;
  payment_method?: string;
  source?: string;
  service_date?: string | null;
  created_at?: string;

  customer_name?: string;
  customer_whatsapp?: string;
  customer_email?: string | null;

  adults?: number;
  children?: number;
  infants?: number;
  total_guests?: number;

  total_amount?: string | number;
  deposit_required?: string | number;
  deposit_paid?: string | number;
  balance_due?: string | number;

  primary_product?: number;
  primary_product_detail?: {
    id?: number;
    name?: string;
    slug?: string;
    product_type?: string;
  } | null;

  product_name?: string;
  seller?: number | null;
  seller_name?: string | null;

  items?: Array<{
    id?: number;
    product_name?: string;
    quantity?: number;
    line_total?: string | number;
    service_date?: string;
  }>;
};

type SellerCommission = {
  id: number;
  seller: number;
  seller_name?: string;
  booking?: number;
  booking_code?: string;
  amount?: string | number;
  rate_used?: string | number;
  status?: string;
  paid_at?: string | null;
  created_at?: string;
};

type Seller = {
  id: number;
  full_name: string;
  seller_slug?: string;
  role?: string;
  is_active?: boolean;
  total_sales_amount?: string | number;
  total_commission_amount?: string | number;
  total_collected_amount?: string | number;
  total_owed_to_company?: string | number;
};

type ExperienceProduct = {
  id: number;
  name: string;
  slug: string;
  product_type?: string;
  status?: string;
  is_active?: boolean;
  public_enabled?: boolean;
  base_price?: string | number;
};

type ReportRow = {
  label: string;
  count: number;
  total: number;
  paid: number;
  balance: number;
};

type SellerRow = {
  sellerId: string;
  sellerName: string;
  bookings: number;
  sales: number;
  commission: number;
  paidCommission: number;
  pendingCommission: number;
  balanceDue: number;
};

type ProductRow = {
  productId: string;
  productName: string;
  bookings: number;
  guests: number;
  sales: number;
  balance: number;
};

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

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getBookingDate(booking: Booking) {
  return booking.service_date || booking.created_at?.slice(0, 10) || "";
}

function getTotalGuests(booking: Booking) {
  if (typeof booking.total_guests === "number") return booking.total_guests;

  return (
    Number(booking.adults || 0) +
    Number(booking.children || 0) +
    Number(booking.infants || 0)
  );
}

function getProductId(booking: Booking) {
  return String(
    booking.primary_product_detail?.id ||
      booking.primary_product ||
      booking.items?.[0]?.id ||
      "unknown"
  );
}

function getProductName(booking: Booking) {
  return (
    booking.primary_product_detail?.name ||
    booking.product_name ||
    booking.items?.[0]?.product_name ||
    "Unknown product"
  );
}

function getSellerId(booking: Booking) {
  return String(booking.seller || booking.seller_name || "direct");
}

function getSellerName(booking: Booking) {
  return booking.seller_name || (booking.seller ? `Seller #${booking.seller}` : "Direct / Public");
}

function statusLabel(value?: string | null) {
  if (!value) return "Unknown";

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");

  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const csv = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

function addToReportMap(
  map: Map<string, ReportRow>,
  key: string,
  amount: number,
  paid: number,
  balance: number
) {
  const current = map.get(key) || {
    label: key,
    count: 0,
    total: 0,
    paid: 0,
    balance: 0,
  };

  current.count += 1;
  current.total += amount;
  current.paid += paid;
  current.balance += balance;

  map.set(key, current);
}

export default function TicketingReportsPage() {
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [commissions, setCommissions] = useState<SellerCommission[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [products, setProducts] = useState<ExperienceProduct[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [productTypeFilter, setProductTypeFilter] = useState("");

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  async function loadReports() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const [bookingsResponse, commissionsResponse, sellersResponse, productsResponse] =
        await Promise.allSettled([
          api.get("/ticketing/bookings/", { params: requestParams }),
          api.get("/ticketing/commissions/", { params: requestParams }),
          api.get("/ticketing/sellers/", { params: requestParams }),
          api.get("/ticketing/products/", { params: requestParams }),
        ]);

      if (bookingsResponse.status === "fulfilled") {
        setBookings(normalizeList<Booking>(bookingsResponse.value.data));
      } else {
        throw bookingsResponse.reason;
      }

      if (commissionsResponse.status === "fulfilled") {
        setCommissions(
          normalizeList<SellerCommission>(commissionsResponse.value.data)
        );
      } else {
        setCommissions([]);
      }

      if (sellersResponse.status === "fulfilled") {
        setSellers(normalizeList<Seller>(sellersResponse.value.data));
      } else {
        setSellers([]);
      }

      if (productsResponse.status === "fulfilled") {
        setProducts(normalizeList<ExperienceProduct>(productsResponse.value.data));
      } else {
        setProducts([]);
      }
    } catch (err: any) {
      console.error("Could not load reports:", err);
      setError(getErrorMessage(err, "Could not load reports."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReports();
  }, [organisationSlug]);

  const productTypes = useMemo(() => {
    return Array.from(
      new Set(products.map((product) => product.product_type).filter(Boolean))
    ).sort() as string[];
  }, [products]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const bookingDate = getBookingDate(booking);
      const productType = booking.primary_product_detail?.product_type || "";

      const searchText = [
        booking.booking_code,
        booking.customer_name,
        booking.customer_whatsapp,
        booking.customer_email,
        booking.status,
        booking.payment_status,
        booking.source,
        getProductName(booking),
        getSellerName(booking),
      ]
        .join(" ")
        .toLowerCase();

      if (search.trim() && !searchText.includes(search.trim().toLowerCase())) {
        return false;
      }

      if (dateFrom && bookingDate && bookingDate < dateFrom) return false;
      if (dateTo && bookingDate && bookingDate > dateTo) return false;

      if (sellerFilter && getSellerId(booking) !== sellerFilter) return false;

      if (productTypeFilter && productType !== productTypeFilter) return false;

      return true;
    });
  }, [bookings, search, dateFrom, dateTo, sellerFilter, productTypeFilter]);

  const filteredCommissions = useMemo(() => {
    const bookingCodes = new Set(
      filteredBookings.map((booking) => booking.booking_code).filter(Boolean)
    );

    return commissions.filter((commission) => {
      if (!commission.booking_code) return true;

      return bookingCodes.has(commission.booking_code);
    });
  }, [commissions, filteredBookings]);

  const stats = useMemo(() => {
    const grossSales = filteredBookings.reduce(
      (sum, booking) => sum + numberValue(booking.total_amount),
      0
    );

    const depositPaid = filteredBookings.reduce(
      (sum, booking) => sum + numberValue(booking.deposit_paid),
      0
    );

    const balanceDue = filteredBookings.reduce(
      (sum, booking) => sum + numberValue(booking.balance_due),
      0
    );

    const paidBookings = filteredBookings.filter(
      (booking) => booking.payment_status === "paid"
    ).length;

    const pendingBookings = filteredBookings.filter((booking) =>
      ["pending", "pending_payment"].includes(String(booking.status || ""))
    ).length;

    const confirmedBookings = filteredBookings.filter((booking) =>
      ["confirmed", "completed"].includes(String(booking.status || ""))
    ).length;

    const guests = filteredBookings.reduce(
      (sum, booking) => sum + getTotalGuests(booking),
      0
    );

    const totalCommission = filteredCommissions.reduce(
      (sum, commission) => sum + numberValue(commission.amount),
      0
    );

    const paidCommission = filteredCommissions
      .filter((commission) => commission.status === "paid")
      .reduce((sum, commission) => sum + numberValue(commission.amount), 0);

    const pendingCommission = filteredCommissions
      .filter((commission) => commission.status !== "paid")
      .reduce((sum, commission) => sum + numberValue(commission.amount), 0);

    return {
      bookings: filteredBookings.length,
      grossSales,
      depositPaid,
      balanceDue,
      paidBookings,
      pendingBookings,
      confirmedBookings,
      guests,
      totalCommission,
      paidCommission,
      pendingCommission,
    };
  }, [filteredBookings, filteredCommissions]);

  const paymentRows = useMemo(() => {
    const map = new Map<string, ReportRow>();

    filteredBookings.forEach((booking) => {
      addToReportMap(
        map,
        statusLabel(booking.payment_status || "unknown"),
        numberValue(booking.total_amount),
        numberValue(booking.deposit_paid),
        numberValue(booking.balance_due)
      );
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredBookings]);

  const statusRows = useMemo(() => {
    const map = new Map<string, ReportRow>();

    filteredBookings.forEach((booking) => {
      addToReportMap(
        map,
        statusLabel(booking.status || "unknown"),
        numberValue(booking.total_amount),
        numberValue(booking.deposit_paid),
        numberValue(booking.balance_due)
      );
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredBookings]);

  const sellerRows = useMemo(() => {
    const map = new Map<string, SellerRow>();

    filteredBookings.forEach((booking) => {
      const sellerId = getSellerId(booking);
      const current = map.get(sellerId) || {
        sellerId,
        sellerName: getSellerName(booking),
        bookings: 0,
        sales: 0,
        commission: 0,
        paidCommission: 0,
        pendingCommission: 0,
        balanceDue: 0,
      };

      current.bookings += 1;
      current.sales += numberValue(booking.total_amount);
      current.balanceDue += numberValue(booking.balance_due);

      map.set(sellerId, current);
    });

    filteredCommissions.forEach((commission) => {
      const sellerId = String(commission.seller || commission.seller_name || "direct");
      const current = map.get(sellerId) || {
        sellerId,
        sellerName: commission.seller_name || `Seller #${commission.seller}`,
        bookings: 0,
        sales: 0,
        commission: 0,
        paidCommission: 0,
        pendingCommission: 0,
        balanceDue: 0,
      };

      const amount = numberValue(commission.amount);

      current.commission += amount;

      if (commission.status === "paid") {
        current.paidCommission += amount;
      } else {
        current.pendingCommission += amount;
      }

      map.set(sellerId, current);
    });

    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [filteredBookings, filteredCommissions]);

  const productRows = useMemo(() => {
    const map = new Map<string, ProductRow>();

    filteredBookings.forEach((booking) => {
      const productId = getProductId(booking);
      const current = map.get(productId) || {
        productId,
        productName: getProductName(booking),
        bookings: 0,
        guests: 0,
        sales: 0,
        balance: 0,
      };

      current.bookings += 1;
      current.guests += getTotalGuests(booking);
      current.sales += numberValue(booking.total_amount);
      current.balance += numberValue(booking.balance_due);

      map.set(productId, current);
    });

    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [filteredBookings]);

  const recentBookings = useMemo(() => {
    return [...filteredBookings]
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, 10);
  }, [filteredBookings]);

  function resetFilters() {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setSellerFilter("");
    setProductTypeFilter("");
  }

  function exportBookings() {
    downloadCsv(
      "ticketing-booking-report.csv",
      [
        "Booking Code",
        "Date",
        "Customer",
        "Product",
        "Seller",
        "Status",
        "Payment Status",
        "Guests",
        "Total",
        "Paid",
        "Balance",
      ],
      filteredBookings.map((booking) => [
        booking.booking_code || booking.id,
        getBookingDate(booking),
        booking.customer_name || "",
        getProductName(booking),
        getSellerName(booking),
        booking.status || "",
        booking.payment_status || "",
        getTotalGuests(booking),
        booking.total_amount || 0,
        booking.deposit_paid || 0,
        booking.balance_due || 0,
      ])
    );
  }

  function exportSellers() {
    downloadCsv(
      "ticketing-seller-report.csv",
      [
        "Seller",
        "Bookings",
        "Sales",
        "Commission",
        "Paid Commission",
        "Pending Commission",
        "Balance Due",
      ],
      sellerRows.map((row) => [
        row.sellerName,
        row.bookings,
        row.sales,
        row.commission,
        row.paidCommission,
        row.pendingCommission,
        row.balanceDue,
      ])
    );
  }

  if (loading) {
    return (
      <TicketingPageShell
        title="Reports"
        subtitle="Review sales by seller, products, payments, rankings and pending balances."
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          Loading reports...
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title="Reports"
      subtitle="Review sales by seller, products, payments, rankings and pending balances."
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard
            title="Bookings"
            value={String(stats.bookings)}
            helper={`${stats.confirmedBookings} confirmed · ${stats.pendingBookings} pending`}
            icon={<Ticket className="h-6 w-6 text-slate-700" />}
          />
          <StatCard
            title="Gross sales"
            value={formatMoney(stats.grossSales)}
            helper="Total booking value"
            icon={<DollarSign className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title="Collected"
            value={formatMoney(stats.depositPaid)}
            helper={`${stats.paidBookings} paid bookings`}
            icon={<CreditCard className="h-6 w-6 text-sky-600" />}
          />
          <StatCard
            title="Balance due"
            value={formatMoney(stats.balanceDue)}
            helper="Pending to collect"
            icon={<Clock3 className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title="Commission"
            value={formatMoney(stats.totalCommission)}
            helper={`${formatMoney(stats.pendingCommission)} pending`}
            icon={<Wallet className="h-6 w-6 text-purple-600" />}
          />
          <StatCard
            title="Guests"
            value={String(stats.guests)}
            helper="Total passengers/customers"
            icon={<Users className="h-6 w-6 text-indigo-600" />}
          />
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Report filters
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Filter by date, seller, product type, customer, product, payment status or booking code.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={exportBookings}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Export bookings
              </button>

              <button
                type="button"
                onClick={exportSellers}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Export sellers
              </button>

              <button
                type="button"
                onClick={loadReports}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_170px_170px_220px_200px_auto]">
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search booking, customer, product, seller..."
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
              />
            </div>

            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            />

            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            />

            <select
              value={sellerFilter}
              onChange={(event) => setSellerFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">All sellers</option>
              <option value="direct">Direct / Public</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={String(seller.id)}>
                  {seller.full_name}
                </option>
              ))}
            </select>

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

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <ReportPanel
            title="Sales by seller"
            description="Seller performance, commissions and pending balances."
            icon={<UserRound className="h-5 w-5" />}
          >
            <ReportTable
              rows={sellerRows.slice(0, 8)}
              maxValue={sellerRows[0]?.sales || 0}
              columns={[
                { key: "sellerName", label: "Seller" },
                { key: "bookings", label: "Bookings" },
                { key: "sales", label: "Sales", money: true },
                { key: "pendingCommission", label: "Pending comm.", money: true },
              ]}
            />
          </ReportPanel>

          <ReportPanel
            title="Sales by product"
            description="Top products by sales, guests and pending balance."
            icon={<Package className="h-5 w-5" />}
          >
            <ReportTable
              rows={productRows.slice(0, 8)}
              maxValue={productRows[0]?.sales || 0}
              columns={[
                { key: "productName", label: "Product" },
                { key: "bookings", label: "Bookings" },
                { key: "guests", label: "Guests" },
                { key: "sales", label: "Sales", money: true },
              ]}
            />
          </ReportPanel>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <ReportPanel
            title="Payment status"
            description="How much is paid, unpaid, partial or pending."
            icon={<CreditCard className="h-5 w-5" />}
          >
            <SimpleReportRows rows={paymentRows} />
          </ReportPanel>

          <ReportPanel
            title="Booking status"
            description="Operational status of reservations."
            icon={<CheckCircle2 className="h-5 w-5" />}
          >
            <SimpleReportRows rows={statusRows} />
          </ReportPanel>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <CalendarDays className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-lg font-black text-slate-950">
                Recent bookings
              </h2>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                Latest bookings matching the current filters.
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            {recentBookings.length === 0 ? (
              <EmptyState text="No bookings found for this report." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Booking</Th>
                      <Th>Date</Th>
                      <Th>Customer</Th>
                      <Th>Product</Th>
                      <Th>Seller</Th>
                      <Th>Total</Th>
                      <Th>Paid</Th>
                      <Th>Balance</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {recentBookings.map((booking) => (
                      <tr key={booking.id}>
                        <Td>
                          <p className="font-black text-slate-950">
                            {booking.booking_code || `#${booking.id}`}
                          </p>
                        </Td>
                        <Td>{formatDate(getBookingDate(booking))}</Td>
                        <Td>
                          <div>
                            <p className="font-black text-slate-900">
                              {booking.customer_name || "No name"}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {booking.customer_whatsapp || booking.customer_email || "No contact"}
                            </p>
                          </div>
                        </Td>
                        <Td>{getProductName(booking)}</Td>
                        <Td>{getSellerName(booking)}</Td>
                        <Td>{formatMoney(booking.total_amount)}</Td>
                        <Td>{formatMoney(booking.deposit_paid)}</Td>
                        <Td>{formatMoney(booking.balance_due)}</Td>
                        <Td>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                            {statusLabel(booking.status)}
                          </span>
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
    </TicketingPageShell>
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

function ReportPanel({
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

function ReportTable({
  rows,
  maxValue,
  columns,
}: {
  rows: Array<Record<string, any>>;
  maxValue: number;
  columns: Array<{ key: string; label: string; money?: boolean }>;
}) {
  if (rows.length === 0) {
    return <EmptyState text="No report data available." />;
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => {
        const salesValue = numberValue(row.sales);
        const width = maxValue ? Math.max(4, (salesValue / maxValue) * 100) : 0;

        return (
          <div
            key={`${row[columns[0].key]}-${index}`}
            className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="grid gap-3 text-sm md:grid-cols-4">
              {columns.map((column) => (
                <div key={column.key}>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                    {column.label}
                  </p>
                  <p className="mt-1 truncate font-black text-slate-950">
                    {column.money ? formatMoney(row[column.key]) : row[column.key]}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SimpleReportRows({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0) {
    return <EmptyState text="No report data available." />;
  }

  const maxTotal = rows[0]?.total || 0;

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const width = maxTotal ? Math.max(4, (row.total / maxTotal) * 100) : 0;

        return (
          <div
            key={row.label}
            className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-black text-slate-950">{row.label}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {row.count} bookings
                </p>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-sm font-black text-slate-950">
                  {formatMoney(row.total)}
                </p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  Paid {formatMoney(row.paid)} · Balance {formatMoney(row.balance)}
                </p>
              </div>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
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
