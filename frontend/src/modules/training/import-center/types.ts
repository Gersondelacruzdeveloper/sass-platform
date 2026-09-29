export type ImportCounts = {
  standards: number;
  procedures: number;
  templates: number;
  questions: number;
};

export type ImportPreview = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  counts: ImportCounts;
};

export type ImportSummarySection = {
  created: number;
  updated: number;
  protected?: number;
};

export type ImportJob = {
  id: number;
  file_name: string;
  file_sha256: string;
  dataset_key: string;
  dataset_version: string;
  status: "preview" | "applied" | "failed" | "rolled_back";
  preview: ImportPreview;
  result: {
    summary?: Record<string, ImportSummarySection>;
    rollback?: { deleted: number; restored: number; skipped: number };
    warnings?: string[];
  };
  error_message: string;
  created_at: string;
  applied_at: string | null;
  rolled_back_at: string | null;
  created_by_name: string;
  sample?: Record<string, Array<Record<string, unknown>>>;
};
