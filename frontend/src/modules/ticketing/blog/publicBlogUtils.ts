// src/modules/ticketing/blog/publicBlogUtils.ts

import { useEffect, useMemo, useState } from "react";

export type PublicTicketingDomainResolution = {
  organisation_id: number;
  organisation_slug: string;
  organisation_name: string;
  business_type?: string;
  public_domain: string;
  public_base_url: string;
  is_published: boolean;
  domain_status?: string;
};

export type PublicTheme = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  button: string;
  text: string;
  muted: string;
  card: string;
};

const PLATFORM_HOSTS = [
  "localhost",
  "127.0.0.1",
  "app.puntacanadiscovery.com",
];

export function getApiBaseUrl() {
  return (
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api"
  );
}

export function getApiOrigin() {
  return getApiBaseUrl().replace(/\/api\/?$/, "");
}

export function getCurrentHostname() {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

export function isPlatformHost(hostname = getCurrentHostname()) {
  return PLATFORM_HOSTS.includes(hostname);
}

export function isCustomTicketingDomain(hostname = getCurrentHostname()) {
  return Boolean(hostname) && !isPlatformHost(hostname);
}

export function resolveAssetUrl(url?: string | null) {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  return `${getApiOrigin()}${url.startsWith("/") ? "" : "/"}${url}`;
}

export function getPublicTheme(publicSite: any): PublicTheme {
  return {
    primary: publicSite?.primary_color || "#111827",
    secondary: publicSite?.secondary_color || "#3092B5",
    accent: publicSite?.accent_color || "#F59E0B",
    background: publicSite?.background_color || "#F8FAFC",
    button: publicSite?.button_color || publicSite?.primary_color || "#111827",
    text: publicSite?.text_color || "#111827",
    muted: publicSite?.muted_text_color || "#64748B",
    card: publicSite?.card_background_color || "#FFFFFF",
  };
}

export function buildPublicPath(
  organisationSlug: string,
  customDomain: boolean,
  path = "/",
) {
  const cleanPath = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;

  if (customDomain) {
    return cleanPath || "/";
  }

  return `/experiences/${organisationSlug}${cleanPath}`;
}

export function formatBlogDate(value?: string | null, language = "en") {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(language, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function setMetaTag(
  selector: string,
  attributes: Record<string, string>,
  content: string,
) {
  if (typeof document === "undefined" || !content) return;

  let meta = document.querySelector(selector) as HTMLMetaElement | null;

  if (!meta) {
    meta = document.createElement("meta");
    Object.entries(attributes).forEach(([key, value]) => {
      meta?.setAttribute(key, value);
    });
    document.head.appendChild(meta);
  }

  meta.content = content;
}

export function setCanonicalLink(url: string) {
  if (typeof document === "undefined" || !url) return;

  let link = document.querySelector(
    'link[rel="canonical"]',
  ) as HTMLLinkElement | null;

  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }

  link.href = url;
}

export function setRobotsMeta(allowIndexing: boolean) {
  if (typeof document === "undefined") return;

  let meta = document.querySelector(
    'meta[name="robots"]',
  ) as HTMLMetaElement | null;

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "robots";
    document.head.appendChild(meta);
  }

  meta.content = allowIndexing ? "index, follow" : "noindex, nofollow";
}

export function setJsonLd(id: string, payload: Record<string, unknown>) {
  if (typeof document === "undefined") return;

  const existing = document.getElementById(id);
  existing?.remove();

  if (!payload || !Object.keys(payload).length) return;

  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.text = JSON.stringify(payload);
  document.head.appendChild(script);
}

export function usePublicTicketingOrganisation(
  organisationSlugFromUrl?: string,
) {
  const hostname = useMemo(() => getCurrentHostname(), []);
  const customDomain = useMemo(
    () => isCustomTicketingDomain(hostname),
    [hostname],
  );

  const [resolvedDomain, setResolvedDomain] =
    useState<PublicTicketingDomainResolution | null>(null);
  const [loading, setLoading] = useState(
    !organisationSlugFromUrl && customDomain,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function resolveDomain() {
      if (organisationSlugFromUrl) {
        setLoading(false);
        setError("");
        return;
      }

      if (!customDomain || !hostname) {
        setLoading(false);
        setError("Organisation slug is missing.");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${getApiBaseUrl()}/ticketing/public/resolve-domain/?domain=${encodeURIComponent(
            hostname,
          )}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          },
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.detail || "Unable to resolve this domain.");
        }

        if (!cancelled) {
          setResolvedDomain(data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setResolvedDomain(null);
          setError(
            err instanceof Error
              ? err.message
              : "Unable to resolve this domain.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void resolveDomain();

    return () => {
      cancelled = true;
    };
  }, [hostname, customDomain, organisationSlugFromUrl]);

  return {
    organisationSlug:
      organisationSlugFromUrl || resolvedDomain?.organisation_slug || "",
    resolvedDomain,
    loading,
    error,
    isCustomDomain: customDomain,
  };
}
