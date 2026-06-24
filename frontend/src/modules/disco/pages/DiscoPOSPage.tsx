// src/modules/disco/pages/DiscoPOSPage.tsx

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  Minus,
  Package,
  Plus,
  ReceiptText,
  RefreshCcw,
  Search,
  ShoppingCart,
  Table2,
  Trash2,
  Utensils,
  X,
} from "lucide-react";

import CartPanel from "../components/CartPanel";
import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import ProductCard from "../components/ProductCard";

import { useCart } from "../hooks/useCart";
import { useDiscoProducts } from "../hooks/useDiscoProducts";
import { useDiscoSales } from "../hooks/useDiscoSales";
import { useDiscoTables } from "../hooks/useDiscoTables";

import {
  addItemToTableBill,
  cancelTableBill,
  checkoutTableBill,
  getOpenTableBills,
  openTableBill,
  removeItemFromTableBill,
  updateTableBillItem,
  type Sale,
  type SaleItem,
} from "../api/salesApi";

import {
  getDiscoSettings,
  type DiscoSettings,
} from "../api/settingsApi";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

type PaymentMethod = "cash" | "card";

type Product = {
  id: number;
  name: string;
  sale_price: string | number;
  cost_price?: string | number;
  stock: number;
  minimum_stock?: number;
  unit?: string;
  category_name?: string;
  brand?: string | null;
  image?: string | null;
  image_url?: string | null;
  is_active: boolean;
  is_low_stock?: boolean;
};

type Table = {
  id: number;
  name: string;
  floor?: string | null;
  capacity?: number;
  minimum_spend?: string | number;
  status: "available" | "occupied" | "reserved" | "cleaning" | "inactive";
  is_vip?: boolean;
};

type ReceiptLabels = {
  receipt: string;
  table: string;
  productFallback: string;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  payment: string;
  cashier: string;
  thankYou: string;
};

function money(
  value?: string | number | null,
  language: DiscoLanguage = "en",
  currencySymbol = "RD$"
) {
  const locale = language === "es" ? "es-DO" : "en-US";

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

  return `${currencySymbol} ${formatted}`;
}

function printReceipt(
  sale: any,
  labels: ReceiptLabels,
  language: DiscoLanguage,
  currencySymbol = "RD$"
) {
  const printWindow = window.open("", "_blank");

  if (!printWindow) return;

  const items = sale.sale_items || sale.items || [];
  const locale = language === "es" ? "es-DO" : "en-US";
  const cashierName =
    sale.cashier_name ||
    sale.created_by_name ||
    sale.created_by?.username ||
    "";

  const receiptMoney = (value?: string | number | null) => {
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

    return `${currencySymbol} ${formatted}`;
  };

  printWindow.document.write(`
    <html>
      <head>
        <title>${labels.receipt} ${sale.receipt_number || ""}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            width: 80mm;
            padding: 10px;
            font-size: 12px;
          }

          h2, p {
            text-align: center;
            margin: 4px 0;
          }

          .row {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin: 4px 0;
          }

          .item-name {
            max-width: 48mm;
          }

          hr {
            border: none;
            border-top: 1px dashed #000;
            margin: 8px 0;
          }

          @media print {
            body {
              width: 80mm;
            }
          }
        </style>
      </head>
      <body>
        <h2>ALMOND BROWNIE</h2>
        <p>${labels.receipt} #${sale.receipt_number || sale.id}</p>
        <p>${new Date().toLocaleString(locale)}</p>

        ${
          sale.table_number || sale.table_name
            ? `<p>${labels.table}: ${sale.table_number || sale.table_name}</p>`
            : ""
        }

        ${cashierName ? `<p>${labels.cashier}: ${cashierName}</p>` : ""}

        <hr />

        ${items
          .map(
            (item: any) => `
              <div class="row">
                <span class="item-name">${item.quantity} x ${
                  item.product_name ||
                  item.product?.name ||
                  labels.productFallback
                }</span>
                <span>${receiptMoney(item.total)}</span>
              </div>
            `
          )
          .join("")}

        <hr />

        <div class="row">
          <strong>${labels.subtotal}</strong>
          <strong>${receiptMoney(sale.subtotal)}</strong>
        </div>

        <div class="row">
          <strong>${labels.tax}</strong>
          <strong>${receiptMoney(sale.tax)}</strong>
        </div>

        <div class="row">
          <strong>${labels.discount}</strong>
          <strong>${receiptMoney(sale.discount)}</strong>
        </div>

        <div class="row">
          <strong>${labels.total}</strong>
          <strong>${receiptMoney(sale.total)}</strong>
        </div>

        <p>${labels.payment}: ${sale.payment_method || ""}</p>

        <hr />

        <p>${labels.thankYou}</p>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
}

function getSaleItems(bill?: Sale | null): SaleItem[] {
  if (!bill) return [];

  const saleItems = (bill as any).sale_items;
  const items = (bill as any).items;

  if (Array.isArray(saleItems)) return saleItems as SaleItem[];
  if (Array.isArray(items)) return items as SaleItem[];

  return [];
}

function getBillTableId(bill?: Sale | null) {
  if (!bill) return null;

  const tableValue = (bill as any).table || (bill as any).table_id;

  if (typeof tableValue === "object" && tableValue !== null) {
    return Number(tableValue.id || 0) || null;
  }

  return Number(tableValue || 0) || null;
}

function getItemProductId(item: SaleItem) {
  const productValue = (item as any).product || (item as any).product_id;

  if (typeof productValue === "object" && productValue !== null) {
    return Number(productValue.id || 0);
  }

  return Number(productValue || 0);
}

export default function DiscoPOSPage() {
  const { language, t } = useDiscoTranslation();

  const [discoSettings, setDiscoSettings] = useState<DiscoSettings | null>(
    null
  );

  const taxPercentage = Number(discoSettings?.tax_percentage || 0);
  const currencySymbol = discoSettings?.currency_symbol || "RD$";

  const { products, loading, error, refresh } = useDiscoProducts();

  const {
    tables,
    loading: tablesLoading,
    error: tablesError,
    refreshTables,
  } = useDiscoTables();

  const { createSale, saving, error: saleError } = useDiscoSales();

  const {
    items,
    subtotal,
    tax,
    total,
    addItem,
    removeItem,
    increaseQuantity,
    decreaseQuantity,
    clearCart,
  } = useCart({
    taxPercentage,
  });

  const [search, setSearch] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [localError, setLocalError] = useState("");

  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [selectedBill, setSelectedBill] = useState<Sale | null>(null);
  const [openBills, setOpenBills] = useState<Sale[]>([]);

  const [tableLoading, setTableLoading] = useState(false);
  const [billActionLoading, setBillActionLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const receiptLabels = useMemo<ReceiptLabels>(
    () => ({
      receipt: t("pos.receipt"),
      table: t("pos.table"),
      productFallback: t("pos.productFallback"),
      subtotal: t("pos.subtotal"),
      tax: t("pos.tax"),
      discount: t("pos.discount"),
      total: t("pos.total"),
      payment: t("pos.payment"),
      cashier: language === "es" ? "Cobrado por" : "Charged by",
      thankYou: t("pos.thankYou"),
    }),
    [t, language]
  );

  const availableProducts = useMemo(() => {
    return products.filter(
      (product: Product) => product.is_active && Number(product.stock || 0) > 0
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return availableProducts;

    return availableProducts.filter((product: Product) =>
      [
        product.name,
        product.category_name,
        product.brand,
        product.unit,
        product.sale_price,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [availableProducts, search]);

  const serviceTables = useMemo(() => {
    return (tables as Table[]).filter((table) =>
      ["available", "reserved", "occupied"].includes(table.status)
    );
  }, [tables]);

  const occupiedTables = useMemo(() => {
    return (tables as Table[]).filter((table) => table.status === "occupied");
  }, [tables]);

  const cartQuantity = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  const selectedBillItems = useMemo(() => {
    return getSaleItems(selectedBill);
  }, [selectedBill]);

  const selectedBillQuantity = useMemo(() => {
    return selectedBillItems.reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0
    );
  }, [selectedBillItems]);

  const currentMode = selectedTable ? t("pos.tableBill") : t("pos.directPOS");
  const currentTotal = selectedTable ? selectedBill?.total || "0.00" : total;
  const currentQuantity = selectedTable ? selectedBillQuantity : cartQuantity;

  function getBillForTableFromList(tableId: number, billList = openBills) {
    return billList.find((bill) => {
      const billTableId = getBillTableId(bill);

      return (
        billTableId === tableId &&
        bill.sale_type === "table" &&
        bill.status === "pending"
      );
    });
  }

  function getTableStatusLabel(status: Table["status"]) {
    return t(`pos.tableStatus.${status}`, status.toUpperCase());
  }

  function updateBillState(updatedBill: Sale) {
    setSelectedBill(updatedBill);

    setOpenBills((currentBills) => {
      const shouldRemainOpen =
        updatedBill.sale_type === "table" && updatedBill.status === "pending";

      if (!shouldRemainOpen) {
        return currentBills.filter((bill) => bill.id !== updatedBill.id);
      }

      const exists = currentBills.some((bill) => bill.id === updatedBill.id);

      if (!exists) {
        return [updatedBill, ...currentBills];
      }

      return currentBills.map((bill) =>
        bill.id === updatedBill.id ? updatedBill : bill
      );
    });
  }

  async function loadOpenBills() {
    const bills = await getOpenTableBills();
    setOpenBills(bills);

    if (selectedTable) {
      const refreshedBill = getBillForTableFromList(selectedTable.id, bills);

      if (refreshedBill) {
        setSelectedBill(refreshedBill);
      }
    }

    return bills;
  }

  async function syncSelectedBillFromServer(
    tableId: number,
    fallbackBill?: Sale | null
  ) {
    const bills = await getOpenTableBills();
    setOpenBills(bills);

    const freshBill = getBillForTableFromList(tableId, bills);

    if (freshBill) {
      setSelectedBill(freshBill);
      return freshBill;
    }

    if (fallbackBill) {
      updateBillState(fallbackBill);
      return fallbackBill;
    }

    return null;
  }

  async function refreshAll() {
    await Promise.all([refresh(), refreshTables(), loadOpenBills()]);
  }

  useEffect(() => {
    async function loadDiscoSettings() {
      try {
        const data = await getDiscoSettings();
        setDiscoSettings(data);
      } catch (error) {
        console.error("Could not load disco settings:", error);
      }
    }

    loadDiscoSettings();
  }, []);

  useEffect(() => {
    loadOpenBills().catch((err) => {
      console.error(err);
      setLocalError(t("pos.errorLoadOpenBills"));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getOrCreateBillForTable(table: Table) {
    if (table.status === "inactive") {
      throw new Error(t("pos.errorInactiveTable"));
    }

    if (table.status === "cleaning") {
      throw new Error(t("pos.errorCleaningTable"));
    }

    const latestBills = await getOpenTableBills();
    setOpenBills(latestBills);

    const existingBill = getBillForTableFromList(table.id, latestBills);

    if (existingBill) {
      setSelectedTable(table);
      setSelectedBill(existingBill);
      return existingBill;
    }

    const newBill = await openTableBill({
      table_id: table.id,
      customer_name: customerName || table.name,
    });

    setSelectedTable(table);
    updateBillState(newBill);
    await refreshTables();

    return newBill;
  }

  async function handleSelectTable(table: Table) {
    try {
      setTableLoading(true);
      setLocalError("");

      await getOrCreateBillForTable(table);
    } catch (err: any) {
      console.error(err);
      setLocalError(
        err?.response?.data?.table_id?.[0] ||
          err?.response?.data?.table_id ||
          err?.response?.data?.detail ||
          err?.message ||
          t("pos.errorOpenTableBill")
      );
    } finally {
      setTableLoading(false);
    }
  }

  function leaveTableMode() {
    setSelectedTable(null);
    setSelectedBill(null);
    setLocalError("");
  }

  async function handleDirectPOSSale(paymentMethod: PaymentMethod) {
    const payload = {
      payment_method: paymentMethod,
      sale_type: "pos",
      customer_name: customerName || "",
      discount: "0.00",
      items: items.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
      })),
    };

    const createdSale = await createSale(payload as any);

    if (createdSale) {
      printReceipt(createdSale, receiptLabels, language, currencySymbol);
    }
  }

  async function handleProductClick(product: Product) {
    try {
      setLocalError("");

      if (!selectedTable) {
        addItem(product);
        return;
      }

      setBillActionLoading(true);

      const bill = selectedBill || (await getOrCreateBillForTable(selectedTable));

      const updatedBill = await addItemToTableBill(bill.id, {
        product_id: product.id,
        quantity: 1,
      });

      updateBillState(updatedBill);
      await syncSelectedBillFromServer(selectedTable.id, updatedBill);
      await refresh();
    } catch (err: any) {
      console.error(err);
      setLocalError(
        err?.response?.data?.quantity?.[0] ||
          err?.response?.data?.product_id?.[0] ||
          err?.response?.data?.detail ||
          t("pos.errorAddProductToBill")
      );
    } finally {
      setBillActionLoading(false);
    }
  }

  async function handleIncreaseBillItem(item: SaleItem) {
    if (!selectedBill) return;

    try {
      setBillActionLoading(true);
      setLocalError("");

      const updatedBill = await addItemToTableBill(selectedBill.id, {
        product_id: getItemProductId(item),
        quantity: 1,
      });

      updateBillState(updatedBill);

      const tableId = selectedTable?.id || getBillTableId(selectedBill);

      if (tableId) {
        await syncSelectedBillFromServer(tableId, updatedBill);
      }

      await refresh();
    } catch (err: any) {
      console.error(err);
      setLocalError(
        err?.response?.data?.quantity?.[0] ||
          err?.response?.data?.detail ||
          t("pos.errorIncreaseQuantity")
      );
    } finally {
      setBillActionLoading(false);
    }
  }

  async function handleDecreaseBillItem(item: SaleItem) {
    if (!selectedBill) return;

    try {
      setBillActionLoading(true);
      setLocalError("");

      let updatedBill: Sale;

      if (item.quantity <= 1) {
        updatedBill = await removeItemFromTableBill(selectedBill.id, {
          item_id: item.id,
        });
      } else {
        updatedBill = await updateTableBillItem(selectedBill.id, {
          item_id: item.id,
          quantity: item.quantity - 1,
        });
      }

      updateBillState(updatedBill);

      const tableId = selectedTable?.id || getBillTableId(selectedBill);

      if (tableId) {
        await syncSelectedBillFromServer(tableId, updatedBill);
      }

      await refresh();
    } catch (err: any) {
      console.error(err);
      setLocalError(
        err?.response?.data?.quantity?.[0] ||
          err?.response?.data?.detail ||
          t("pos.errorDecreaseQuantity")
      );
    } finally {
      setBillActionLoading(false);
    }
  }

  async function handleRemoveBillItem(item: SaleItem) {
    if (!selectedBill) return;

    try {
      setBillActionLoading(true);
      setLocalError("");

      const updatedBill = await removeItemFromTableBill(selectedBill.id, {
        item_id: item.id,
      });

      updateBillState(updatedBill);

      const tableId = selectedTable?.id || getBillTableId(selectedBill);

      if (tableId) {
        await syncSelectedBillFromServer(tableId, updatedBill);
      }

      await refresh();
    } catch (err: any) {
      console.error(err);
      setLocalError(
        err?.response?.data?.item_id?.[0] ||
          err?.response?.data?.detail ||
          t("pos.errorRemoveItem")
      );
    } finally {
      setBillActionLoading(false);
    }
  }

  async function handleDirectCheckout(paymentMethod: PaymentMethod) {
    if (items.length === 0) return;

    try {
      setCheckoutLoading(true);
      setLocalError("");

      await handleDirectPOSSale(paymentMethod);

      clearCart();
      setCustomerName("");
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      setLocalError(
        err?.response?.data?.quantity?.[0] ||
          err?.response?.data?.product_id?.[0] ||
          err?.response?.data?.detail ||
          t("pos.errorCompleteCheckout")
      );
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleTableCheckout(paymentMethod: PaymentMethod) {
    if (!selectedBill) return;

    try {
      setCheckoutLoading(true);
      setLocalError("");

      const tableId = selectedTable?.id || getBillTableId(selectedBill);
      const billToCheckout =
        tableId ? await syncSelectedBillFromServer(tableId, selectedBill) : selectedBill;

      const billItems = getSaleItems(billToCheckout);

      if (!billToCheckout || billItems.length === 0) {
        setLocalError(t("pos.errorEmptyTableBill"));
        return;
      }

      const checkedOutSale = await checkoutTableBill(billToCheckout.id, {
        payment_method: paymentMethod,
        discount: "0.00",
      });

      printReceipt(checkedOutSale, receiptLabels, language, currencySymbol);
      leaveTableMode();
      setCustomerName("");
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      setLocalError(
        err?.response?.data?.items?.[0] ||
          err?.response?.data?.sale?.[0] ||
          err?.response?.data?.detail ||
          t("pos.errorCheckoutTableBill")
      );
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleCancelTableBill() {
    if (!selectedBill) return;

    const confirmed = window.confirm(t("pos.confirmCancelTableBill"));

    if (!confirmed) return;

    try {
      setCheckoutLoading(true);
      setLocalError("");

      await cancelTableBill(selectedBill.id);
      leaveTableMode();
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      setLocalError(err?.response?.data?.detail || t("pos.errorCancelTableBill"));
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title={t("pos.title")}
        subtitle={t("pos.subtitle")}
        icon={ShoppingCart}
        actionLabel={t("pos.refresh")}
        onAction={refreshAll}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title={t("pos.mode")}
          value={currentMode}
          icon={ShoppingCart}
          helper={selectedTable ? selectedTable.name : t("pos.noTableSelected")}
        />

        <DiscoStatCard
          title={t("pos.productsAvailable")}
          value={availableProducts.length}
          icon={Package}
          helper={t("pos.readyForSale")}
        />

        <DiscoStatCard
          title={t("pos.items")}
          value={currentQuantity}
          icon={ShoppingCart}
          helper={selectedTable ? t("pos.savedToTable") : t("pos.currentCart")}
        />

        <DiscoStatCard
          title={t("pos.total")}
          value={money(currentTotal, language, currencySymbol)}
          icon={Utensils}
          helper={`${occupiedTables.length} ${t("pos.occupiedTables")}`}
        />
      </section>

      {(error || saleError || tablesError || localError) && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error || saleError || tablesError || localError}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[1fr_400px]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("pos.searchProductPlaceholder")}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </div>

              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={
                  selectedTable
                    ? `${t("pos.guestNameFor")} ${selectedTable.name}`
                    : t("pos.customerNameOptional")
                }
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white lg:max-w-xs"
              />

              <button
                type="button"
                onClick={refreshAll}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
              >
                <RefreshCcw className="h-4 w-4" />
                {t("pos.refresh")}
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {t("pos.tables")}
                </h2>

                <p className="text-sm font-medium text-slate-500">
                  {t("pos.tablesDescription")}
                </p>
              </div>

              {selectedTable && (
                <button
                  type="button"
                  onClick={leaveTableMode}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                  {t("pos.leaveTable")}
                </button>
              )}
            </div>

            {tablesLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-32 animate-pulse rounded-3xl bg-slate-100"
                  />
                ))}
              </div>
            ) : serviceTables.length === 0 ? (
              <DiscoEmptyState
                icon={Utensils}
                title={t("pos.noTablesAvailable")}
                description={t("pos.noTablesAvailableDescription")}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {serviceTables.map((table) => {
                  const isSelected = selectedTable?.id === table.id;
                  const openBill = getBillForTableFromList(table.id);

                  return (
                    <button
                      key={table.id}
                      type="button"
                      disabled={tableLoading}
                      onClick={() => handleSelectTable(table)}
                      className={`rounded-3xl border p-4 text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg disabled:opacity-60 ${
                        isSelected
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-950"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                              isSelected
                                ? "bg-white/10 text-white"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            <Table2 className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <p className="truncate text-base font-black">
                              {table.name}
                            </p>

                            <p
                              className={`truncate text-sm font-semibold ${
                                isSelected ? "text-white/70" : "text-slate-500"
                              }`}
                            >
                              {table.floor || t("pos.mainFloor")}
                            </p>
                          </div>
                        </div>

                        {isSelected ? (
                          <CheckCircle2 className="h-5 w-5 shrink-0" />
                        ) : table.is_vip ? (
                          <Crown className="h-5 w-5 shrink-0 text-amber-500" />
                        ) : null}
                      </div>

                      <div
                        className={`mt-4 flex flex-wrap gap-2 text-xs font-black ${
                          isSelected ? "text-white/80" : "text-slate-500"
                        }`}
                      >
                        <span
                          className={`rounded-full px-3 py-1 ${
                            isSelected ? "bg-white/10" : "bg-slate-100"
                          }`}
                        >
                          {getTableStatusLabel(table.status)}
                        </span>

                        {openBill && (
                          <span
                            className={`rounded-full px-3 py-1 ${
                              isSelected
                                ? "bg-white/10"
                                : "bg-slate-950 text-white"
                            }`}
                          >
                            {t("pos.billLabelShort")} #{openBill.id}
                          </span>
                        )}

                        <span
                          className={`rounded-full px-3 py-1 ${
                            isSelected ? "bg-white/10" : "bg-slate-100"
                          }`}
                        >
                          {t("pos.capacityShort")}: {table.capacity || 0}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 9 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-56 animate-pulse rounded-3xl bg-slate-100"
                  />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <DiscoEmptyState
                icon={Package}
                title={t("pos.noProductsFound")}
                description={t("pos.noProductsFoundDescription")}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product: Product) => {
                  const safeProduct = {
                    ...product,
                    minimum_stock: product.minimum_stock ?? 0,
                  };

                  return (
                    <ProductCard
                      key={product.id}
                      product={safeProduct as any}
                      onAddToCart={() => handleProductClick(product)}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="xl:sticky xl:top-5 xl:self-start">
          {selectedTable ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                    <ReceiptText className="h-4 w-4" />
                    {t("pos.runningTableBill")}
                  </div>

                  <h2 className="text-lg font-black text-slate-950">
                    {selectedTable.name}
                  </h2>

                  <p className="text-sm font-semibold text-slate-500">
                    {selectedBill
                      ? `${t("pos.billLabelShort")} #${selectedBill.id} · ${t(
                          "pos.savedAutomatically"
                        )}`
                      : t("pos.openingBill")}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={leaveTableMode}
                  className="rounded-2xl p-2 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500">
                {t("pos.tableBillHelper")}
              </div>

              <div className="mt-4 space-y-3">
                {!selectedBill || selectedBillItems.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-slate-200 p-5 text-center">
                    <ShoppingCart className="mx-auto h-8 w-8 text-slate-300" />

                    <p className="mt-2 text-sm font-black text-slate-700">
                      {t("pos.noItemsYet")}
                    </p>

                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {t("pos.noItemsYetDescription")}
                    </p>
                  </div>
                ) : (
                  selectedBillItems.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">
                            {item.product_name ||
                              `${t("pos.productFallback")} #${item.product}`}
                          </p>

                          <p className="text-xs font-semibold text-slate-500">
                            {item.quantity} x{" "}
                            {money(item.unit_price, language, currencySymbol)}
                          </p>
                        </div>

                        <p className="text-sm font-black text-slate-950">
                          {money(item.total, language, currencySymbol)}
                        </p>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={billActionLoading}
                          onClick={() => handleDecreaseBillItem(item)}
                          className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          <Minus className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          disabled={billActionLoading}
                          onClick={() => handleIncreaseBillItem(item)}
                          className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          <Plus className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          disabled={billActionLoading}
                          onClick={() => handleRemoveBillItem(item)}
                          className="flex h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm font-bold text-slate-600">
                  <span>{t("pos.subtotal")}</span>
                  <span>
                    {money(selectedBill?.subtotal, language, currencySymbol)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-sm font-bold text-slate-600">
                  <span>
                    {t("pos.tax")} ({taxPercentage}%)
                  </span>
                  <span>{money(selectedBill?.tax, language, currencySymbol)}</span>
                </div>

                <div className="mt-2 flex items-center justify-between text-sm font-bold text-slate-600">
                  <span>{t("pos.discount")}</span>
                  <span>
                    -{money(selectedBill?.discount, language, currencySymbol)}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3 text-base font-black text-slate-950">
                  <span>{t("pos.total")}</span>
                  <span>
                    {money(selectedBill?.total, language, currencySymbol)}
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={checkoutLoading || billActionLoading || !selectedBill}
                  onClick={() => handleTableCheckout("cash")}
                  className="h-12 rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {t("pos.cash")}
                </button>

                <button
                  type="button"
                  disabled={checkoutLoading || billActionLoading || !selectedBill}
                  onClick={() => handleTableCheckout("card")}
                  className="h-12 rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {t("pos.card")}
                </button>
              </div>

              <button
                type="button"
                disabled={checkoutLoading || billActionLoading || !selectedBill}
                onClick={handleCancelTableBill}
                className="mt-2 h-12 w-full rounded-2xl border border-red-200 bg-red-50 text-sm font-black text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                {t("pos.cancelBill")}
              </button>
            </div>
          ) : (
            <CartPanel
              items={items}
              subtotal={subtotal}
              tax={tax}
              total={total}
              taxPercentage={taxPercentage}
              currencySymbol={currencySymbol}
              onIncrease={increaseQuantity}
              onDecrease={decreaseQuantity}
              onRemove={removeItem}
              onClear={clearCart}
              onCheckout={handleDirectCheckout}
              loading={saving || checkoutLoading}
            />
          )}
        </aside>
      </section>
    </div>
  );
}
