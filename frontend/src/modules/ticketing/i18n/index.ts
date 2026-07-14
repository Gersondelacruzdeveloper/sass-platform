export {
  detectBrowserTicketingLanguage,
  getInitialTicketingLanguage,
  getSavedTicketingLanguage,
  getTicketingLanguageFromUrl,
  normalizeTicketingLanguage,
  saveTicketingLanguage,
  TICKETING_PUBLIC_LANGUAGE_MANUAL_KEY,
  TICKETING_PUBLIC_LANGUAGE_STORAGE_KEY,
  ticketingLanguageOptions,
  ticketingLanguages,
  ticketingTranslations,
  type TicketingLanguage,
  type TicketingTranslationDictionary,
} from "./ticketingTranslations";

export { useTicketingTranslation } from "./useTicketingTranslation";
