// src/modules/ticketing/pages/operations/TicketingScannerPage.tsx

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
  AlertTriangle,
  ArrowLeft,
  Building2,
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

type BarcodeDetection = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetection[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorInstance;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

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

function getResultTone(result?: string) {
  switch (result) {
    case "valid":
    case "partially_used":
      return {
        wrapper: "border-emerald-200 bg-emerald-50",
        icon: "bg-emerald-100 text-emerald-700",
        title: "text-emerald-950",
        body: "text-emerald-800",
      };
    case "already_used":
      return {
        wrapper: "border-amber-200 bg-amber-50",
        icon: "bg-amber-100 text-amber-700",
        title: "text-amber-950",
        body: "text-amber-800",
      };
    default:
      return {
        wrapper: "border-rose-200 bg-rose-50",
        icon: "bg-rose-100 text-rose-700",
        title: "text-rose-950",
        body: "text-rose-800",
      };
  }
}

export default function TicketingScannerPage() {
  const {
    slug,
    companyName,
  } = useOutletContext<TicketingDashboardOutletContext>();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
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
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    cameraStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    cameraStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

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

  const runDetectionLoop = useCallback(
    async (detector: BarcodeDetectorInstance) => {
      const video = videoRef.current;

      if (
        !video ||
        !cameraStreamRef.current ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        animationFrameRef.current = requestAnimationFrame(() => {
          void runDetectionLoop(detector);
        });
        return;
      }

      if (!detectionPausedRef.current) {
        try {
          const codes = await detector.detect(video);
          const detectedValue = codes[0]?.rawValue?.trim();

          if (
            detectedValue &&
            detectedValue !== lastDetectedValueRef.current
          ) {
            lastDetectedValueRef.current = detectedValue;
            setManualValue(detectedValue);

            if ("vibrate" in navigator) {
              navigator.vibrate(100);
            }

            void resolveToken(detectedValue);
          }
        } catch {
          // Continue scanning. Some browsers intermittently reject frames.
        }
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        void runDetectionLoop(detector);
      });
    },
    [resolveToken],
  );

  const startCamera = useCallback(async () => {
    if (!selectedEntityId) {
      setCameraError("Select a business entity before starting the scanner.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not supported by this browser.");
      return;
    }

    if (!window.BarcodeDetector) {
      setCameraError(
        "Automatic QR detection is not supported by this browser. Use manual entry below.",
      );
      return;
    }

    setCameraError("");
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
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
        audio: false,
      });

      cameraStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new window.BarcodeDetector({
        formats: ["qr_code"],
      });

      setCameraActive(true);
      setStatus("camera_ready");
      detectionPausedRef.current = false;
      lastDetectedValueRef.current = "";

      void runDetectionLoop(detector);
    } catch (cameraRequestError) {
      stopCamera();
      setCameraError(
        cameraRequestError instanceof Error
          ? cameraRequestError.message
          : "The camera could not be started.",
      );
    }
  }, [runDetectionLoop, selectedEntityId, stopCamera]);

  useEffect(() => {
    setDeviceId(createDeviceId());
    setCameraSupported(
      Boolean(
        navigator.mediaDevices &&
          window.BarcodeDetector,
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

  const tone = getResultTone(resolution?.result);

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
                    Select a business entity and start the camera.
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
              className={`rounded-[2rem] border p-6 shadow-sm ${tone.wrapper}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-3xl ${tone.icon}`}
                >
                  {status === "admitted" ? (
                    <CheckCircle2 className="h-7 w-7" />
                  ) : resolution.ok ? (
                    <ShieldCheck className="h-7 w-7" />
                  ) : (
                    <CircleAlert className="h-7 w-7" />
                  )}
                </div>

                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-600">
                  {status === "admitted"
                    ? "Admitted"
                    : String(resolution.result).replaceAll(
                        "_",
                        " ",
                      )}
                </span>
              </div>

              <h2
                className={`mt-5 text-2xl font-black ${tone.title}`}
              >
                {status === "admitted"
                  ? "Guests admitted successfully"
                  : resolution.message}
              </h2>

              <div className="mt-5 space-y-3 rounded-3xl bg-white/70 p-4">
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
                        className={`mb-2 block text-sm font-black ${tone.body}`}
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
                  Scan next ticket
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
