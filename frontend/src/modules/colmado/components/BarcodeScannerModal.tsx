import { useEffect, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import { Camera, LoaderCircle, X } from "lucide-react";

interface BarcodeScannerModalProps {
  open: boolean;
  title?: string;
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScannerModal({
  open,
  title = "Escanear código de barra",
  onDetected,
  onClose,
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const detectedRef = useRef(onDetected);
  const closeRef = useRef(onClose);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    detectedRef.current = onDetected;
    closeRef.current = onClose;
  }, [onClose, onDetected]);

  useEffect(() => {
    if (!open || !videoRef.current) return;

    let active = true;
    let detected = false;
    setCameraReady(false);
    setError(null);
    const reader = new BrowserMultiFormatReader();

    void reader
      .decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, _scanError, controls) => {
          if (!active || detected || !result) return;
          detected = true;
          controls.stop();
          controlsRef.current = null;
          detectedRef.current(result.getText());
          closeRef.current();
        },
      )
      .then((controls) => {
        if (!active) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setCameraReady(true);
      })
      .catch(() => {
        if (!active) return;
        setError(
          "No pudimos abrir la cámara. Revisa el permiso o escribe el código manualmente.",
        );
      });

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  function closeScanner() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="barcode-scanner-title"
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
    >
      <header className="flex min-h-16 items-center gap-3 px-4">
        <Camera aria-hidden="true" />
        <h2 id="barcode-scanner-title" className="flex-1 text-lg font-black">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Cerrar cámara"
          className="grid h-11 w-11 place-items-center rounded-full bg-white text-black"
          onClick={closeScanner}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full object-cover"
        />

        {!cameraReady && !error && (
          <div className="absolute inset-0 grid place-items-center bg-black/70">
            <div className="text-center">
              <LoaderCircle
                aria-hidden="true"
                className="mx-auto animate-spin"
                size={38}
              />
              <p className="mt-3 font-bold">Abriendo cámara...</p>
            </div>
          </div>
        )}

        {cameraReady && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-40 w-[min(82vw,28rem)] rounded-2xl border-4 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}

        {error && (
          <div className="absolute inset-0 grid place-items-center bg-black/80 p-6">
            <div className="max-w-sm rounded-2xl bg-white p-5 text-center text-slate-900">
              <p className="font-black">No hay acceso a la cámara</p>
              <p className="mt-2 text-sm text-slate-600">{error}</p>
              <button
                type="button"
                className="mt-5 min-h-12 w-full rounded-xl bg-emerald-700 px-4 font-black text-white"
                onClick={closeScanner}
              >
                Escribir código
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="px-4 py-5 text-center text-sm font-bold">
        Coloca el código dentro del recuadro
      </p>
    </div>
  );
}
