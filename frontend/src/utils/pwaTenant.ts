type PwaModule = "training" | "ticketing" | "disco" | "default";

const RESERVED_TENANT_SEGMENTS = new Set([
  "dashboard",
  "seller",
  "partner",
  "login",
  "signup",
  "billing-locked",
  "subscription",
  "checkout",
  "confirmation",
  "blog",
]);

function normalizeTenantSlug(value?: string): string {
  const slug = String(value || "").trim().toLowerCase();

  if (!slug || RESERVED_TENANT_SEGMENTS.has(slug)) {
    return "";
  }

  return slug;
}

function getApiBaseUrl() {
  return (
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api"
  );
}

function getRouteContext(): {
  module: PwaModule;
  tenantSlug: string;
} {
  const pathParts = window.location.pathname
    .split("/")
    .filter(Boolean);

  const moduleName = pathParts[0];

  if (
    (moduleName === "training" ||
      moduleName === "ticketing" ||
      moduleName === "disco") &&
    pathParts[1]
  ) {
    return {
      module: moduleName,
      tenantSlug: normalizeTenantSlug(pathParts[1]),
    };
  }

  return {
    module: "default",
    tenantSlug: "",
  };
}

function setManifestHref(
  module: PwaModule,
  tenantSlug: string,
) {
  const manifest = document.querySelector<HTMLLinkElement>(
    "link[rel='manifest']",
  );

  if (!manifest) return;

  if (
    (module === "ticketing" || module === "disco") &&
    tenantSlug
  ) {
    manifest.href =
      `${getApiBaseUrl()}/organisations/public-manifest/` +
      `${module}/${tenantSlug}/manifest.json`;
    manifest.type = "application/manifest+json";
    return;
  }

  if (module === "training" && tenantSlug) {
    manifest.href = `/manifest-${tenantSlug}.webmanifest`;
    return;
  }

  manifest.href = "/manifest-default.webmanifest";
}

function setupTrainingAssets(tenantSlug: string) {
  if (!tenantSlug) return;

  const appleIcon =
    document.querySelector<HTMLLinkElement>(
      "link[rel='apple-touch-icon']",
    );

  if (appleIcon) {
    appleIcon.href =
      `/icons/${tenantSlug}/apple-touch-icon.png`;
  }

  const favicon =
    document.querySelector<HTMLLinkElement>(
      "link[rel='icon']",
    );

  if (favicon) {
    favicon.href = `/icons/${tenantSlug}/favicon.ico`;
  }
}

function getTrainingTitle(tenantSlug: string) {
  if (tenantSlug === "hard-rock") {
    return "Hard Rock A&B Training";
  }

  if (tenantSlug === "barcelo") {
    return "Barceló Academy";
  }

  if (tenantSlug === "melia") {
    return "Meliá Academy";
  }

  return "Training Platform";
}

export function setupTenantPWA() {
  const { module, tenantSlug } = getRouteContext();

  setManifestHref(module, tenantSlug);

  /*
   * Training still uses its existing static tenant icon files.
   *
   * Ticketing and Disco deliberately do not overwrite the favicon or
   * apple-touch-icon here. Their authenticated/public layouts load the
   * organisation branding and replace those assets with the tenant's
   * configured branding.
   */
  if (module === "training" && tenantSlug) {
    setupTrainingAssets(tenantSlug);
    document.title = getTrainingTitle(tenantSlug);
    return;
  }

  /*
   * Ticketing/Disco manifest identity is tenant-specific from the moment
   * the URL is opened. This is important on mobile Safari because
   * "Add to Home Screen" may inspect the manifest before a dashboard layout
   * has finished loading.
   *
   * Do not invent an organisation display name from the slug here.
   * The relevant module page/layout will replace document.title after
   * loading the organisation branding from the API.
   */
  if (
    (module === "ticketing" || module === "disco") &&
    tenantSlug
  ) {
    return;
  }

  document.title = "Punta Cana Discovery Platform";
}
