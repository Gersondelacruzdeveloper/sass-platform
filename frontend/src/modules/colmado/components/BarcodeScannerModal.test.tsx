import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BarcodeScannerModal from "./BarcodeScannerModal";

const scannerMocks = vi.hoisted(() => ({
  reader: vi.fn(),
  decodeFromVideoDevice: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: scannerMocks.reader,
}));

type ScanCallback = (
  result: { getText: () => string } | undefined,
  error: unknown,
  controls: { stop: () => void },
) => void;

let scanCallback: ScanCallback | null = null;

describe("BarcodeScannerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scanCallback = null;
    scannerMocks.reader.mockImplementation(() => ({
      decodeFromVideoDevice: scannerMocks.decodeFromVideoDevice,
    }));
    scannerMocks.decodeFromVideoDevice.mockImplementation(
      (
        _deviceId: unknown,
        _video: HTMLVideoElement,
        callback: ScanCallback,
      ) => {
        scanCallback = callback;
        return Promise.resolve({ stop: scannerMocks.stop });
      },
    );
  });

  it("does not request camera access while the modal is closed", () => {
    render(
      <BarcodeScannerModal
        open={false}
        onDetected={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(scannerMocks.decodeFromVideoDevice).not.toHaveBeenCalled();
  });

  it("opens the camera with simple Spanish instructions", async () => {
    render(
      <BarcodeScannerModal
        open
        title="Escanear para inventario"
        onDetected={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Escanear para inventario" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Coloca el código dentro del recuadro")).toBeInTheDocument();
    await waitFor(() =>
      expect(scannerMocks.decodeFromVideoDevice).toHaveBeenCalledOnce(),
    );
  });

  it("reports one barcode, stops the camera and closes the modal", async () => {
    const onDetected = vi.fn();
    const onClose = vi.fn();
    render(
      <BarcodeScannerModal
        open
        onDetected={onDetected}
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(scanCallback).not.toBeNull());

    act(() => {
      scanCallback?.(
        { getText: () => "746000000001" },
        undefined,
        { stop: scannerMocks.stop },
      );
      scanCallback?.(
        { getText: () => "746000000001" },
        undefined,
        { stop: scannerMocks.stop },
      );
    });

    expect(onDetected).toHaveBeenCalledOnce();
    expect(onDetected).toHaveBeenCalledWith("746000000001");
    expect(scannerMocks.stop).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stops the active camera when the employee closes it manually", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BarcodeScannerModal
        open
        onDetected={vi.fn()}
        onClose={onClose}
      />,
    );
    await waitFor(() =>
      expect(scannerMocks.decodeFromVideoDevice).toHaveBeenCalledOnce(),
    );
    await waitFor(() =>
      expect(screen.queryByText("Abriendo cámara...")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Cerrar cámara" }));

    expect(scannerMocks.stop).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers manual entry when camera permission fails", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    scannerMocks.decodeFromVideoDevice.mockRejectedValue(
      new Error("Permission denied"),
    );
    render(
      <BarcodeScannerModal
        open
        onDetected={vi.fn()}
        onClose={onClose}
      />,
    );

    expect(
      await screen.findByText("No hay acceso a la cámara"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Revisa el permiso o escribe el código manualmente/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Escribir código" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
