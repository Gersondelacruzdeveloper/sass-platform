// src/modules/ticketing/pages/operations/TicketingBusinessEntitiesPage.tsx

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CircleAlert,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  X,
} from "lucide-react";

import ticketingApi from "../../api/ticketingApi";
import type {
  CreatePayload,
  TicketingBusinessEntity,
  UpdatePayload,
} from "../../types/ticketingTypes";
import type { TicketingDashboardOutletContext } from "../../layouts/TicketingDashboardLayout";

type LoadState = {
  loading: boolean;
  error: string;
};

type EntityFormState = {
  name: string;
  slug: string;
  entity_type: string;
  legal_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_whatsapp: string;
  address: string;
  currency: string;
  settlement_cycle_days: number;
  can_collect_customer_balance: boolean;
  can_scan_tickets: boolean;
  require_check_in_confirmation: boolean;
  allow_partial_admission: boolean;
  allow_offline_scanning: boolean;
  is_active: boolean;
};

const initialFormState: EntityFormState = {
  name: "",
  slug: "",
  entity_type: "partner",
  legal_name: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  contact_whatsapp: "",
  address: "",
  currency: "USD",
  settlement_cycle_days: 10,
  can_collect_customer_balance: false,
  can_scan_tickets: true,
  require_check_in_confirmation: true,
  allow_partial_admission: true,
  allow_offline_scanning: false,
  is_active: true,
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getErrorMessage(error: unknown): string {
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
            name?: string[];
            slug?: string[];
          };
        };
      }
    ).response;

    return (
      response?.data?.detail ||
      response?.data?.message ||
      response?.data?.name?.[0] ||
      response?.data?.slug?.[0] ||
      "Could not save the business entity."
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Could not save the business entity.";
}

function entityTypeLabel(value?: string | null): string {
  return String(value || "partner")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function TicketingBusinessEntitiesPage() {
  const { slug } =
    useOutletContext<TicketingDashboardOutletContext>();

  const [entities, setEntities] = useState<
    TicketingBusinessEntity[]
  >([]);
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: "",
  });

  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] =
    useState<TicketingBusinessEntity | null>(null);
  const [form, setForm] =
    useState<EntityFormState>(initialFormState);
  const [saving, setSaving] = useState(false);
  const [deletingEntityId, setDeletingEntityId] =
    useState<number | null>(null);

  const loadEntities = useCallback(async () => {
    if (!slug) return;

    setState({
      loading: true,
      error: "",
    });

    try {
      const data = await ticketingApi.getBusinessEntities(slug, {
        entity_type: selectedType || undefined,
        is_active:
          selectedStatus === ""
            ? undefined
            : selectedStatus === "active",
        search: search.trim() || undefined,
      });

      setEntities(data);
      setState({
        loading: false,
        error: "",
      });
    } catch (error) {
      setState({
        loading: false,
        error: getErrorMessage(error),
      });
    }
  }, [search, selectedStatus, selectedType, slug]);

  useEffect(() => {
    void loadEntities();
  }, [loadEntities]);

  const summary = useMemo(() => {
    return entities.reduce(
      (accumulator, entity) => {
        accumulator.total += 1;

        if (entity.is_active) {
          accumulator.active += 1;
        }

        if (entity.can_scan_tickets) {
          accumulator.scanners += 1;
        }

        accumulator.users += entity.active_users_count || 0;

        return accumulator;
      },
      {
        total: 0,
        active: 0,
        scanners: 0,
        users: 0,
      },
    );
  }, [entities]);

  function openCreateModal() {
    setEditingEntity(null);
    setForm(initialFormState);
    setModalOpen(true);
  }

  function openEditModal(entity: TicketingBusinessEntity) {
    setEditingEntity(entity);
    setForm({
      name: entity.name || "",
      slug: entity.slug || "",
      entity_type: entity.entity_type || "partner",
      legal_name: entity.legal_name || "",
      contact_name: entity.contact_name || "",
      contact_email: entity.contact_email || "",
      contact_phone: entity.contact_phone || "",
      contact_whatsapp: entity.contact_whatsapp || "",
      address: entity.address || "",
      currency: entity.currency || "USD",
      settlement_cycle_days:
        Number(entity.settlement_cycle_days) || 10,
      can_collect_customer_balance:
        Boolean(entity.can_collect_customer_balance),
      can_scan_tickets: Boolean(entity.can_scan_tickets),
      require_check_in_confirmation:
        Boolean(entity.require_check_in_confirmation),
      allow_partial_admission:
        Boolean(entity.allow_partial_admission),
      allow_offline_scanning:
        Boolean(entity.allow_offline_scanning),
      is_active: Boolean(entity.is_active),
    });
    setModalOpen(true);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const payload = {
      ...form,
      slug: form.slug.trim() || slugify(form.name),
      settlement_cycle_days: Math.max(
        1,
        Number(form.settlement_cycle_days) || 10,
      ),
    };

    setSaving(true);
    setState((current) => ({
      ...current,
      error: "",
    }));

    try {
      if (editingEntity) {
        await ticketingApi.updateBusinessEntity(
          editingEntity.id,
          payload as UpdatePayload<TicketingBusinessEntity>,
          slug,
        );
      } else {
        await ticketingApi.createBusinessEntity(
          payload as CreatePayload<TicketingBusinessEntity>,
          slug,
        );
      }

      setModalOpen(false);
      setEditingEntity(null);
      setForm(initialFormState);
      await loadEntities();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getErrorMessage(error),
      }));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entity: TicketingBusinessEntity) {
    const confirmed = window.confirm(
      `Delete ${entity.name}? This should only be done if it has no operational history.`,
    );

    if (!confirmed) return;

    setDeletingEntityId(entity.id);

    try {
      await ticketingApi.deleteBusinessEntity(entity.id, slug);
      await loadEntities();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getErrorMessage(error),
      }));
    } finally {
      setDeletingEntityId(null);
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
            Operations dashboard
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Building2 className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight">
                Business Entities
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/50">
                Manage venues, operators, partners, drivers and guides.
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
          Add entity
        </button>
      </section>

      {state.error && (
        <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              Business entities could not be processed
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
            Total entities
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {summary.total}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Active entities
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-700">
            {summary.active}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Scanner-enabled
          </p>
          <p className="mt-2 text-2xl font-black text-blue-700">
            {summary.scanners}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Active entity users
          </p>
          <p className="mt-2 text-2xl font-black text-amber-700">
            {summary.users}
          </p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Search
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Name, legal name or contact"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Entity type
            </span>
            <select
              value={selectedType}
              onChange={(event) =>
                setSelectedType(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option value="">All types</option>
              <option value="partner">Partner</option>
              <option value="venue">Venue</option>
              <option value="operator">Operator</option>
              <option value="supplier">Supplier</option>
              <option value="driver_company">
                Driver company
              </option>
              <option value="guide_company">
                Guide company
              </option>
              <option value="event_organizer">
                Event organizer
              </option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Status
            </span>
            <select
              value={selectedStatus}
              onChange={(event) =>
                setSelectedStatus(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => void loadEntities()}
            className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <h2 className="text-xl font-black text-slate-950">
            Entity directory
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            {entities.length} record
            {entities.length === 1 ? "" : "s"}
          </p>
        </div>

        {state.loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-black text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading business entities...
            </div>
          </div>
        ) : entities.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <Building2 className="h-10 w-10 text-slate-300" />
            <p className="mt-4 text-lg font-black text-slate-700">
              No business entities found
            </p>
            <p className="mt-2 max-w-md text-sm font-semibold text-slate-400">
              Add Coco Bongo, a park, tour operator, driver company or another partner.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {entities.map((entity) => (
              <article
                key={entity.id}
                className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                      {entity.entity_type === "venue" ? (
                        <Store className="h-6 w-6" />
                      ) : (
                        <Building2 className="h-6 w-6" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-slate-950">
                        {entity.name}
                      </p>
                      <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-400">
                        {entityTypeLabel(entity.entity_type)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${
                      entity.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {entity.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-lg font-black text-slate-950">
                      {entity.active_agreements_count || 0}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Agreements
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-lg font-black text-slate-950">
                      {entity.active_users_count || 0}
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Users
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm font-semibold text-slate-500">
                  <p>
                    Currency:{" "}
                    <span className="font-black text-slate-800">
                      {entity.currency || "USD"}
                    </span>
                  </p>
                  <p>
                    Settlement cycle:{" "}
                    <span className="font-black text-slate-800">
                      {entity.settlement_cycle_days || 10} days
                    </span>
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {entity.can_scan_tickets && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Scanner
                    </span>
                  )}

                  {entity.allow_partial_admission && (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                      Partial admission
                    </span>
                  )}

                  {entity.allow_offline_scanning && (
                    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                      Offline
                    </span>
                  )}
                </div>

                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <Link
                    to={`/ticketing/${slug}/operations/business-entities/${entity.id}`}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-3 text-xs font-black text-white transition hover:bg-slate-900"
                  >
                    Open
                  </Link>

                  <button
                    type="button"
                    onClick={() => openEditModal(entity)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDelete(entity)}
                    disabled={deletingEntityId === entity.id}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                  >
                    {deletingEntityId === entity.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  {editingEntity
                    ? "Edit business entity"
                    : "Add business entity"}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  Configure operations, scanning and settlement behavior.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setEditingEntity(null);
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
                    Name
                  </span>
                  <input
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                        slug:
                          current.slug ||
                          slugify(event.target.value),
                      }))
                    }
                    required
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Slug
                  </span>
                  <input
                    value={form.slug}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        slug: slugify(event.target.value),
                      }))
                    }
                    required
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Entity type
                  </span>
                  <select
                    value={form.entity_type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        entity_type: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  >
                    <option value="partner">Partner</option>
                    <option value="venue">Venue</option>
                    <option value="operator">Operator</option>
                    <option value="supplier">Supplier</option>
                    <option value="driver_company">
                      Driver company
                    </option>
                    <option value="guide_company">
                      Guide company
                    </option>
                    <option value="event_organizer">
                      Event organizer
                    </option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Legal name
                  </span>
                  <input
                    value={form.legal_name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        legal_name: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Contact name
                  </span>
                  <input
                    value={form.contact_name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contact_name: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Contact email
                  </span>
                  <input
                    type="email"
                    value={form.contact_email}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contact_email: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Phone
                  </span>
                  <input
                    value={form.contact_phone}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contact_phone: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    WhatsApp
                  </span>
                  <input
                    value={form.contact_whatsapp}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        contact_whatsapp: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Address
                </span>
                <textarea
                  value={form.address}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Currency
                  </span>
                  <input
                    value={form.currency}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        currency: event.target.value.toUpperCase(),
                      }))
                    }
                    maxLength={10}
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-black uppercase text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Settlement cycle days
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
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["can_scan_tickets", "Can scan tickets"],
                  [
                    "can_collect_customer_balance",
                    "Can collect customer balance",
                  ],
                  [
                    "require_check_in_confirmation",
                    "Require admission confirmation",
                  ],
                  [
                    "allow_partial_admission",
                    "Allow partial admission",
                  ],
                  [
                    "allow_offline_scanning",
                    "Allow offline scanning",
                  ],
                  ["is_active", "Entity is active"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4"
                  >
                    <span className="text-sm font-black text-slate-700">
                      {label}
                    </span>
                    <input
                      type="checkbox"
                      checked={Boolean(
                        form[key as keyof EntityFormState],
                      )}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [key]: event.target.checked,
                        }))
                      }
                      className="h-5 w-5 rounded border-slate-300"
                    />
                  </label>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditingEntity(null);
                  }}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {editingEntity ? "Save changes" : "Create entity"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
