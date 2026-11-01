import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";
import {
  Check,
  Clipboard,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  Save,
  Store as StoreIcon,
} from "lucide-react";

import {
  createStorefrontConfiguration,
  getStorefrontConfigurations,
  updateStorefrontConfiguration,
} from "../api/storefrontAdminClient";
import type {
  SaveStorefrontPayload,
  StorefrontConfiguration,
} from "../api/storefrontAdminClient";
import type { Store } from "../types/colmado";

interface StorefrontSettingsPanelProps {
  organisationSlug: string;
  store: Store;
}

interface StorefrontForm {
  slug: string;
  displayName: string;
  description: string;
  publicPhone: string;
  publicAddress: string;
  deliveryFee: string;
  minimumOrder: string;
  isAcceptingOrders: boolean;
  isActive: boolean;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function initialForm(store: Store): StorefrontForm {
  return {
    slug: slugify(store.name),
    displayName: store.name,
    description: "Haz tu pedido fácil y rápido.",
    publicPhone: store.phone || "",
    publicAddress: store.address || "",
    deliveryFee: "0.00",
    minimumOrder: "0.00",
    isAcceptingOrders: true,
    isActive: true,
  };
}

function formFromConfiguration(
  configuration: StorefrontConfiguration,
): StorefrontForm {
  return {
    slug: configuration.slug,
    displayName: configuration.display_name,
    description: configuration.description,
    publicPhone: configuration.public_phone,
    publicAddress: configuration.public_address,
    deliveryFee: configuration.delivery_fee,
    minimumOrder: configuration.minimum_order,
    isAcceptingOrders: configuration.is_accepting_orders,
    isActive: configuration.is_active,
  };
}

function errorMessage(error: unknown): string {
  const fallback = "No pudimos guardar la configuración. Intenta nuevamente.";

  if (!error || typeof error !== "object") {
    return fallback;
  }

  const data = (
    error as { response?: { data?: unknown } }
  ).response?.data;

  if (typeof data === "string" && data.trim()) {
    return data;
  }
  if (!data || typeof data !== "object") {
    return fallback;
  }

  for (const value of Object.values(data as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
  }

  return fallback;
}

export default function StorefrontSettingsPanel({
  organisationSlug,
  store,
}: StorefrontSettingsPanelProps) {
  const [configuration, setConfiguration] =
    useState<StorefrontConfiguration | null>(null);
  const [form, setForm] = useState<StorefrontForm>(() => initialForm(store));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setMessage("");
    setConfiguration(null);
    setForm(initialForm(store));

    void getStorefrontConfigurations(organisationSlug)
      .then((configurations) => {
        if (!active) {
          return;
        }

        const selected = configurations.find(
          (item) => item.store === store.id,
        ) || null;
        setConfiguration(selected);
        setForm(selected ? formFromConfiguration(selected) : initialForm(store));
      })
      .catch((loadError) => {
        if (active) {
          setError(errorMessage(loadError));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [organisationSlug, store]);

  const publicUrl = useMemo(() => {
    if (!configuration?.slug) {
      return "";
    }
    return `${window.location.origin}/pedir/${configuration.slug}`;
  }, [configuration?.slug]);

  function updateForm<K extends keyof StorefrontForm>(
    field: K,
    value: StorefrontForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setMessage("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedSlug = slugify(form.slug);
    if (!normalizedSlug || !form.displayName.trim()) {
      setError("Escribe el nombre público y la dirección del enlace.");
      return;
    }

    const payload: SaveStorefrontPayload = {
      store: store.id,
      slug: normalizedSlug,
      display_name: form.displayName.trim(),
      description: form.description.trim(),
      public_phone: form.publicPhone.trim(),
      public_address: form.publicAddress.trim(),
      delivery_fee: form.deliveryFee || "0.00",
      minimum_order: form.minimumOrder || "0.00",
      is_accepting_orders: form.isAcceptingOrders,
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      const saved = configuration
        ? await updateStorefrontConfiguration(
            organisationSlug,
            configuration.id,
            payload,
          )
        : await createStorefrontConfiguration(organisationSlug, payload);

      setConfiguration(saved);
      setForm(formFromConfiguration(saved));
      setMessage(
        configuration
          ? "Configuración actualizada."
          : "Tu tienda pública está lista.",
      );
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function copyPublicUrl() {
    if (!publicUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No pudimos copiar el enlace. Puedes seleccionarlo manualmente.");
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-72 place-items-center rounded-3xl bg-white p-6 shadow-sm">
        <div className="text-center text-slate-700" role="status">
          <LoaderCircle className="mx-auto animate-spin text-emerald-700" size={38} />
          <p className="mt-3 font-black">Cargando pedidos en línea...</p>
        </div>
      </div>
    );
  }

  const whatsappUrl = publicUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `Haz tu pedido en ${form.displayName}: ${publicUrl}`,
      )}`
    : "";

  return (
    <section className="space-y-5" aria-labelledby="storefront-settings-title">
      <header>
        <p className="text-sm font-black text-emerald-700">{store.name}</p>
        <h1 className="text-2xl font-black text-slate-950" id="storefront-settings-title">
          Pedidos en línea
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Configura el enlace que compartirás con tus clientes.
        </p>
      </header>

      {configuration && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StoreIcon className="text-emerald-700" size={22} />
                <p className="font-black text-emerald-950">
                  {configuration.is_active ? "Tienda publicada" : "Tienda oculta"}
                </p>
              </div>
              <input
                aria-label="Enlace público"
                className="mt-3 w-full min-w-0 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-700"
                readOnly
                value={publicUrl}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 font-black text-white"
                onClick={() => void copyPublicUrl()}
                type="button"
              >
                {copied ? <Check size={18} /> : <Clipboard size={18} />}
                {copied ? "Copiado" : "Copiar enlace"}
              </button>
              <a
                className="flex min-h-11 items-center gap-2 rounded-xl border border-emerald-700 bg-white px-4 font-black text-emerald-800"
                href={whatsappUrl}
                rel="noreferrer"
                target="_blank"
              >
                <MessageCircle size={18} /> Compartir
              </a>
              <a
                className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-black text-slate-800"
                href={publicUrl}
                rel="noreferrer"
                target="_blank"
              >
                <ExternalLink size={18} /> Ver tienda
              </a>
            </div>
          </div>
        </div>
      )}

      <form className="space-y-5 rounded-3xl bg-white p-5 shadow-sm sm:p-7" onSubmit={save}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">
            Nombre público *
            <input
              className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-emerald-600"
              onChange={(event) => updateForm("displayName", event.target.value)}
              value={form.displayName}
            />
          </label>
          <label className="text-sm font-bold text-slate-700">
            Enlace del colmado *
            <div className="mt-1 flex min-h-12 items-center rounded-xl border border-slate-300 bg-white focus-within:border-emerald-600">
              <span className="pl-3 text-sm text-slate-500">/pedir/</span>
              <input
                className="min-w-0 flex-1 bg-transparent px-1 pr-3 font-normal outline-none"
                onChange={(event) => updateForm("slug", slugify(event.target.value))}
                value={form.slug}
              />
            </div>
          </label>
        </div>

        <label className="block text-sm font-bold text-slate-700">
          Mensaje para tus clientes
          <textarea
            className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-emerald-600"
            onChange={(event) => updateForm("description", event.target.value)}
            value={form.description}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">
            Teléfono público
            <input
              className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-emerald-600"
              inputMode="tel"
              onChange={(event) => updateForm("publicPhone", event.target.value)}
              value={form.publicPhone}
            />
          </label>
          <label className="text-sm font-bold text-slate-700">
            Dirección pública
            <input
              className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-emerald-600"
              onChange={(event) => updateForm("publicAddress", event.target.value)}
              value={form.publicAddress}
            />
          </label>
          <label className="text-sm font-bold text-slate-700">
            Costo de entrega (RD$)
            <input
              className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-emerald-600"
              inputMode="decimal"
              min="0"
              onChange={(event) => updateForm("deliveryFee", event.target.value)}
              step="0.01"
              type="number"
              value={form.deliveryFee}
            />
          </label>
          <label className="text-sm font-bold text-slate-700">
            Pedido mínimo (RD$)
            <input
              className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-emerald-600"
              inputMode="decimal"
              min="0"
              onChange={(event) => updateForm("minimumOrder", event.target.value)}
              step="0.01"
              type="number"
              value={form.minimumOrder}
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              checked={form.isActive}
              className="mt-1 h-5 w-5 accent-emerald-700"
              onChange={(event) => updateForm("isActive", event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong className="block text-slate-950">Publicar tienda</strong>
              <span className="text-sm text-slate-600">Permite abrir el enlace público.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
            <input
              checked={form.isAcceptingOrders}
              className="mt-1 h-5 w-5 accent-emerald-700"
              onChange={(event) => updateForm("isAcceptingOrders", event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong className="block text-slate-950">Recibir pedidos ahora</strong>
              <span className="text-sm text-slate-600">Desactívalo cuando el colmado esté cerrado.</span>
            </span>
          </label>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800" role="status">
            {message}
          </p>
        )}

        <button
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white disabled:bg-slate-300 sm:w-auto"
          disabled={saving}
          type="submit"
        >
          {saving ? <LoaderCircle className="animate-spin" size={19} /> : <Save size={19} />}
          {saving
            ? "Guardando..."
            : configuration
              ? "Guardar cambios"
              : "Crear tienda pública"}
        </button>
      </form>
    </section>
  );
}
