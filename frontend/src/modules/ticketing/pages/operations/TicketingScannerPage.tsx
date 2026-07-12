// src/modules/ticketing/pages/operations/TicketingScannerPage.tsx
// UI version: iphone-zxing-camera-v4-2026-07-12

import type { FormEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  BrowserQRCodeReader,
  type IScannerControls,
} from "@zxing/browser";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Camera,
  CameraOff,
  CheckCircle2,
  CircleAlert,
  Keyboard,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";

import ticketingApi from "../../api/ticketingApi";
import type {
  TicketScanResolution,
  TicketingBusinessEntity,
} from "../../types/ticketingTypes";
import type { TicketingDashboardOutletContext } from "../../layouts/TicketingDashboardLayout";

type ScannerStatus =
  | "idle"
  | "camera_ready"
  | "resolving"
  | "valid"
  | "invalid"
  | "admitting"
  | "admitted";

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            detail?: string;
            message?: string;
            result?: string;
          };
        };
      }
    ).response;

    return (
      response?.data?.detail ||
      response?.data?.message ||
      "The ticket could not be processed."
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The ticket could not be processed.";
}

function createDeviceId(): string {
  const storageKey = "ticketing_scanner_device_id";
  const existing = window.localStorage.getItem(storageKey);

  if (existing) return existing;

  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `scanner-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(storageKey, value);
  return value;
}

function formatServiceDate(value?: string | null): string {
  if (!value) return "Date not available";

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getDaysUntilService(value?: string | null): number | null {
  if (!value) return null;

  const serviceDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(serviceDate.getTime())) return null;

  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  return Math.round(
    (serviceDate.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24),
  );
}

function getResultPresentation(
  result?: string,
  serviceDate?: string | null,
) {
  const daysUntilService = getDaysUntilService(serviceDate);

  switch (result) {
    case "valid":
    case "partially_used":
      return {
        wrapper: "border-emerald-200 bg-emerald-50",
        icon: "bg-emerald-100 text-emerald-700",
        title: "text-emerald-950",
        body: "text-emerald-800",
        badge: "bg-emerald-100 text-emerald-700",
        heading: "Ticket is ready for admission",
        description:
          "The ticket is valid for this venue. Review the guest quantity and confirm entry.",
        actionLabel: "Scan next ticket",
      };

    case "wrong_date":
      return {
        wrapper: "border-amber-200 bg-amber-50",
        icon: "bg-amber-100 text-amber-700",
        title: "text-amber-950",
        body: "text-amber-800",
        badge: "bg-amber-100 text-amber-700",
        heading: "Valid ticket — scheduled for another date",
        description:
          daysUntilService !== null && daysUntilService > 0
            ? `This booking is valid, but entry begins in ${daysUntilService} ${
                daysUntilService === 1 ? "day" : "days"
              }. Ask the guest to return on the scheduled service date.`
            : "This booking is valid, but it is not scheduled for today. Check the service date below before allowing entry.",
        actionLabel: "Scan another ticket",
      };

    case "already_used":
      return {
        wrapper: "border-amber-200 bg-amber-50",
        icon: "bg-amber-100 text-amber-700",
        title: "text-amber-950",
        body: "text-amber-800",
        badge: "bg-amber-100 text-amber-700",
        heading: "Ticket has already been fully used",
        description:
          "No admissions remain on this ticket. Review the booking details before taking any further action.",
        actionLabel: "Scan another ticket",
      };

    case "wrong_partner":
      return {
        wrapper: "border-violet-200 bg-violet-50",
        icon: "bg-violet-100 text-violet-700",
        title: "text-violet-950",
        body: "text-violet-800",
        badge: "bg-violet-100 text-violet-700",
        heading: "Ticket belongs to another venue",
        description:
          "The ticket is valid, but it must be scanned by the business entity shown in the ticket details.",
        actionLabel: "Scan another ticket",
      };

    case "expired":
      return {
        wrapper: "border-slate-300 bg-slate-100",
        icon: "bg-slate-200 text-slate-700",
        title: "text-slate-950",
        body: "text-slate-700",
        badge: "bg-slate-200 text-slate-700",
        heading: "Ticket has expired",
        description:
          "The permitted admission period has ended. Do not admit the guest without manager approval.",
        actionLabel: "Scan another ticket",
      };

    case "revoked":
    case "cancelled":
    case "refunded":
      return {
        wrapper: "border-rose-200 bg-rose-50",
        icon: "bg-rose-100 text-rose-700",
        title: "text-rose-950",
        body: "text-rose-800",
        badge: "bg-rose-100 text-rose-700",
        heading: "Ticket is not eligible for admission",
        description:
          "This ticket was cancelled, refunded, or revoked. Do not admit the guest.",
        actionLabel: "Scan another ticket",
      };

    default:
      return {
        wrapper: "border-rose-200 bg-rose-50",
        icon: "bg-rose-100 text-rose-700",
        title: "text-rose-950",
        body: "text-rose-800",
        badge: "bg-rose-100 text-rose-700",
        heading: "Ticket could not be validated",
        description:
          "Review the message and ticket information below. Do not admit the guest unless the ticket becomes valid.",
        actionLabel: "Scan another ticket",
      };
  }
}

function getScanResolutionFromError(
  error: unknown,
): TicketScanResolution | null {
  if (
    typeof error !== "object" ||
    error === null ||
    !("response" in error)
  ) {
    return null;
  }

  const response = (
    error as {
      response?: {
        data?: unknown;
      };
    }
  ).response;

  const data = response?.data;

  if (
    typeof data !== "object" ||
    data === null ||
    !("result" in data) ||
    !("message" in data)
  ) {
    return null;
  }

  return data as TicketScanResolution;
}


export default function TicketingScannerPage() {
  const {
    slug,
    companyName,
  } = useOutletContext<TicketingDashboardOutletContext>();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const zxingReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const lastDetectedValueRef = useRef<string>("");
  const detectionPausedRef = useRef(false);

  const [entities, setEntities] = useState<
    TicketingBusinessEntity[]
  >([]);
  const [selectedEntityId, setSelectedEntityId] = useState<
    number | ""
  >("");
  const [loadingEntities, setLoadingEntities] = useState(true);

  const [manualValue, setManualValue] = useState("");
  const [requestedQuantity, setRequestedQuantity] = useState(1);
  const [resolution, setResolution] =
    useState<TicketScanResolution | null>(null);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [error, setError] = useState("");

  const [cameraSupported, setCameraSupported] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [deviceId, setDeviceId] = useState("");

  const selectedEntity = useMemo(
    () =>
      entities.find((entity) => entity.id === selectedEntityId) ||
      null,
    [entities, selectedEntityId],
  );

  const scannerName = useMemo(() => {
    return `${companyName} Operations Scanner`;
  }, [companyName]);

  const stopCamera = useCallback(() => {
    try {
      zxingControlsRef.current?.stop();
    } catch {
      // The controls may already be stopped.
    }

    zxingControlsRef.current = null;
    zxingReaderRef.current = null;

    if (videoRef.current) {
      const stream = videoRef.current.srcObject;

      if (stream instanceof MediaStream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }

    detectionPausedRef.current = false;
    lastDetectedValueRef.current = "";
    setCameraActive(false);
  }, []);

  const resetScan = useCallback(() => {
    setResolution(null);
    setManualValue("");
    setRequestedQuantity(1);
    setError("");
    setStatus(cameraActive ? "camera_ready" : "idle");
    detectionPausedRef.current = false;
    lastDetectedValueRef.current = "";
  }, [cameraActive]);

  const resolveToken = useCallback(
    async (tokenValue: string) => {
      const trimmed = tokenValue.trim();
      if (!trimmed || !selectedEntityId) return;

      detectionPausedRef.current = true;
      setError("");
      setStatus("resolving");

      try {
        const response = await ticketingApi.resolveTicket(
          {
            token: trimmed,
            business_entity_id: Number(selectedEntityId),
            requested_quantity: requestedQuantity,
            scanner_device_id: deviceId,
            scanner_name: scannerName,
            location_name: selectedEntity?.name || "",
          },
          slug,
        );

        setResolution(response);
        setManualValue(trimmed);
        setStatus(response.ok ? "valid" : "invalid");
      } catch (requestError) {
        const structuredResolution =
          getScanResolutionFromError(requestError);

        if (structuredResolution) {
          setResolution(structuredResolution);
          setManualValue(trimmed);
          setError("");
          setStatus(
            structuredResolution.ok ? "valid" : "invalid",
          );
          return;
        }

        setResolution(null);
        setError(getErrorMessage(requestError));
        setStatus("invalid");
      }
    },
    [
      deviceId,
      requestedQuantity,
      scannerName,
      selectedEntity,
      selectedEntityId,
      slug,
    ],
  );

  const startCamera = useCallback(async () => {
    if (!selectedEntityId) {
      setCameraError(
        "Select a business entity before starting the scanner.",
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Camera access is not supported by this browser.",
      );
      return;
    }

    const video = videoRef.current;

    if (!video) {
      setCameraError(
        "The camera preview is not ready. Reload the page and try again.",
      );
      return;
    }

    setCameraError("");
    stopCamera();

    try {
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 800,
      });

      zxingReaderRef.current = reader;
      detectionPausedRef.current = false;
      lastDetectedValueRef.current = "";

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: {
              ideal: "environment",
            },
            width: {
              ideal: 1280,
            },
            height: {
              ideal: 720,
            },
          },
        },
        video,
        (result) => {
          if (!result || detectionPausedRef.current) {
            return;
          }

          const detectedValue = result.getText().trim();

          if (
            !detectedValue ||
            detectedValue === lastDetectedValueRef.current
          ) {
            return;
          }

          detectionPausedRef.current = true;
          lastDetectedValueRef.current = detectedValue;
          setManualValue(detectedValue);

          if ("vibrate" in navigator) {
            navigator.vibrate(100);
          }

          void resolveToken(detectedValue);
        },
      );

      zxingControlsRef.current = controls;
      setCameraActive(true);
      setStatus("camera_ready");
    } catch (cameraRequestError) {
      stopCamera();

      const message =
        cameraRequestError instanceof Error
          ? cameraRequestError.message
          : "The camera could not be started.";

      if (
        message.toLowerCase().includes("permission") ||
        message.toLowerCase().includes("notallowed")
      ) {
        setCameraError(
          "Camera permission was denied. Allow camera access for this website in Safari settings, then reload the page.",
        );
        return;
      }

      setCameraError(message);
    }
  }, [resolveToken, selectedEntityId, stopCamera]);

  useEffect(() => {
    setDeviceId(createDeviceId());
    setCameraSupported(
      Boolean(
        typeof navigator !== "undefined" &&
          typeof navigator.mediaDevices?.getUserMedia ===
            "function",
      ),
    );
  }, []);

  useEffect(() => {
    async function loadEntities() {
      if (!slug) return;

      setLoadingEntities(true);

      try {
        const data = await ticketingApi.getMyBusinessEntities(slug);
        setEntities(data);

        if (data.length === 1) {
          setSelectedEntityId(data[0].id);
        }
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      } finally {
        setLoadingEntities(false);
      }
    }

    void loadEntities();
  }, [slug]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  async function handleManualSubmit(event: FormEvent) {
    event.preventDefault();

    if (!manualValue.trim()) {
      setError("Enter or scan a ticket QR value.");
      return;
    }

    if (!selectedEntityId) {
      setError("Select the business entity checking in this guest.");
      return;
    }

    await resolveToken(manualValue);
  }

  async function handleAdmit() {
    if (!resolution?.token || !selectedEntityId) return;

    setStatus("admitting");
    setError("");

    try {
      const admitted = await ticketingApi.admitTicket(
        {
          token: resolution.token,
          business_entity_id: Number(selectedEntityId),
          requested_quantity: requestedQuantity,
          scanner_device_id: deviceId,
          scanner_name: scannerName,
          location_name: selectedEntity?.name || "",
          confirm: true,
        },
        slug,
      );

      setResolution(admitted);
      setStatus("admitted");

      if ("vibrate" in navigator) {
        navigator.vibrate([100, 60, 100]);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setStatus("invalid");
    }
  }

  const remainingAdmissions =
    resolution?.remaining_admissions ?? 0;

  const quantityOptions = useMemo(() => {
    const maximum = Math.max(
      resolution?.remaining_admissions || 1,
      1,
    );

    return Array.from(
      {
        length: Math.min(maximum, 20),
      },
      (_, index) => index + 1,
    );
  }, [resolution]);

  const presentation = getResultPresentation(
    resolution?.result,
    resolution?.service_date,
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-[2rem] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            to={`/ticketing/${slug}/operations/dashboard`}
            className="mb-4 inline-flex items-center gap-2 text-sm font-black text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Operations dashboard
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <ScanLine className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight">
                QR Ticket Scanner
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/50">
                Validate tickets and admit guests securely.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">
            Scanner device
          </p>
          <p className="mt-1 max-w-[18rem] truncate text-sm font-bold text-white/80">
            {deviceId || "Preparing device..."}
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Business entity
                </span>

                <select
                  value={selectedEntityId}
                  onChange={(event) => {
                    setSelectedEntityId(
                      event.target.value
                        ? Number(event.target.value)
                        : "",
                    );
                    resetScan();
                  }}
                  disabled={loadingEntities}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                >
                  <option value="">
                    {loadingEntities
                      ? "Loading entities..."
                      : "Select business entity"}
                  </option>

                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="sm:self-end">
                {cameraActive ? (
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 text-sm font-black text-rose-700 transition hover:bg-rose-100 sm:w-auto"
                  >
                    <CameraOff className="h-4 w-4" />
                    Stop camera
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    disabled={
                      !cameraSupported ||
                      !selectedEntityId
                    }
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    <Camera className="h-4 w-4" />
                    Start camera
                  </button>
                )}
              </div>
            </div>

            <div className="relative mt-5 overflow-hidden rounded-[1.75rem] bg-slate-950">
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                className={`aspect-[4/3] w-full object-cover ${
                  cameraActive ? "block" : "hidden"
                }`}
              />

              {!cameraActive && (
                <div className="flex aspect-[4/3] flex-col items-center justify-center px-6 text-center text-white">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
                    <QrCode className="h-8 w-8" />
                  </div>

                  <p className="mt-5 text-lg font-black">
                    Camera scanner is ready
                  </p>
                  <p className="mt-2 max-w-sm text-sm font-semibold leading-6 text-white/50">
                    Select a business entity and start the rear camera.
                    You can also enter the ticket token manually.
                  </p>
                </div>
              )}

              {cameraActive && (
                <>
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,.25),transparent_25%,transparent_75%,rgba(2,6,23,.35))]" />
                  <div className="pointer-events-none absolute inset-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border-4 border-white/80 shadow-[0_0_0_999px_rgba(2,6,23,.3)] sm:h-64 sm:w-64" />
                  <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/70 px-4 py-2 text-xs font-black text-white backdrop-blur">
                    Place the QR code inside the frame
                  </div>
                </>
              )}
            </div>

            {cameraError && (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm font-semibold">
                  {cameraError}
                </p>
              </div>
            )}
          </article>

          <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <Keyboard className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-black text-slate-950">
                  Manual ticket entry
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  Paste the UUID or full QR verification URL.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleManualSubmit}
              className="mt-5 space-y-4"
            >
              <textarea
                value={manualValue}
                onChange={(event) =>
                  setManualValue(event.target.value)
                }
                placeholder="Paste ticket token or QR URL..."
                rows={3}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              />

              <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Guests to admit
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={requestedQuantity}
                    onChange={(event) =>
                      setRequestedQuantity(
                        Math.max(
                          1,
                          Number(event.target.value) || 1,
                        ),
                      )
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <button
                  type="submit"
                  disabled={
                    status === "resolving" ||
                    !manualValue.trim() ||
                    !selectedEntityId
                  }
                  className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {status === "resolving" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4" />
                  )}
                  Validate ticket
                </button>
              </div>
            </form>
          </article>
        </div>

        <div className="space-y-6">
          {!resolution && !error && (
            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
                <ScanLine className="h-8 w-8" />
              </div>

              <h2 className="mt-5 text-xl font-black text-slate-950">
                Waiting for a ticket
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                Scan a customer QR code or enter the ticket token
                manually. Ticket details will appear here before
                admission is confirmed.
              </p>
            </article>
          )}

          {error && (
            <article className="rounded-[2rem] border border-rose-200 bg-rose-50 p-6 shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-rose-100 text-rose-700">
                <XCircle className="h-7 w-7" />
              </div>

              <h2 className="mt-5 text-xl font-black text-rose-950">
                Ticket could not be processed
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-rose-800">
                {error}
              </p>

              <button
                type="button"
                onClick={resetScan}
                className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-700 px-4 text-sm font-black text-white transition hover:bg-rose-800"
              >
                <RefreshCw className="h-4 w-4" />
                Scan another ticket
              </button>
            </article>
          )}

          {resolution && (
            <article
              className={`rounded-[2rem] border p-6 shadow-sm ${presentation.wrapper}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-3xl ${presentation.icon}`}
                >
                  {status === "admitted" ? (
                    <CheckCircle2 className="h-7 w-7" />
                  ) : resolution.ok ? (
                    <ShieldCheck className="h-7 w-7" />
                  ) : (
                    <CircleAlert className="h-7 w-7" />
                  )}
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${
                    status === "admitted"
                      ? "bg-emerald-100 text-emerald-700"
                      : presentation.badge
                  }`}
                >
                  {status === "admitted"
                    ? "Admitted"
                    : String(resolution.result).replaceAll(
                        "_",
                        " ",
                      )}
                </span>
              </div>

              <h2
                className={`mt-5 text-2xl font-black ${presentation.title}`}
              >
                {status === "admitted"
                  ? "Guests admitted successfully"
                  : presentation.heading}
              </h2>

              <p
                className={`mt-2 text-sm font-semibold leading-6 ${presentation.body}`}
              >
                {status === "admitted"
                  ? "The admission has been recorded and the ticket balance has been updated."
                  : presentation.description}
              </p>

              {status !== "admitted" &&
                resolution.message &&
                resolution.message !==
                  presentation.description && (
                  <p
                    className={`mt-2 text-xs font-bold ${presentation.body}`}
                  >
                    System message: {resolution.message}
                  </p>
                )}

              {resolution.result === "wrong_date" &&
                resolution.service_date && (
                  <div className="mt-5 flex items-start gap-3 rounded-3xl border border-amber-200 bg-white/80 p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                      <CalendarDays className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-600">
                        Valid service date
                      </p>
                      <p className="mt-1 text-base font-black text-amber-950">
                        {formatServiceDate(
                          resolution.service_date,
                        )}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-amber-700">
                        Entry must not be confirmed before this date.
                      </p>
                    </div>
                  </div>
                )}

              <div className="mt-5 space-y-3 rounded-3xl bg-white/80 p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Booking
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {resolution.booking_code || "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Product
                  </span>
                  <span className="max-w-[60%] text-right text-sm font-black text-slate-900">
                    {resolution.product_name || "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Entity
                  </span>
                  <span className="max-w-[60%] text-right text-sm font-black text-slate-900">
                    {resolution.business_entity_name ||
                      selectedEntity?.name ||
                      "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Service date
                  </span>
                  <span className="max-w-[65%] text-right text-sm font-black text-slate-900">
                    {formatServiceDate(
                      resolution.service_date,
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Booking status
                  </span>
                  <span className="text-right text-sm font-black capitalize text-slate-900">
                    {String(
                      resolution.booking_status || "—",
                    ).replaceAll("_", " ")}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="rounded-2xl bg-slate-100 p-3 text-center">
                    <p className="text-lg font-black text-slate-950">
                      {resolution.total_admissions ?? 0}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Total
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-100 p-3 text-center">
                    <p className="text-lg font-black text-slate-950">
                      {resolution.admitted_quantity ?? 0}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Used
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-100 p-3 text-center">
                    <p className="text-lg font-black text-slate-950">
                      {remainingAdmissions}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                      Remaining
                    </p>
                  </div>
                </div>
              </div>

              {resolution.ok && status !== "admitted" && (
                <div className="mt-5">
                  {remainingAdmissions > 1 && (
                    <label className="mb-4 block">
                      <span
                        className={`mb-2 block text-sm font-black ${presentation.body}`}
                      >
                        Number of guests entering
                      </span>
                      <select
                        value={requestedQuantity}
                        onChange={(event) =>
                          setRequestedQuantity(
                            Number(event.target.value),
                          )
                        }
                        className="h-12 w-full rounded-2xl border border-white/80 bg-white px-4 text-sm font-black text-slate-900 outline-none"
                      >
                        {quantityOptions.map((quantity) => (
                          <option key={quantity} value={quantity}>
                            {quantity}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleAdmit()}
                    disabled={status === "admitting"}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 text-sm font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === "admitting" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Users className="h-4 w-4" />
                    )}
                    Confirm entry
                  </button>
                </div>
              )}

              {(status === "admitted" || !resolution.ok) && (
                <button
                  type="button"
                  onClick={resetScan}
                  className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-900"
                >
                  <RefreshCw className="h-4 w-4" />
                  {status === "admitted"
                    ? "Scan next ticket"
                    : presentation.actionLabel}
                </button>
              )}
            </article>
          )}

          <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                <Building2 className="h-5 w-5" />
              </div>

              <div>
                <p className="font-black text-slate-950">
                  Current scanner location
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {selectedEntity?.name ||
                    "No business entity selected"}
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
