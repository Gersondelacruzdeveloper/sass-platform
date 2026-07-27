// src/modules/ticketing/pages/seller/TicketingSellerAIBookingPage.tsx

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Loader2,
  Mic,
  RefreshCcw,
  Send,
  Sparkles,
  User,
  WandSparkles,
} from "lucide-react";

import api from "../../../../api/axios";

type ChatRole = "seller" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  createdAt: string;
};

type AIChoice = {
  id?: string | number;
  value?: string | number;
  label?: string;
  description?: string;
  price?: string | number;
  currency?: string;
  api_data?: Record<string, unknown>;
};

type BookingPreview = {
  product?: { id?: number; name?: string } | null;
  live_option?: {
    name?: string;
    unit_price?: string | number;
    currency?: string;
  } | null;
  service_date?: string;
  service_time?: string;
  guests?: {
    adults?: number;
    children?: number;
    infants?: number;
    total?: number;
  };
  customer?: {
    name?: string;
    whatsapp?: string;
    email?: string;
    hotel?: string;
    notes?: string;
  };
  pickup?: {
    location?: string;
    time?: string;
    point?: string;
  } | null;
  payment?: { action?: string };
  discount_amount?: string | number;
  discount_percent?: string | number;
};

type BookingRecord = {
  id?: number;
  booking_code?: string;
  reference?: string;
  code?: string;
  status?: string;
  payment_status?: string;
};

type AIChatResponse = {
  conversation_id?: string;
  message?: string;
  status?: string;
  requires_reply?: boolean;
  requires_confirmation?: boolean;
  booking_created?: boolean;
  choices?: AIChoice[];
  booking_preview?: BookingPreview;
  booking?: BookingRecord;
};

type SendMessageOptions = {
  choice?: AIChoice;
  confirmed?: boolean;
};

const SESSION_KEY_PREFIX = "ticketing_seller_ai_conversation_";

function makeMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatMoney(
  value: string | number | undefined,
  currency = "USD",
): string {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const amount = Number(value);

  if (Number.isNaN(amount)) {
    return `${value} ${currency}`;
  }

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDate(value?: string): string {
  if (!value) return "";

  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function paymentLabel(action?: string): string {
  const labels: Record<string, string> = {
    pending_payment: "Payment pending",
    deposit_online: "Online deposit",
    full_online: "Full online payment",
    cash_full: "Full cash payment",
    seller_deposit: "Seller deposit",
    seller_full: "Seller full payment",
    commission_only: "Commission only",
    generate_ticket: "Generate ticket",
    requires_supervisor_approval: "Supervisor approval",
  };

  if (!action) return "";
  return labels[action] || action.replaceAll("_", " ");
}

function choiceDisplayText(choice: AIChoice): string {
  return String(
    choice.label ||
      choice.description ||
      choice.value ||
      choice.id ||
      "Selected option",
  );
}

function SummaryRow({
  label,
  value,
  ready,
  children,
}: {
  label: string;
  value?: string;
  ready: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mt-0.5">
        {ready ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <Circle className="h-5 w-5 text-slate-300" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
          {label}
        </p>
        <div className="mt-1 text-sm font-bold text-slate-900">
          {children || value || "Waiting..."}
        </div>
      </div>
    </div>
  );
}

export default function TicketingSellerAIBookingPage() {
  const { organisationSlug = "" } = useParams<{ organisationSlug: string }>();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeMessageId(),
      role: "assistant",
      text:
        "Tell me what you want to book. You can include the experience, option, date, guests, hotel, customer and payment details in one message.",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [status, setStatus] = useState("collecting");
  const [choices, setChoices] = useState<AIChoice[]>([]);
  const [bookingPreview, setBookingPreview] = useState<BookingPreview>({});
  const [booking, setBooking] = useState<BookingRecord>({});
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [bookingCreated, setBookingCreated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const storageKey = useMemo(
    () => `${SESSION_KEY_PREFIX}${organisationSlug || "default"}`,
    [organisationSlug],
  );

  useEffect(() => {
    setConversationId(window.localStorage.getItem(storageKey) || "");
  }, [storageKey]);

  useEffect(() => {
    if (conversationId) {
      window.localStorage.setItem(storageKey, conversationId);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [conversationId, storageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, choices, loading]);

  const guestSummary = useMemo(() => {
    const guests = bookingPreview.guests;
    if (!guests) return "";

    const parts: string[] = [];
    const adults = Number(guests.adults || 0);
    const children = Number(guests.children || 0);
    const infants = Number(guests.infants || 0);

    if (adults > 0) parts.push(`${adults} adult${adults === 1 ? "" : "s"}`);
    if (children > 0) parts.push(`${children} child${children === 1 ? "" : "ren"}`);
    if (infants > 0) parts.push(`${infants} infant${infants === 1 ? "" : "s"}`);

    return parts.join(", ");
  }, [bookingPreview.guests]);

  const bookingCode = booking.booking_code || booking.reference || booking.code || "";

  function appendMessage(role: ChatRole, messageText: string) {
    const cleanText = messageText.trim();
    if (!cleanText) return;

    setMessages((current) => [
      ...current,
      {
        id: makeMessageId(),
        role,
        text: cleanText,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  async function sendMessage(
    messageText: string,
    options: SendMessageOptions = {},
  ) {
    const cleanText = messageText.trim();
    if (!cleanText || loading || bookingCreated) return;

    appendMessage("seller", cleanText);
    setText("");
    setError("");
    setChoices([]);
    setLoading(true);

    try {
      const payload: Record<string, unknown> = {
        action: "message",
        organisation_slug: organisationSlug,
        text: cleanText,
      };

      if (conversationId) payload.conversation_id = conversationId;
      if (options.confirmed) payload.confirmed = true;

      if (options.choice) {
        const selectedValue =
          options.choice.value ?? options.choice.id ?? options.choice.label;
        payload.selection_id = selectedValue;
        payload.selection_phrase = choiceDisplayText(options.choice);
      }

      const response = await api.post<AIChatResponse>(
        "/ticketing/seller/ai/chat/",
        payload,
      );

      const data = response.data || {};

      if (data.conversation_id) setConversationId(data.conversation_id);

      setStatus(data.status || "collecting");
      setChoices(Array.isArray(data.choices) ? data.choices : []);
      setBookingPreview(data.booking_preview || {});
      setBooking(data.booking || {});
      setRequiresConfirmation(Boolean(data.requires_confirmation));
      setBookingCreated(Boolean(data.booking_created));

      appendMessage("assistant", data.message || "I received the booking details.");
    } catch (requestError: any) {
      const responseData = requestError?.response?.data;
      const message =
        responseData?.detail ||
        responseData?.error ||
        responseData?.message ||
        requestError?.message ||
        "The AI booking assistant could not process the request.";

      setError(String(message));
      appendMessage("system", String(message));
    } finally {
      setLoading(false);
      window.setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage(text);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (text.trim() && !loading) void sendMessage(text);
    }
  }

  function handleChoice(choice: AIChoice) {
    void sendMessage(choiceDisplayText(choice), { choice });
  }

  function handleConfirmBooking() {
    void sendMessage("Yes, create the booking.", { confirmed: true });
  }

  function handleReset() {
    setMessages([
      {
        id: makeMessageId(),
        role: "assistant",
        text: "The previous draft was cleared. Tell me what you would like to book.",
        createdAt: new Date().toISOString(),
      },
    ]);
    setConversationId("");
    setStatus("collecting");
    setChoices([]);
    setBookingPreview({});
    setBooking({});
    setRequiresConfirmation(false);
    setBookingCreated(false);
    setError("");
    setText("");
    window.localStorage.removeItem(storageKey);
    window.setTimeout(() => inputRef.current?.focus(), 100);
  }

  const customerContact =
    bookingPreview.customer?.whatsapp || bookingPreview.customer?.email || "";
  const canConfirm = requiresConfirmation && !loading && !bookingCreated;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-sm">
        <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <WandSparkles className="h-7 w-7" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                  AI Booking Assistant
                </h1>
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-300 ring-1 ring-emerald-300/20">
                  Seller tool
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                Create bookings faster by describing the request naturally. The
                assistant collects missing details and asks for confirmation
                before creating the booking.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to={`/ticketing/${organisationSlug}/seller/new-booking`}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 text-sm font-black text-white transition hover:bg-white/15"
            >
              Manual booking
              <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-slate-100"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Start over
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.75fr)]">
        <section className="flex min-h-[680px] flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <p className="text-sm font-black text-slate-950">Booking conversation</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Speak naturally. The assistant structures the booking.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  bookingCreated
                    ? "bg-emerald-500"
                    : loading
                      ? "animate-pulse bg-amber-500"
                      : "bg-sky-500"
                }`}
              />
              <span className="text-xs font-black capitalize text-slate-700">
                {bookingCreated ? "Completed" : status.replaceAll("_", " ")}
              </span>
            </div>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
            {messages.map((message) => {
              const isSeller = message.role === "seller";
              const isSystem = message.role === "system";

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${isSeller ? "justify-end" : "justify-start"}`}
                >
                  {!isSeller && (
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                        isSystem
                          ? "bg-rose-100 text-rose-700"
                          : "bg-slate-950 text-white"
                      }`}
                    >
                      {isSystem ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                  )}

                  <div
                    className={`max-w-[86%] rounded-[1.4rem] px-4 py-3 text-sm font-semibold leading-6 shadow-sm sm:max-w-[76%] ${
                      isSeller
                        ? "rounded-br-md bg-slate-950 text-white"
                        : isSystem
                          ? "rounded-bl-md border border-rose-200 bg-rose-50 text-rose-800"
                          : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.text}</p>
                  </div>

                  {isSeller && (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-2 rounded-[1.4rem] rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Understanding the booking...
                </div>
              </div>
            )}

            {!loading && choices.length > 0 && !bookingCreated && (
              <div className="rounded-[1.5rem] border border-sky-200 bg-sky-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-700" />
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-800">
                    Choose an option
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {choices.map((choice, index) => {
                    const key = String(
                      choice.id ?? choice.value ?? `${choice.label}-${index}`,
                    );

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleChoice(choice)}
                        className="group rounded-2xl border border-sky-200 bg-white p-4 text-left transition hover:border-sky-400 hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-black text-slate-950">
                              {choice.label || choice.description || `Option ${index + 1}`}
                            </p>
                            {choice.description && choice.label && (
                              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                                {choice.description}
                              </p>
                            )}
                            {choice.price !== undefined && (
                              <p className="mt-2 text-sm font-black text-emerald-700">
                                {formatMoney(choice.price, choice.currency || "USD")}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-700" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-slate-200 bg-white p-4 sm:p-5">
            {bookingCreated ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                  <div>
                    <p className="font-black text-emerald-950">Booking created successfully</p>
                    <p className="mt-1 text-sm font-semibold text-emerald-800">
                      {bookingCode
                        ? `Booking code: ${bookingCode}`
                        : "The booking is now available in the seller bookings list."}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/ticketing/${organisationSlug}/seller/bookings`}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-emerald-700 px-4 text-sm font-black text-white hover:bg-emerald-800"
                >
                  View bookings
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-2 focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100">
                  <textarea
                    ref={inputRef}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={handleInputKeyDown}
                    rows={3}
                    disabled={loading}
                    placeholder="Example: Two Premium Open Bar tickets for Coco Bongo tomorrow for two adults..."
                    className="min-h-[84px] w-full resize-none bg-transparent px-3 py-2 text-sm font-semibold leading-6 text-slate-950 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
                  />

                  <div className="flex items-center justify-between gap-3 px-1 pb-1">
                    <button
                      type="button"
                      disabled
                      title="Voice input will be added next"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-400"
                    >
                      <Mic className="mr-2 h-4 w-4" />
                      Voice soon
                    </button>
                    <button
                      type="submit"
                      disabled={!text.trim() || loading}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Send
                    </button>
                  </div>
                </div>
                <p className="mt-2 px-1 text-xs font-semibold text-slate-400">
                  Press Enter to send. Use Shift + Enter for a new line.
                </p>
              </form>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Booking summary</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Updates as the assistant understands the request.
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
                <Check className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <SummaryRow
                label="Experience"
                value={bookingPreview.product?.name}
                ready={Boolean(bookingPreview.product?.name)}
              />
              <SummaryRow
                label="Option"
                ready={Boolean(bookingPreview.live_option?.name)}
              >
                {bookingPreview.live_option?.name ? (
                  <div>
                    <p>{bookingPreview.live_option.name}</p>
                    {bookingPreview.live_option.unit_price !== undefined && (
                      <p className="mt-1 text-xs font-black text-emerald-700">
                        {formatMoney(
                          bookingPreview.live_option.unit_price,
                          bookingPreview.live_option.currency || "USD",
                        )}
                      </p>
                    )}
                  </div>
                ) : undefined}
              </SummaryRow>
              <SummaryRow
                label="Date"
                value={formatDate(bookingPreview.service_date)}
                ready={Boolean(bookingPreview.service_date)}
              />
              <SummaryRow label="Guests" value={guestSummary} ready={Boolean(guestSummary)} />
              <SummaryRow label="Pickup" ready={Boolean(bookingPreview.pickup?.location)}>
                {bookingPreview.pickup?.location ? (
                  <div>
                    <p>{bookingPreview.pickup.location}</p>
                    {(bookingPreview.pickup.time || bookingPreview.pickup.point) && (
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {[bookingPreview.pickup.time, bookingPreview.pickup.point]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                ) : undefined}
              </SummaryRow>
              <SummaryRow label="Customer" ready={Boolean(bookingPreview.customer?.name)}>
                {bookingPreview.customer?.name ? (
                  <div>
                    <p>{bookingPreview.customer.name}</p>
                    {customerContact && (
                      <p className="mt-1 break-all text-xs font-semibold text-slate-500">
                        {customerContact}
                      </p>
                    )}
                  </div>
                ) : undefined}
              </SummaryRow>
              <SummaryRow
                label="Payment"
                value={paymentLabel(bookingPreview.payment?.action)}
                ready={Boolean(bookingPreview.payment?.action)}
              />
            </div>

            {error && (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
                <p className="text-sm font-bold leading-6 text-rose-800">{error}</p>
              </div>
            )}

            {bookingCreated ? (
              <div className="mt-5 rounded-2xl bg-emerald-700 p-4 text-white">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6" />
                  <div>
                    <p className="font-black">Booking completed</p>
                    {bookingCode && (
                      <p className="mt-1 text-sm font-semibold text-emerald-100">
                        {bookingCode}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConfirmBooking}
                disabled={!canConfirm}
                className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-700 px-4 text-sm font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                )}
                Confirm booking
              </button>
            )}

            {!requiresConfirmation && !bookingCreated && (
              <p className="mt-3 text-center text-xs font-semibold leading-5 text-slate-400">
                The confirmation button activates when the booking is ready.
              </p>
            )}
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              Faster booking example
            </p>
            <button
              type="button"
              disabled={loading || bookingCreated}
              onClick={() =>
                setText(
                  "Quiero dos entradas Premium Open Bar para Coco Bongo mañana para dos adultos",
                )
              }
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left text-sm font-bold leading-6 text-slate-700 transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              “Quiero dos entradas Premium Open Bar para Coco Bongo mañana para dos adultos.”
            </button>

            {conversationId && (
              <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Conversation ID
                </p>
                <p className="mt-2 break-all font-mono text-xs text-slate-200">
                  {conversationId}
                </p>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
