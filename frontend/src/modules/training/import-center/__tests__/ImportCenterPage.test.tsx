import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ImportCenterPage from "../ImportCenterPage";

vi.mock("../api", () => ({
  getTrainingImportJobs: vi.fn(),

  previewTrainingImport: vi.fn(),

  applyTrainingImport: vi.fn(),

  rollbackTrainingImport: vi.fn(),

  downloadTrainingImportTemplate: vi.fn(),
}));

import {
  applyTrainingImport,
  getTrainingImportJobs,
  previewTrainingImport,
  rollbackTrainingImport,
  downloadTrainingImportTemplate,
} from "../api";

const previewResponse = {
  id: 7,
  file_name: "moon.xlsx",
  file_sha256: "x",
  dataset_key: "moon",
  dataset_version: "1.0",
  status: "preview",
  error_message: "",
  created_at: "2026-09-28T00:00:00Z",
  applied_at: null,
  rolled_back_at: null,
  created_by_name: "manager",
  preview: {
    valid: true,
    errors: [],
    warnings: [],
    counts: {
      standards: 152,
      procedures: 18,
      templates: 12,
      questions: 152,
    },
  },
  result: {},
};

const appliedResponse = {
  status: "applied",
  result: {
    summary: {
      standards: {
        created: 152,
        updated: 0,
        protected: 0,
      },
      procedures: {
        created: 18,
        updated: 0,
        protected: 0,
      },
      templates: {
        created: 12,
        updated: 0,
        protected: 0,
      },
      questions: {
        created: 152,
        updated: 0,
        protected: 0,
      },
    },
  },
};

describe("ImportCenterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getTrainingImportJobs).mockResolvedValue([]);

    vi.mocked(previewTrainingImport).mockResolvedValue(
      previewResponse as any
    );

    vi.mocked(applyTrainingImport).mockResolvedValue(
      appliedResponse as any
    );

    vi.mocked(rollbackTrainingImport).mockResolvedValue(
      {} as any
    );

    vi.mocked(downloadTrainingImportTemplate).mockResolvedValue(
      undefined as any
    );
  });

  it("shows a simple upload-first workflow", async () => {
    render(<ImportCenterPage />);

    expect(
      screen.getByText(/Carga todo sin crear registros uno por uno/i)
    ).toBeInTheDocument();

    const previewButton = screen.getByRole("button", {
      name: /Validar y ver preview/i,
    });

    expect(previewButton).toBeDisabled();

    expect(
      await screen.findByText(/Aún no hay importaciones/i)
    ).toBeInTheDocument();
  });

  it("previews counts before apply", async () => {
    const user = userEvent.setup();

    render(<ImportCenterPage />);

    const input = screen.getByTestId(
      "import-file"
    ) as HTMLInputElement;

    const file = new File(
      ["xlsx"],
      "moon.xlsx",
      {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
    );

    await user.upload(input, file);

    const previewButton = screen.getByRole("button", {
      name: /Validar y ver preview/i,
    });

    expect(previewButton).toBeEnabled();

    await user.click(previewButton);

    await waitFor(() => {
      expect(
        previewTrainingImport
      ).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText(/Listo para importar/i)
    ).toBeInTheDocument();

    const values152 = await screen.findAllByText("152");

    expect(values152.length).toBeGreaterThanOrEqual(2);

    expect(
      screen.getByText("18")
    ).toBeInTheDocument();

    expect(
      screen.getByText("12")
    ).toBeInTheDocument();
  });

  it("applies only after a valid preview", async () => {
    const user = userEvent.setup();

    render(<ImportCenterPage />);

    const input = screen.getByTestId(
      "import-file"
    ) as HTMLInputElement;

    const file = new File(
      ["xlsx"],
      "moon.xlsx",
      {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
    );

    await user.upload(input, file);

    await user.click(
      screen.getByRole("button", {
        name: /Validar y ver preview/i,
      })
    );

    await waitFor(() => {
      expect(
        previewTrainingImport
      ).toHaveBeenCalledTimes(1);
    });

    const applyButton =
      await screen.findByRole("button", {
        name: /Aplicar importación/i,
      });

    expect(applyButton).toBeEnabled();

    await user.click(applyButton);

    await waitFor(() => {
      expect(
        applyTrainingImport
      ).toHaveBeenCalledTimes(1);
    });

    expect(
      applyTrainingImport
    ).toHaveBeenCalledWith(7);
  });
});