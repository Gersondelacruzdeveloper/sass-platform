import { useCallback, useEffect, useState } from "react";

import {
  DISCO_LANGUAGE_STORAGE_KEY,
  discoTranslations,
  getInitialDiscoLanguage,
  type DiscoLanguage,
} from "./discoTranslations";

const languageListeners = new Set<(language: DiscoLanguage) => void>();

export function useDiscoTranslation() {
  const [language, setLanguageState] = useState<DiscoLanguage>(
    getInitialDiscoLanguage
  );

  const setLanguage = useCallback((nextLanguage: DiscoLanguage) => {
    window.localStorage.setItem(DISCO_LANGUAGE_STORAGE_KEY, nextLanguage);
    setLanguageState(nextLanguage);

    languageListeners.forEach((listener) => {
      listener(nextLanguage);
    });
  }, []);

  useEffect(() => {
    languageListeners.add(setLanguageState);

    function handleStorageChange(event: StorageEvent) {
      if (event.key !== DISCO_LANGUAGE_STORAGE_KEY) return;

      if (event.newValue === "en" || event.newValue === "es") {
        setLanguageState(event.newValue);
      }
    }

    window.addEventListener("storage", handleStorageChange);

    return () => {
      languageListeners.delete(setLanguageState);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      return (
        discoTranslations[language]?.[key] ||
        discoTranslations.en?.[key] ||
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

export function translateDiscoRole(
  role: string | null | undefined,
  t: (key: string, fallback?: string) => string
) {
  const cleanRole = String(role || "user")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  const fallback = String(role || "User").replace(/_/g, " ");

  return t(`roles.${cleanRole}`, fallback);
}