// src/modules/ticketing/pages/operations/TicketingBusinessAgreementsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CircleAlert,
  Edit3,
  Handshake,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { useTicketingAdminTranslation } from "../../admin-i18n/useTicketingAdminTranslation";
import ticketingApi from "../../api/ticketingApi";
import type {
  CreatePayload,
  ExperienceProduct,
  ProductBusinessAgreement,
  TicketingBusinessEntity,
  UpdatePayload,
} from "../../types/ticketingTypes";
import type { TicketingDashboardOutletContext } from "../../layouts/TicketingDashboardLayout";

type LoadState = {
  loading: boolean;
  error: string;
};

type AgreementFormState = {
  business_entity_id: number | "";
  product_id: number | "";
  name: string;
  version: number;
  agreement_type: string;
  settlement_basis: string;
  collection_mode: string;
  partner_fixed_amount: string;
  partner_percentage: string;
  platform_fixed_amount: string;
  platform_percentage: string;
  seller_commission_included: boolean;
  settlement_cycle_days: number;
  payment_due_days: number;
  currency: string;
  effective_from: string;
  effective_until: string;
  terms: string;
  is_active: boolean;
};

const initialFormState: AgreementFormState = {
  business_entity_id: "",
  product_id: "",
  name: "",
  version: 1,
  agreement_type: "percentage_split",
  settlement_basis: "confirmed_booking",
  collection_mode: "platform_collects",
  partner_fixed_amount: "0.00",
  partner_percentage: "0.00",
  platform_fixed_amount: "0.00",
  platform_percentage: "0.00",
  seller_commission_included: false,
  settlement_cycle_days: 10,
  payment_due_days: 0,
  currency: "USD",
  effective_from: new Date().toISOString().slice(0, 10),
  effective_until: "",
  terms: "",
  is_active: true,
};

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            detail?: string;
            message?: string;
            non_field_errors?: string[];
          };
        };
      }
    ).response;

    return (
      response?.data?.detail ||
      response?.data?.message ||
      response?.data?.non_field_errors?.[0] ||
      fallback
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function formatAgreementValue(
  value: string | null | undefined,
  prefix: string,
  t: (
    key: string,
    values?: Record<string, string | number | boolean | null | undefined>,
    fallback?: string,
  ) => string,
): string {
  const normalized = String(value || "");

  return t(
    `${prefix}.${normalized}`,
    undefined,
    normalized
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase()),
  );
}

function formatMoney(
  value: string | number | null | undefined,
  currency = "USD",
  language: "en" | "es" = "en",
): string {
  const amount = Number(value ?? 0);

  return new Intl.NumberFormat(
    language === "es" ? "es-DO" : "en-US",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    },
  ).format(Number.isFinite(amount) ? amount : 0);
}

export default function TicketingBusinessAgreementsPage() {
  const { language, t } = useTicketingAdminTranslation();
  const { slug } =
    useOutletContext<TicketingDashboardOutletContext>();

  const [agreements, setAgreements] = useState<
    ProductBusinessAgreement[]
  >([]);
  const [entities, setEntities] = useState<
    TicketingBusinessEntity[]
  >([]);
  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: "",
  });

  const [search, setSearch] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<
    number | ""
  >("");
  const [selectedProductId, setSelectedProductId] = useState<
    number | ""
  >("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAgreement, setEditingAgreement] =
    useState<ProductBusinessAgreement | null>(null);
  const [form, setForm] =
    useState<AgreementFormState>(initialFormState);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(
    null,
  );

  const loadData = useCallback(async () => {
    if (!slug) return;

    setState({
      loading: true,
      error: "",
    });

    try {
      const [agreementData, entityData, productData] =
        await Promise.all([
          ticketingApi.getBusinessAgreements(slug, {
            business_entity: selectedEntityId || undefined,
            product: selectedProductId || undefined,
            is_active:
              selectedStatus === ""
                ? undefined
                : selectedStatus === "active",
          }),
          ticketingApi.getBusinessEntities(slug, {
            is_active: true,
          }),
          ticketingApi.getProducts(slug),
        ]);

      setAgreements(agreementData);
      setEntities(entityData);
      setProducts(productData);
      setState({
        loading: false,
        error: "",
      });
    } catch (error) {
      setState({
        loading: false,
        error: getErrorMessage(error, t("businessAgreements.errors.save")),
      });
    }
  }, [
    selectedEntityId,
    selectedProductId,
    selectedStatus,
    slug,
    t,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredAgreements = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (!needle) return agreements;

    return agreements.filter((agreement) => {
      const haystack = [
        agreement.name,
        agreement.product_name,
        agreement.business_entity_name,
        agreement.agreement_type,
        agreement.settlement_basis,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [agreements, search]);

  const summary = useMemo(() => {
    return filteredAgreements.reduce(
      (accumulator, agreement) => {
        accumulator.total += 1;
        if (agreement.is_active) accumulator.active += 1;
        if (agreement.settlement_basis === "checked_in") {
          accumulator.checkedIn += 1;
        }
        if (agreement.collection_mode === "partner_collects") {
          accumulator.partnerCollects += 1;
        }
        return accumulator;
      },
      {
        total: 0,
        active: 0,
        checkedIn: 0,
        partnerCollects: 0,
      },
    );
  }, [filteredAgreements]);

  function openCreateModal() {
    setEditingAgreement(null);
    setForm(initialFormState);
    setModalOpen(true);
  }

  function openEditModal(
    agreement: ProductBusinessAgreement,
  ) {
    setEditingAgreement(agreement);
    setForm({
      business_entity_id: agreement.business_entity,
      product_id: agreement.product,
      name: agreement.name || "",
      version: Number(agreement.version) || 1,
      agreement_type:
        agreement.agreement_type || "percentage_split",
      settlement_basis:
        agreement.settlement_basis || "confirmed_booking",
      collection_mode:
        agreement.collection_mode || "platform_collects",
      partner_fixed_amount: String(
        agreement.partner_fixed_amount ?? "0.00",
      ),
      partner_percentage: String(
        agreement.partner_percentage ?? "0.00",
      ),
      platform_fixed_amount: String(
        agreement.platform_fixed_amount ?? "0.00",
      ),
      platform_percentage: String(
        agreement.platform_percentage ?? "0.00",
      ),
      seller_commission_included: Boolean(
        agreement.seller_commission_included,
      ),
      settlement_cycle_days:
        Number(agreement.settlement_cycle_days) || 10,
      payment_due_days:
        Number(agreement.payment_due_days) || 0,
      currency: agreement.currency || "USD",
      effective_from: agreement.effective_from || "",
      effective_until: agreement.effective_until || "",
      terms: agreement.terms || "",
      is_active: Boolean(agreement.is_active),
    });
    setModalOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!form.business_entity_id || !form.product_id) {
      setState((current) => ({
        ...current,
        error: t("businessAgreements.errors.selectEntityAndProduct"),
      }));
      return;
    }

    const payload = {
      business_entity_id: Number(form.business_entity_id),
      product_id: Number(form.product_id),
      name: form.name.trim(),
      version: Math.max(1, Number(form.version) || 1),
      agreement_type: form.agreement_type,
      settlement_basis: form.settlement_basis,
      collection_mode: form.collection_mode,
      partner_fixed_amount: form.partner_fixed_amount || "0.00",
      partner_percentage: form.partner_percentage || "0.00",
      platform_fixed_amount:
        form.platform_fixed_amount || "0.00",
      platform_percentage:
        form.platform_percentage || "0.00",
      seller_commission_included:
        form.seller_commission_included,
      settlement_cycle_days: Math.max(
        1,
        Number(form.settlement_cycle_days) || 10,
      ),
      payment_due_days: Math.max(
        0,
        Number(form.payment_due_days) || 0,
      ),
      currency: form.currency.trim().toUpperCase() || "USD",
      effective_from: form.effective_from,
      effective_until: form.effective_until || null,
      terms: form.terms,
      is_active: form.is_active,
    };

    setSaving(true);
    setState((current) => ({
      ...current,
      error: "",
    }));

    try {
      if (editingAgreement) {
        await ticketingApi.updateBusinessAgreement(
          editingAgreement.id,
          payload as UpdatePayload<ProductBusinessAgreement>,
          slug,
        );
      } else {
        await ticketingApi.createBusinessAgreement(
          payload as CreatePayload<ProductBusinessAgreement> & {
            business_entity_id: number;
            product_id: number;
          },
          slug,
        );
      }

      setModalOpen(false);
      setEditingAgreement(null);
      setForm(initialFormState);
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getErrorMessage(error, t("businessAgreements.errors.save")),
      }));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(
    agreement: ProductBusinessAgreement,
  ) {
    const confirmed = window.confirm(
      t("businessAgreements.confirm.delete", {
        name: agreement.name,
      }),
    );

    if (!confirmed) return;

    setDeletingId(agreement.id);

    try {
      await ticketingApi.deleteBusinessAgreement(
        agreement.id,
        slug,
      );
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getErrorMessage(error, t("businessAgreements.errors.save")),
      }));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-[2rem] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            to={`/ticketing/${slug}/operations/dashboard`}
            className="mb-4 inline-flex items-center gap-2 text-sm font-black text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("businessAgreements.navigation.operationsDashboard")}
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Handshake className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight">
                {t("businessAgreements.title")}
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/50">
                {t("businessAgreements.subtitle")}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-slate-100"
        >
          <Plus className="h-4 w-4" />
          {t("businessAgreements.actions.add")}
        </button>
      </section>

      {state.error && (
        <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              {t("businessAgreements.errors.title")}
            </p>
            <p className="mt-1 text-sm font-semibold text-rose-700">
              {state.error}
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("businessAgreements.stats.total")}
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {summary.total}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("businessAgreements.stats.active")}
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-700">
            {summary.active}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("businessAgreements.stats.checkedIn")}
          </p>
          <p className="mt-2 text-2xl font-black text-blue-700">
            {summary.checkedIn}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("businessAgreements.stats.partnerCollects")}
          </p>
          <p className="mt-2 text-2xl font-black text-amber-700">
            {summary.partnerCollects}
          </p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("businessAgreements.filters.search")}
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder={t("businessAgreements.filters.searchPlaceholder")}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("businessAgreements.filters.businessEntity")}
            </span>
            <select
              value={selectedEntityId}
              onChange={(event) =>
                setSelectedEntityId(
                  event.target.value
                    ? Number(event.target.value)
                    : "",
                )
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option value="">{t("businessAgreements.filters.allEntities")}</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("businessAgreements.filters.product")}
            </span>
            <select
              value={selectedProductId}
              onChange={(event) =>
                setSelectedProductId(
                  event.target.value
                    ? Number(event.target.value)
                    : "",
                )
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option value="">{t("businessAgreements.filters.allProducts")}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("businessAgreements.filters.status")}
            </span>
            <select
              value={selectedStatus}
              onChange={(event) =>
                setSelectedStatus(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option value="">{t("businessAgreements.filters.allStatuses")}</option>
              <option value="active">{t("businessAgreements.statuses.active")}</option>
              <option value="inactive">{t("businessAgreements.statuses.inactive")}</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => void loadData()}
            className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            {t("businessAgreements.actions.refresh")}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <h2 className="text-xl font-black text-slate-950">
            {t("businessAgreements.directory.title")}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            {t(
              filteredAgreements.length === 1
                ? "businessAgreements.directory.oneRecord"
                : "businessAgreements.directory.records",
              { count: filteredAgreements.length },
            )}
          </p>
        </div>

        {state.loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-black text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("businessAgreements.loading")}
            </div>
          </div>
        ) : filteredAgreements.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <Handshake className="h-10 w-10 text-slate-300" />
            <p className="mt-4 text-lg font-black text-slate-700">
              {t("businessAgreements.empty.title")}
            </p>
            <p className="mt-2 max-w-md text-sm font-semibold text-slate-400">
              {t("businessAgreements.empty.description")}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {filteredAgreements.map((agreement) => (
              <article
                key={agreement.id}
                className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-slate-950">
                      {agreement.name ||
                        agreement.product_name}
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-slate-500">
                      {agreement.product_name}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                      agreement.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {agreement.is_active
                      ? t("businessAgreements.statuses.active")
                      : t("businessAgreements.statuses.inactive")}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-600">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  {agreement.business_entity_name}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      {t("businessAgreements.labels.agreementType")}
                    </p>
                    <p className="mt-2 font-black text-slate-900">
                      {formatAgreementValue(
                        agreement.agreement_type,
                        "businessAgreements.agreementTypes",
                        t,
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      {t("businessAgreements.labels.settlementBasis")}
                    </p>
                    <p className="mt-2 font-black text-slate-900">
                      {formatAgreementValue(
                        agreement.settlement_basis,
                        "businessAgreements.settlementBasis",
                        t,
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      {t("businessAgreements.labels.partnerShare")}
                    </p>
                    <p className="mt-2 font-black text-slate-900">
                      {Number(agreement.partner_percentage) > 0
                        ? `${agreement.partner_percentage}%`
                        : formatMoney(
                            agreement.partner_fixed_amount,
                            agreement.currency,
                            language,
                          )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      {t("businessAgreements.labels.platformShare")}
                    </p>
                    <p className="mt-2 font-black text-slate-900">
                      {Number(agreement.platform_percentage) > 0
                        ? `${agreement.platform_percentage}%`
                        : formatMoney(
                            agreement.platform_fixed_amount,
                            agreement.currency,
                            language,
                          )}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                    {formatAgreementValue(
                      agreement.collection_mode,
                      "businessAgreements.collectionModes",
                      t,
                    )}
                  </span>

                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                    v{agreement.version}
                  </span>

                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    {t("businessAgreements.labels.days", {
                      count: agreement.settlement_cycle_days,
                    })}
                  </span>
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      openEditModal(agreement)
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                  >
                    <Edit3 className="h-4 w-4" />
                    {t("businessAgreements.actions.edit")}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void handleDelete(agreement)
                    }
                    disabled={deletingId === agreement.id}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    {deletingId === agreement.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {t("businessAgreements.actions.delete")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  {editingAgreement
                    ? t("businessAgreements.modal.editTitle")
                    : t("businessAgreements.modal.addTitle")}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  {t("businessAgreements.modal.subtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingAgreement(null);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-6 p-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Business entity
                  </span>
                  <select
                    value={form.business_entity_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        business_entity_id:
                          Number(event.target.value) || "",
                      }))
                    }
                    required
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  >
                    <option value="">{t("businessAgreements.form.selectEntity")}</option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Product
                  </span>
                  <select
                    value={form.product_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        product_id:
                          Number(event.target.value) || "",
                      }))
                    }
                    required
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  >
                    <option value="">{t("businessAgreements.form.selectProduct")}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("businessAgreements.form.name")}
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("businessAgreements.form.version")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={form.version}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        version:
                          Number(event.target.value) || 1,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Agreement type
                  </span>
                  <select
                    value={form.agreement_type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        agreement_type: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  >
                    <option value="fixed_partner_net">
                      {t("businessAgreements.agreementTypes.fixed_partner_net")}
                    </option>
                    <option value="percentage_split">
                      {t("businessAgreements.agreementTypes.percentage_split")}
                    </option>
                    <option value="fixed_platform_commission">
                      {t("businessAgreements.agreementTypes.fixed_platform_commission")}
                    </option>
                    <option value="percentage_platform_commission">
                      {t("businessAgreements.agreementTypes.percentage_platform_commission")}
                    </option>
                    <option value="custom">
                      {t("businessAgreements.agreementTypes.custom")}
                    </option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Settlement basis
                  </span>
                  <select
                    value={form.settlement_basis}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        settlement_basis:
                          event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  >
                    <option value="confirmed_booking">
                      {t("businessAgreements.settlementBasis.confirmed_booking")}
                    </option>
                    <option value="checked_in">
                      {t("businessAgreements.settlementBasis.checked_in")}
                    </option>
                    <option value="fully_paid_booking">
                      {t("businessAgreements.settlementBasis.fully_paid_booking")}
                    </option>
                    <option value="provider_confirmation">
                      {t("businessAgreements.settlementBasis.provider_confirmation")}
                    </option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("businessAgreements.form.collectionMode")}
                  </span>
                  <select
                    value={form.collection_mode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        collection_mode: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  >
                    <option value="platform_collects">
                      {t("businessAgreements.collectionModes.platform_collects")}
                    </option>
                    <option value="partner_collects">
                      {t("businessAgreements.collectionModes.partner_collects")}
                    </option>
                    <option value="seller_collects">
                      {t("businessAgreements.collectionModes.seller_collects")}
                    </option>
                    <option value="customer_pays_partner">
                      {t("businessAgreements.collectionModes.customer_pays_partner")}
                    </option>
                    <option value="mixed">
                      {t("businessAgreements.collectionModes.mixed")}
                    </option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  [
                    "partner_fixed_amount",
                    t("businessAgreements.form.partnerFixedAmount"),
                  ],
                  [
                    "partner_percentage",
                    t("businessAgreements.form.partnerPercentage"),
                  ],
                  [
                    "platform_fixed_amount",
                    t("businessAgreements.form.platformFixedAmount"),
                  ],
                  [
                    "platform_percentage",
                    t("businessAgreements.form.platformPercentage"),
                  ],
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="mb-2 block text-sm font-black text-slate-700">
                      {label}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={
                        key.includes("percentage")
                          ? "100"
                          : undefined
                      }
                      value={
                        form[key as keyof AgreementFormState] as string
                      }
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                    />
                  </label>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("businessAgreements.form.currency")}
                  </span>
                  <input
                    value={form.currency}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        currency:
                          event.target.value.toUpperCase(),
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-black uppercase text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("businessAgreements.form.settlementCycle")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={form.settlement_cycle_days}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        settlement_cycle_days:
                          Number(event.target.value) || 10,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("businessAgreements.form.paymentDueDays")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={form.payment_due_days}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        payment_due_days:
                          Number(event.target.value) || 0,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                  <span className="text-sm font-black text-slate-700">
                    {t("businessAgreements.form.sellerCommissionIncluded")}
                  </span>
                  <input
                    type="checkbox"
                    checked={
                      form.seller_commission_included
                    }
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        seller_commission_included:
                          event.target.checked,
                      }))
                    }
                    className="h-5 w-5 rounded border-slate-300"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("businessAgreements.form.effectiveFrom")}
                  </span>
                  <input
                    type="date"
                    value={form.effective_from}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        effective_from: event.target.value,
                      }))
                    }
                    required
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("businessAgreements.form.effectiveUntil")}
                  </span>
                  <input
                    type="date"
                    value={form.effective_until}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        effective_until: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  {t("businessAgreements.form.terms")}
                </span>
                <textarea
                  value={form.terms}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      terms: event.target.value,
                    }))
                  }
                  rows={5}
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                <span className="text-sm font-black text-slate-700">
                  {t("businessAgreements.form.isActive")}
                </span>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      is_active: event.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditingAgreement(null);
                  }}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  {t("businessAgreements.actions.cancel")}
                </button>

                <button
                  type="submit"
                  disabled={
                    saving ||
                    !form.name.trim() ||
                    !form.business_entity_id ||
                    !form.product_id
                  }
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {editingAgreement
                    ? t("businessAgreements.actions.saveChanges")
                    : t("businessAgreements.actions.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
