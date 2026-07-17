import { useCallback, useEffect, useState } from "react";

import {
  TICKETING_ADMIN_LANGUAGE_STORAGE_KEY,
  getInitialTicketingAdminLanguage,
  ticketingAdminTranslations,
  type TicketingAdminLanguage,
} from "./ticketingAdminTranslations";

type TranslationValues = Record<
  string,
  string | number | boolean | null | undefined
>;

const languageListeners = new Set<
  (language: TicketingAdminLanguage) => void
>();

function interpolateTranslation(
  text: string,
  values?: TranslationValues,
) {
  if (!values) return text;

  return text.replace(
    /\{\{\s*([^{}\s]+)\s*\}\}/g,
    (match, variableName: string) => {
      const value = values[variableName];

      if (value === null || value === undefined) {
        return match;
      }

      return String(value);
    },
  );
}

export function useTicketingAdminTranslation() {
  const [language, setLanguageState] =
    useState<TicketingAdminLanguage>(
      getInitialTicketingAdminLanguage,
    );

  const setLanguage = useCallback(
    (nextLanguage: TicketingAdminLanguage) => {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          TICKETING_ADMIN_LANGUAGE_STORAGE_KEY,
          nextLanguage,
        );
      }

      setLanguageState(nextLanguage);

      languageListeners.forEach((listener) => {
        listener(nextLanguage);
      });
    },
    [],
  );

  useEffect(() => {
    languageListeners.add(setLanguageState);

    function handleStorageChange(event: StorageEvent) {
      if (
        event.key !== TICKETING_ADMIN_LANGUAGE_STORAGE_KEY
      ) {
        return;
      }

      if (
        event.newValue === "en" ||
        event.newValue === "es"
      ) {
        setLanguageState(event.newValue);
      }
    }

    window.addEventListener("storage", handleStorageChange);

    return () => {
      languageListeners.delete(setLanguageState);
      window.removeEventListener(
        "storage",
        handleStorageChange,
      );
    };
  }, []);

  const t = useCallback(
    (
      key: string,
      values?: TranslationValues,
      fallback?: string,
    ) => {
      const requestedTranslation =
        ticketingAdminTranslations[language]?.[key];

      const englishTranslation =
        ticketingAdminTranslations.en[key];

      const resolvedTranslation =
        requestedTranslation ||
        englishTranslation ||
        fallback ||
        key;

      return interpolateTranslation(
        resolvedTranslation,
        values,
      );
    },
    [language],
  );

  return {
    language,
    setLanguage,
    t,
  };
}

export function translateTicketingAdminRole(
  role: string | null | undefined,
  t: (
    key: string,
    values?: TranslationValues,
    fallback?: string,
  ) => string,
) {
  const cleanRole = String(role || "user")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  const fallback = String(role || "User").replace(
    /_/g,
    " ",
  );

  return t(`roles.${cleanRole}`, undefined, fallback);
}