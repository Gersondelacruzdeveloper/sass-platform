import { checkoutTranslations } from "./translations/checkout";
import { commonTranslations } from "./translations/common";
import { confirmationTranslations } from "./translations/confirmation";
import { listingTranslations } from "./translations/listing";
import { productTranslations } from "./translations/product";
import { publicTranslations } from "./translations/public";
import { validationTranslations } from "./translations/validation";

export const TICKETING_PUBLIC_LANGUAGE_STORAGE_KEY =
  "ticketing-public-language";

export const TICKETING_PUBLIC_LANGUAGE_MANUAL_KEY =
  "ticketing-public-language-manually-selected";

export const ticketingLanguages = ["en", "es", "pt", "fr", "de"] as const;

export type TicketingLanguage = (typeof ticketingLanguages)[number];

export type TicketingTranslationDictionary = Record<string, string>;

export const ticketingLanguageOptions: Array<{
  value: TicketingLanguage;
  label: string;
  shortLabel: string;
}> = [
  { value: "en", label: "English", shortLabel: "EN" },
  { value: "es", label: "Español", shortLabel: "ES" },
  { value: "pt", label: "Português", shortLabel: "PT" },
  { value: "fr", label: "Français", shortLabel: "FR" },
  { value: "de", label: "Deutsch", shortLabel: "DE" },
];

function mergeLanguageTranslations(
  language: TicketingLanguage
): TicketingTranslationDictionary {
  return {
    ...commonTranslations[language],
    ...publicTranslations[language],
    ...listingTranslations[language],
    ...productTranslations[language],
    ...checkoutTranslations[language],
    ...confirmationTranslations[language],
    ...validationTranslations[language],
  };
}

export const ticketingTranslations: Record<
  TicketingLanguage,
  TicketingTranslationDictionary
> = {
  en: mergeLanguageTranslations("en"),
  es: mergeLanguageTranslations("es"),
  pt: mergeLanguageTranslations("pt"),
  fr: mergeLanguageTranslations("fr"),
  de: mergeLanguageTranslations("de"),
};

export function normalizeTicketingLanguage(
  value: string | null | undefined
): TicketingLanguage | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .split("-")[0];

  return ticketingLanguages.includes(normalized as TicketingLanguage)
    ? (normalized as TicketingLanguage)
    : null;
}

export function getTicketingLanguageFromUrl(): TicketingLanguage | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);

  return normalizeTicketingLanguage(
    params.get("lang") || params.get("language")
  );
}

export function getSavedTicketingLanguage(): TicketingLanguage | null {
  if (typeof window === "undefined") return null;

  try {
    return normalizeTicketingLanguage(
      window.localStorage.getItem(TICKETING_PUBLIC_LANGUAGE_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

export function detectBrowserTicketingLanguage(): TicketingLanguage | null {
  if (typeof navigator === "undefined") return null;

  const browserLanguages =
    Array.isArray(navigator.languages) && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];

  for (const browserLanguage of browserLanguages) {
    const language = normalizeTicketingLanguage(browserLanguage);

    if (language) return language;
  }

  return null;
}

export function getInitialTicketingLanguage(): TicketingLanguage {
  return (
    getTicketingLanguageFromUrl() ||
    getSavedTicketingLanguage() ||
    detectBrowserTicketingLanguage() ||
    "en"
  );
}

export function saveTicketingLanguage(
  language: TicketingLanguage,
  manuallySelected = false
): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        TICKETING_PUBLIC_LANGUAGE_STORAGE_KEY,
        language
      );

      if (manuallySelected) {
        window.localStorage.setItem(
          TICKETING_PUBLIC_LANGUAGE_MANUAL_KEY,
          "true"
        );
      }
    } catch {
      // Ignore localStorage errors in restricted browsers.
    }
  }

  if (typeof document !== "undefined") {
    document.documentElement.lang = language;
  }
}
