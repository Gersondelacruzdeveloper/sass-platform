// src/modules/ticketing/pages/TicketingInstallPage.tsx

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, Share2, Smartphone } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";

import api from "../../../api/axios";

type Branding = {
  company_name?: string;
  platform_name?: string;
  logo?: string | null;
  logo_url?: string | null;
  primary_color?: string;
  accent_color?: string;
};

function getApiBaseUrl() {
  return (
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api"
  );
}

function resolveImageUrl(url?: string | null) {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  const apiOrigin = getApiBaseUrl().replace(/\/api\/?$/, "");
  return `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export default function TicketingInstallPage() {
  const { organisationSlug = "" } = useParams<{
    organisationSlug: string;
  }>();

  const [branding, setBranding] = useState<Branding | null>(null);

  const manifestUrl = useMemo(() => {
    if (!organisationSlug) return "";
    return `${getApiBaseUrl()}/organisations/public-manifest/ticketing/${organisationSlug}/manifest.json`;
  }, [organisationSlug]);

  useEffect(() => {
    if (!organisationSlug || typeof document === "undefined") return;

    window.localStorage.setItem("last_ticketing_slug", organisationSlug);

    let manifest = document.querySelector<HTMLLinkElement>(
      "link[rel='manifest']",
    );

    if (!manifest) {
      manifest = document.createElement("link");
      manifest.rel = "manifest";
      document.head.appendChild(manifest);
    }

    manifest.href = manifestUrl;
    manifest.setAttribute("crossorigin", "use-credentials");

    void api
      .get<Branding>(
        `/organisations/public-branding/ticketing/${organisationSlug}/`,
      )
      .then((response) => {
        const data = response.data;
        setBranding(data);

        const title =
          data.company_name ||
          data.platform_name ||
          organisationSlug;

        document.title = title;

        const iconUrl = resolveImageUrl(
          data.logo_url || data.logo,
        );

        if (iconUrl) {
          let appleIcon =
            document.querySelector<HTMLLinkElement>(
              "link[rel='apple-touch-icon']",
            );

          if (!appleIcon) {
            appleIcon = document.createElement("link");
            appleIcon.rel = "apple-touch-icon";
            document.head.appendChild(appleIcon);
          }

          appleIcon.href = iconUrl;
        }
      })
      .catch(() => {
        setBranding(null);
      });
  }, [manifestUrl, organisationSlug]);

  if (!organisationSlug) {
    return <Navigate to="/ticketing" replace />;
  }

  if (isStandaloneMode()) {
    return (
      <Navigate
        to={`/ticketing/${organisationSlug}/launch`}
        replace
      />
    );
  }

  const organisationName =
    branding?.company_name ||
    branding?.platform_name ||
    organisationSlug;

  const logoUrl = resolveImageUrl(
    branding?.logo_url || branding?.logo,
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 sm:px-6">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex items-center justify-between gap-4">
          <Link
            to={`/ticketing/${organisationSlug}/seller/dashboard`}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>

          <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
            Instalar aplicación
          </span>
        </div>

        <section className="mt-8 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <div className="flex flex-col items-center text-center">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={organisationName}
                className="h-24 w-24 rounded-[1.75rem] border border-slate-200 bg-white object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-[1.75rem] bg-slate-950 text-white">
                <Smartphone className="h-10 w-10" />
              </div>
            )}

            <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-amber-600">
              {organisationName}
            </p>

            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Instala esta aplicación en tu iPhone
            </h1>

            <p className="mt-4 max-w-md text-sm font-semibold leading-6 text-slate-500">
              Mantén esta página abierta en Safari mientras agregas la
              aplicación. Esta dirección pertenece específicamente a tu
              organización.
            </p>
          </div>

          <div className="mt-7 rounded-3xl bg-slate-50 p-5">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                <Share2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-black">1. Pulsa Compartir en Safari</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Usa el botón cuadrado con la flecha hacia arriba.
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <p className="font-black">2. Pulsa “Agregar a pantalla de inicio”</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Deja activada la opción para abrirla como aplicación si
                  Safari la muestra.
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <p className="font-black">3. Pulsa Agregar</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  Al abrir el icono instalado, la aplicación conservará esta
                  organización y te enviará al portal correcto.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-center">
            <p className="text-xs font-black uppercase tracking-wide text-amber-700">
              Dirección de instalación
            </p>
            <p className="mt-1 break-all text-xs font-semibold text-amber-900">
              /ticketing/{organisationSlug}/install
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
