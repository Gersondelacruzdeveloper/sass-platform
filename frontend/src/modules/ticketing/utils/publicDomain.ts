const PLATFORM_HOSTS = [
  "localhost",
  "127.0.0.1",
  "app.puntacanadiscovery.com",
];

export function getCurrentHostname(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.hostname.toLowerCase();
}

export function isPlatformHost(hostname = getCurrentHostname()): boolean {
  return PLATFORM_HOSTS.includes(hostname);
}

export function isCustomTicketingDomain(hostname = getCurrentHostname()): boolean {
  return Boolean(hostname) && !isPlatformHost(hostname);
}

export function getApiBaseUrl(): string {
  const envBaseUrl = import.meta.env.VITE_API_BASE_URL;

  if (envBaseUrl) {
    return String(envBaseUrl).replace(/\/$/, "");
  }

  return "http://127.0.0.1:8000/api";
}