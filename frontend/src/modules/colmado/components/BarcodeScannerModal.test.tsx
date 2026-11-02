import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BarcodeScannerModal from "./BarcodeScannerModal";

type ScannerCallback = (
  result: { getText: () => string } | null,
  error: unknown,
  controls: { stop: () => void },
) => void;

const scannerMocks = vi.hoisted(() => ({
  decodeFromVideoDevice: vi.fn(),
  stop: vi.fn(),
  callback: null as ScannerCallback | null,
  shouldReject: false,
  rejection: null as unknown,
}));

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class BrowserMultiFormatReader {
    decodeFromVideoDevice(
      deviceId: string | undefined,
      video: HTMLVideoElement,
      callback: ScannerCallback,
    ) {
      scannerMocks.decodeFromVideoDevice(deviceId, video, callback);
      scannerMocks.callback = callback;

      if (scannerMocks.shouldReject) {
        return Promise.reject(scannerMocks.rejection);
      }

      return Promise.resolve({ stop: scannerMocks.stop });
    }
  },
}));

function renderScanner(
  options: {
    open?: boolean;
    onDetected?: (barcode: string) => void;
    onClose?: () => void;
  } = {},
) {
  return render(
    <BarcodeScannerModal
      open={options.open ?? true}
      title="Escanear producto de prueba"
      onDetected={options.onDetected ?? vi.fn()}
      onClose={options.onClose ?? vi.fn()}
    />,
  );
}

describe("BarcodeScannerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scannerMocks.callback = null;
    scannerMocks.shouldReject = false;
    scannerMocks.rejection = null;
  });

  it("does not start the camera while the modal is closed", () => {
    renderScanner({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(scannerMocks.decodeFromVideoDevice).not.toHaveBeenCalled();
  });

  it("opens the scanner and starts the preferred device camera", async () => {
    renderScanner();

    expect(
      screen.getByRole("dialog", {
        name: "Escanear producto de prueba",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Abriendo cámara...")).toBeInTheDocument();

    await waitFor(() => {
      expect(scannerMocks.decodeFromVideoDevice).toHaveBeenCalledWith(
        undefined,
        expect.any(HTMLVideoElement),
        expect.any(Function),
      );
    });
  });

  it("returns only the first detected barcode and closes the scanner", async () => {
    const onDetected = vi.fn();
    const onClose = vi.fn();
    renderScanner({ onDetected, onClose });

    await waitFor(() => expect(scannerMocks.callback).not.toBeNull());

    act(() => {
      scannerMocks.callback?.(
        { getText: () => " 746000000001 " },
        null,
        { stop: scannerMocks.stop },
      );
      scannerMocks.callback?.(
        { getText: () => "746000000001" },
        null,
        { stop: scannerMocks.stop },
      );
    });

    expect(onDetected).toHaveBeenCalledOnce();
    expect(onDetected).toHaveBeenCalledWith("746000000001");
    expect(onClose).toHaveBeenCalledOnce();
    expect(scannerMocks.stop).toHaveBeenCalledOnce();
  });

  it("stops the camera when the employee closes the scanner", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderScanner({ onClose });

    await waitFor(() => {
      expect(scannerMocks.decodeFromVideoDevice).toHaveBeenCalledOnce();
    });

    await user.click(
      screen.getByRole("button", {
        name: "Cerrar cámara",
      }),
    );

    expect(scannerMocks.stop).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps a camera permission error visible inside the modal", async () => {
    scannerMocks.shouldReject = true;
    scannerMocks.rejection = Object.assign(new Error("Permission denied"), {
      name: "NotAllowedError",
    });

    renderScanner();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El permiso de la cámara está bloqueado",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("lets the employee return to manual barcode entry after an error", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    scannerMocks.shouldReject = true;
    scannerMocks.rejection = Object.assign(new Error("Camera busy"), {
      name: "NotReadableError",
    });

    renderScanner({ onClose });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Otra aplicación está usando la cámara",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Escribir código",
      }),
    );

    expect(onClose).toHaveBeenCalledOnce();
  });
});
