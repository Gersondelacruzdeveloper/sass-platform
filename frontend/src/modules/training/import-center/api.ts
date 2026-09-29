import api from "../../../api/axios";
import type { ImportJob } from "./types";

const base = "/training/import-center";

export async function previewTrainingImport(file: File): Promise<ImportJob> {
  const body = new FormData();
  body.append("file", file);
  const response = await api.post(`${base}/preview/`, body, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function applyTrainingImport(jobId: number): Promise<ImportJob> {
  const response = await api.post(`${base}/jobs/${jobId}/apply/`);
  return response.data;
}

export async function rollbackTrainingImport(jobId: number) {
  const response = await api.post(`${base}/jobs/${jobId}/rollback/`);
  return response.data;
}

export async function getTrainingImportJobs(): Promise<ImportJob[]> {
  const response = await api.get(`${base}/jobs/`);
  return response.data;
}

export async function downloadTrainingImportTemplate() {
  const response = await api.get(`${base}/template/`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Training_Import_Template.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
