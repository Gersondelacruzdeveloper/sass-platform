import { useCallback, useEffect, useState } from "react";

import {
  getInitialTicketingLanguage,
  saveTicketingLanguage,
  TICKETING_PUBLIC_LANGUAGE_STORAGE_KEY,
  ticketingTranslations,
  type TicketingLanguage,
} from "./ticketingTranslations";

const languageListeners = new Set<
  (language: TicketingLanguage) => void
>();

export function useTicketingTranslation() {
  const [language, setLanguageState] =
    useState<TicketingLanguage>(getInitialTicketingLanguage);

  const setLanguage = useCallback(
    (
      nextLanguage: TicketingLanguage,
      manuallySelected = true
    ) => {
      saveTicketingLanguage(nextLanguage, manuallySelected);
      setLanguageState(nextLanguage);

      languageListeners.forEach((listener) => {
        listener(nextLanguage);
      });
    },
    []
  );

  useEffect(() => {
    languageListeners.add(setLanguageState);

    saveTicketingLanguage(language);

    function handleStorageChange(event: StorageEvent) {
      if (
        event.key !== TICKETING_PUBLIC_LANGUAGE_STORAGE_KEY ||
        !event.newValue
      ) {
        return;
      }

      if (
        event.newValue === "en" ||
        event.newValue === "es" ||
        event.newValue === "pt" ||
        event.newValue === "fr" ||
        event.newValue === "de"
      ) {
        setLanguageState(event.newValue);
        saveTicketingLanguage(event.newValue);
      }
    }

    window.addEventListener("storage", handleStorageChange);

    return () => {
      languageListeners.delete(setLanguageState);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [language]);

  const t = useCallback(
    (key: string, fallback?: string) => {
      return (
        ticketingTranslations[language]?.[key] ||
        ticketingTranslations.en?.[key] ||
        fallback ||
        key
      );
    },
    [language]
  );

  return {
    language,
    setLanguage,
    t,
  };
}
