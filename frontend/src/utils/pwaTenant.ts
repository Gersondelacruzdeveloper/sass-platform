export function setupTenantPWA() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);

  const tenantSlug =
    pathParts[0] === "training" && pathParts[1]
      ? pathParts[1]
      : "default";

  const safeTenant = tenantSlug || "default";

  const manifest = document.querySelector("link[rel='manifest']");
  if (manifest) {
    manifest.setAttribute(
      "href",
      `/manifest-${safeTenant}.webmanifest`
    );
  }

  const appleIcon = document.querySelector(
    "link[rel='apple-touch-icon']"
  );
  if (appleIcon) {
    appleIcon.setAttribute(
      "href",
      `/icons/${safeTenant}/apple-touch-icon.png`
    );
  }

  const favicon = document.querySelector("link[rel='icon']");
  if (favicon) {
    favicon.setAttribute(
      "href",
      `/icons/${safeTenant}/favicon.ico`
    );
  }

  const appTitle =
    safeTenant === "hard-rock"
      ? "Hard Rock A&B Training"
      : safeTenant === "barcelo"
      ? "Barceló Academy"
      : safeTenant === "melia"
      ? "Meliá Academy"
      : "Punta Cana Discovery Platform";

  document.title = appTitle;
}