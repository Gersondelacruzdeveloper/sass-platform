import { useEffect } from "react";

import type { TicketingLanguage } from "../ticketingTranslations";

type TranslationTable = Record<string, string>;

const es: TranslationTable = {
  "Home": "Inicio",
  "Back": "Atrás",
  "Share": "Compartir",
  "Browse more": "Ver más",
  "Tours, Tickets & Transfers": "Tours, boletos y traslados",
  "Website not available": "Sitio web no disponible",
  "Loading experience details...": "Cargando los detalles de la experiencia...",
  "Experience not found": "Experiencia no encontrada",
  "This experience is not available.": "Esta experiencia no está disponible.",
  "Back to experiences": "Volver a las experiencias",
  "Open gallery": "Abrir galería",
  "Close gallery": "Cerrar galería",
  "Previous image": "Imagen anterior",
  "Next image": "Imagen siguiente",
  "No image": "Sin imagen",
  "Top seller": "Más vendido",
  "Featured": "Destacado",
  "View photos": "Ver fotos",
  "From": "Desde",
  "per person": "por persona",
  "per vehicle / group": "por vehículo / grupo",
  "Highlights": "Aspectos destacados",
  "About this experience": "Sobre esta experiencia",
  "What’s included": "Qué incluye",
  "Not included": "No incluido",
  "Experience plan": "Plan de la experiencia",
  "What to bring": "Qué llevar",
  "Frequently asked questions": "Preguntas frecuentes",
  "Cancellation policy": "Política de cancelación",
  "Meeting point": "Punto de encuentro",
  "Meeting point will be shared after booking.": "El punto de encuentro se compartirá después de la reserva.",
  "More experiences": "Más experiencias",
  "Top rated": "Mejor valorado",
  "One of our most booked experiences": "Una de nuestras experiencias más reservadas",
  "Recommended by our local team": "Recomendado por nuestro equipo local",
  "Hotel pickup available": "Recogida en el hotel disponible",
  "Reserve with deposit": "Reserva con depósito",
  "Fast and simple online reservation": "Reserva en línea rápida y sencilla",
  "Great option for couples, friends and families": "Excelente opción para parejas, amigos y familias",
  "Comfortable clothes": "Ropa cómoda",
  "Sunscreen": "Protector solar",
  "Towel or beachwear if needed": "Toalla o ropa de playa si es necesario",
  "Cash for optional purchases": "Efectivo para compras opcionales",
  "Flight number or arrival information": "Número de vuelo o información de llegada",
  "Hotel or destination name": "Nombre del hotel o destino",
  "Valid contact number": "Número de contacto válido",
  "Valid ID if required": "Documento de identidad válido si es necesario",
  "Booking confirmation": "Confirmación de reserva",
  "Pickup available": "Recogida disponible",
  "Easy reservation": "Reserva fácil",
  "Secure booking": "Reserva segura",
  "Secure checkout • Local support • Fast confirmation": "Pago seguro • Soporte local • Confirmación rápida",
  "Date": "Fecha",
  "Guests": "Personas",
  "Adults": "Adultos",
  "Children": "Niños",
  "Infants": "Infantes",
  "Adult": "Adulto",
  "Child": "Niño",
  "Infant": "Infante",
  "At least 1 adult": "Al menos 1 adulto",
  "Select date": "Selecciona una fecha",
  "Select a service date": "Selecciona una fecha de servicio",
  "Selected date available": "Fecha seleccionada disponible",
  "This date is not available.": "Esta fecha no está disponible.",
  "This date is closed or sold out.": "Esta fecha está cerrada o agotada.",
  "This date has not been opened in Availability.": "Esta fecha aún no se ha habilitado en Disponibilidad.",
  "Choose another service date.": "Elige otra fecha de servicio.",
  "Available dates & capacity": "Fechas disponibles y capacidad",
  "Upcoming available dates": "Próximas fechas disponibles",
  "Remaining capacity": "Capacidad restante",
  "Available": "Disponible",
  "Sold out": "Agotado",
  "Default price": "Precio predeterminado",
  "Every day": "Todos los días",
  "Pickup information": "Información de recogida",
  "Pickup availability": "Disponibilidad de recogida",
  "Available pickup days": "Días de recogida disponibles",
  "Specific pickup dates": "Fechas específicas de recogida",
  "Hotel / pickup location": "Hotel / lugar de recogida",
  "Select hotel/location": "Selecciona hotel/lugar",
  "Select your hotel first": "Selecciona primero tu hotel",
  "Pickup point": "Punto de recogida",
  "Pickup assigned": "Recogida asignada",
  "Calculating pickup time...": "Calculando la hora de recogida...",
  "Pickup time not configured yet": "La hora de recogida aún no está configurada",
  "No hotels are configured for pickup yet.": "Todavía no hay hoteles configurados para recogida.",
  "Select a hotel/location to calculate the pickup time.": "Selecciona un hotel/lugar para calcular la hora de recogida.",
  "Select a service date to calculate the pickup time.": "Selecciona una fecha de servicio para calcular la hora de recogida.",
  "The exact pickup time will appear after you select a valid date.": "La hora exacta de recogida aparecerá después de seleccionar una fecha válida.",
  "No matching pickup schedule was found for this date and location.": "No se encontró un horario de recogida para esta fecha y ubicación.",
  "Transfer route": "Ruta de traslado",
  "Select route": "Selecciona una ruta",
  "Select pickup and destination route": "Selecciona la ruta de recogida y destino",
  "One way": "Solo ida",
  "Round trip": "Ida y vuelta",
  "Return included": "Regreso incluido",
  "Preferred pickup time": "Hora de recogida preferida",
  "Pickup to destination": "Recogida hasta el destino",
  "Transfer routes are not configured for this product yet.": "Todavía no hay rutas de traslado configuradas para este producto.",
  "No price band is configured for this passenger count.": "No hay una tarifa configurada para esta cantidad de pasajeros.",
  "Live": "En vivo",
  "Coco Bongo tickets": "Boletos de Coco Bongo",
  "Ticket option": "Opción de boleto",
  "Choose one option. Prices and availability are live.": "Elige una opción. Los precios y la disponibilidad son en tiempo real.",
  "Checking live ticket availability.": "Comprobando la disponibilidad de boletos en vivo.",
  "Loading live Coco Bongo tickets...": "Cargando boletos de Coco Bongo en vivo...",
  "Live ticket options are not available.": "Las opciones de boletos en vivo no están disponibles.",
  "Live ticket options are not available for this date.": "Las opciones de boletos en vivo no están disponibles para esta fecha.",
  "No Coco Bongo tickets were found for this date.": "No se encontraron boletos de Coco Bongo para esta fecha.",
  "Select a date to see Coco Bongo ticket options.": "Selecciona una fecha para ver las opciones de boletos de Coco Bongo.",
  "Check-in": "Registro",
  "Payment option": "Opción de pago",
  "Pay deposit": "Pagar depósito",
  "Pay total amount": "Pagar el total",
  "Reserve now, pay later": "Reserva ahora y paga después",
  "Pay in person": "Pagar en persona",
  "Pay a deposit now and the rest later.": "Paga un depósito ahora y el resto después.",
  "Reserve now with the required deposit.": "Reserva ahora con el depósito requerido.",
  "Complete your payment and secure your booking.": "Completa tu pago y asegura tu reserva.",
  "Send the request and complete payment after confirmation.": "Envía la solicitud y completa el pago después de la confirmación.",
  "Reserve now and pay in person when confirmed.": "Reserva ahora y paga en persona cuando sea confirmado.",
  "No payment option is available for this product yet. Please contact the seller or administrator.": "Todavía no hay una opción de pago disponible para este producto. Contacta al vendedor o administrador.",
  "Price": "Precio",
  "Total": "Total",
  "Deposit": "Depósito",
  "Pay now": "Pagar ahora",
  "Pay later": "Pagar después",
  "Checkout unavailable": "Pago no disponible",
  "Please select date and guests.": "Selecciona la fecha y los pasajeros.",
  "Please select date, guests and pickup location.": "Selecciona la fecha, los pasajeros y el lugar de recogida.",
  "Please select an available payment option.": "Selecciona una opción de pago disponible.",
  "Please select your transfer route.": "Selecciona tu ruta de traslado.",
  "Please select your preferred pickup time.": "Selecciona tu hora de recogida preferida.",
  "Please select a ticket option.": "Selecciona una opción de boleto.",
  "Please wait a moment and try again.": "Espera un momento e inténtalo de nuevo.",
  "Link copied ✔": "Enlace copiado ✔",
  "Could not copy link": "No se pudo copiar el enlace"
};

const pt: TranslationTable = {
  "Home": "Início", "Back": "Voltar", "Share": "Compartilhar", "Browse more": "Ver mais",
  "Tours, Tickets & Transfers": "Passeios, ingressos e traslados", "Website not available": "Site indisponível",
  "Loading experience details...": "Carregando detalhes da experiência...", "Experience not found": "Experiência não encontrada",
  "This experience is not available.": "Esta experiência não está disponível.", "Back to experiences": "Voltar às experiências",
  "Open gallery": "Abrir galeria", "Close gallery": "Fechar galeria", "Previous image": "Imagem anterior", "Next image": "Próxima imagem",
  "No image": "Sem imagem", "Top seller": "Mais vendido", "Featured": "Destaque", "View photos": "Ver fotos",
  "From": "A partir de", "per person": "por pessoa", "per vehicle / group": "por veículo / grupo",
  "Highlights": "Destaques", "About this experience": "Sobre esta experiência", "What’s included": "O que está incluído",
  "Not included": "Não incluído", "Experience plan": "Plano da experiência", "What to bring": "O que levar",
  "Frequently asked questions": "Perguntas frequentes", "Cancellation policy": "Política de cancelamento",
  "Meeting point": "Ponto de encontro", "More experiences": "Mais experiências", "Top rated": "Mais bem avaliado",
  "Pickup available": "Traslado disponível", "Easy reservation": "Reserva fácil", "Secure booking": "Reserva segura",
  "Date": "Data", "Guests": "Pessoas", "Adults": "Adultos", "Children": "Crianças", "Infants": "Bebês",
  "At least 1 adult": "Pelo menos 1 adulto", "Select date": "Selecione uma data", "Available": "Disponível", "Sold out": "Esgotado",
  "Pickup information": "Informações de traslado", "Hotel / pickup location": "Hotel / local de busca",
  "Select hotel/location": "Selecione hotel/local", "Select your hotel first": "Selecione primeiro o hotel",
  "Transfer route": "Rota de traslado", "Select route": "Selecione uma rota", "One way": "Somente ida", "Round trip": "Ida e volta",
  "Preferred pickup time": "Horário de busca preferido", "Ticket option": "Opção de ingresso",
  "Payment option": "Opção de pagamento", "Pay deposit": "Pagar depósito", "Pay total amount": "Pagar valor total",
  "Reserve now, pay later": "Reserve agora, pague depois", "Pay in person": "Pagar pessoalmente",
  "Price": "Preço", "Total": "Total", "Deposit": "Depósito", "Pay now": "Pagar agora", "Pay later": "Pagar depois",
  "Checkout unavailable": "Pagamento indisponível", "Please select date and guests.": "Selecione a data e os passageiros.",
  "Please select a ticket option.": "Selecione uma opção de ingresso.", "Link copied ✔": "Link copiado ✔", "Could not copy link": "Não foi possível copiar o link"
};

const fr: TranslationTable = {
  "Home": "Accueil", "Back": "Retour", "Share": "Partager", "Browse more": "Voir plus",
  "Tours, Tickets & Transfers": "Excursions, billets et transferts", "Website not available": "Site indisponible",
  "Loading experience details...": "Chargement des détails de l’expérience...", "Experience not found": "Expérience introuvable",
  "This experience is not available.": "Cette expérience n’est pas disponible.", "Back to experiences": "Retour aux expériences",
  "Open gallery": "Ouvrir la galerie", "Close gallery": "Fermer la galerie", "Previous image": "Image précédente", "Next image": "Image suivante",
  "No image": "Aucune image", "Top seller": "Meilleure vente", "Featured": "En vedette", "View photos": "Voir les photos",
  "From": "À partir de", "per person": "par personne", "per vehicle / group": "par véhicule / groupe",
  "Highlights": "Points forts", "About this experience": "À propos de cette expérience", "What’s included": "Ce qui est inclus",
  "Not included": "Non inclus", "Experience plan": "Programme de l’expérience", "What to bring": "À apporter",
  "Frequently asked questions": "Questions fréquentes", "Cancellation policy": "Politique d’annulation",
  "Meeting point": "Point de rendez-vous", "More experiences": "Plus d’expériences", "Top rated": "Mieux noté",
  "Pickup available": "Prise en charge disponible", "Easy reservation": "Réservation facile", "Secure booking": "Réservation sécurisée",
  "Date": "Date", "Guests": "Voyageurs", "Adults": "Adultes", "Children": "Enfants", "Infants": "Bébés",
  "At least 1 adult": "Au moins 1 adulte", "Select date": "Sélectionnez une date", "Available": "Disponible", "Sold out": "Complet",
  "Pickup information": "Informations de prise en charge", "Hotel / pickup location": "Hôtel / lieu de prise en charge",
  "Select hotel/location": "Sélectionnez un hôtel/lieu", "Select your hotel first": "Sélectionnez d’abord votre hôtel",
  "Transfer route": "Itinéraire du transfert", "Select route": "Sélectionnez un itinéraire", "One way": "Aller simple", "Round trip": "Aller-retour",
  "Preferred pickup time": "Heure de prise en charge souhaitée", "Ticket option": "Option de billet",
  "Payment option": "Option de paiement", "Pay deposit": "Payer l’acompte", "Pay total amount": "Payer le montant total",
  "Reserve now, pay later": "Réservez maintenant, payez plus tard", "Pay in person": "Payer sur place",
  "Price": "Prix", "Total": "Total", "Deposit": "Acompte", "Pay now": "Payer maintenant", "Pay later": "Payer plus tard",
  "Checkout unavailable": "Paiement indisponible", "Please select date and guests.": "Sélectionnez la date et les voyageurs.",
  "Please select a ticket option.": "Sélectionnez une option de billet.", "Link copied ✔": "Lien copié ✔", "Could not copy link": "Impossible de copier le lien"
};

const de: TranslationTable = {
  "Home": "Startseite", "Back": "Zurück", "Share": "Teilen", "Browse more": "Mehr ansehen",
  "Tours, Tickets & Transfers": "Touren, Tickets & Transfers", "Website not available": "Website nicht verfügbar",
  "Loading experience details...": "Erlebnisdetails werden geladen...", "Experience not found": "Erlebnis nicht gefunden",
  "This experience is not available.": "Dieses Erlebnis ist nicht verfügbar.", "Back to experiences": "Zurück zu den Erlebnissen",
  "Open gallery": "Galerie öffnen", "Close gallery": "Galerie schließen", "Previous image": "Vorheriges Bild", "Next image": "Nächstes Bild",
  "No image": "Kein Bild", "Top seller": "Bestseller", "Featured": "Empfohlen", "View photos": "Fotos ansehen",
  "From": "Ab", "per person": "pro Person", "per vehicle / group": "pro Fahrzeug / Gruppe",
  "Highlights": "Highlights", "About this experience": "Über dieses Erlebnis", "What’s included": "Was enthalten ist",
  "Not included": "Nicht enthalten", "Experience plan": "Ablauf", "What to bring": "Was Sie mitbringen sollten",
  "Frequently asked questions": "Häufig gestellte Fragen", "Cancellation policy": "Stornierungsbedingungen",
  "Meeting point": "Treffpunkt", "More experiences": "Weitere Erlebnisse", "Top rated": "Bestbewertet",
  "Pickup available": "Abholung verfügbar", "Easy reservation": "Einfache Reservierung", "Secure booking": "Sichere Buchung",
  "Date": "Datum", "Guests": "Gäste", "Adults": "Erwachsene", "Children": "Kinder", "Infants": "Kleinkinder",
  "At least 1 adult": "Mindestens 1 Erwachsener", "Select date": "Datum auswählen", "Available": "Verfügbar", "Sold out": "Ausverkauft",
  "Pickup information": "Abholinformationen", "Hotel / pickup location": "Hotel / Abholort",
  "Select hotel/location": "Hotel/Ort auswählen", "Select your hotel first": "Wählen Sie zuerst Ihr Hotel",
  "Transfer route": "Transferroute", "Select route": "Route auswählen", "One way": "Einfache Fahrt", "Round trip": "Hin- und Rückfahrt",
  "Preferred pickup time": "Bevorzugte Abholzeit", "Ticket option": "Ticketoption",
  "Payment option": "Zahlungsoption", "Pay deposit": "Anzahlung zahlen", "Pay total amount": "Gesamtbetrag zahlen",
  "Reserve now, pay later": "Jetzt reservieren, später zahlen", "Pay in person": "Vor Ort bezahlen",
  "Price": "Preis", "Total": "Gesamt", "Deposit": "Anzahlung", "Pay now": "Jetzt bezahlen", "Pay later": "Später bezahlen",
  "Checkout unavailable": "Bezahlung nicht verfügbar", "Please select date and guests.": "Wählen Sie Datum und Gäste aus.",
  "Please select a ticket option.": "Wählen Sie eine Ticketoption.", "Link copied ✔": "Link kopiert ✔", "Could not copy link": "Link konnte nicht kopiert werden"
};

export const productDetailTranslations: Record<TicketingLanguage, TranslationTable> = {
  en: {}, es, pt, fr, de,
};

const originalText = new WeakMap<Node, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;

function translateValue(value: string, language: TicketingLanguage): string {
  if (language === "en") return value;
  const clean = value.trim();
  const translated = productDetailTranslations[language][clean];
  if (!translated) return value;
  return value.replace(clean, translated);
}

function translateElement(root: ParentNode, language: TicketingLanguage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const parent = node.parentElement;
    if (parent && !["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) {
      if (!originalText.has(node)) originalText.set(node, node.textContent || "");
      const original = originalText.get(node) || "";
      const next = translateValue(original, language);
      if (node.textContent !== next) node.textContent = next;
    }
    node = walker.nextNode();
  }

  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : Array.from(root.querySelectorAll("*"));
  elements.forEach((element) => {
    let map = originalAttributes.get(element);
    if (!map) {
      map = new Map<string, string>();
      originalAttributes.set(element, map);
    }
    TRANSLATABLE_ATTRIBUTES.forEach((attribute) => {
      const current = element.getAttribute(attribute);
      if (current === null) return;
      if (!map!.has(attribute)) map!.set(attribute, current);
      const original = map!.get(attribute) || current;
      const next = translateValue(original, language);
      if (current !== next) element.setAttribute(attribute, next);
    });
  });
}

export function useProductDetailAutoTranslation(language: TicketingLanguage) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    let scheduled = false;
    const apply = () => {
      scheduled = false;
      translateElement(document.body, language);
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(apply);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...TRANSLATABLE_ATTRIBUTES] });

    return () => observer.disconnect();
  }, [language]);
}
