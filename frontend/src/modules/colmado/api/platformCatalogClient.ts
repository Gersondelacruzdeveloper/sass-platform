import api from "../../../api/axios";

import type { CatalogProduct } from "./colmadoClient";


type ApiList<T> = T[] | { results: T[] };


export interface PlatformCatalogFilters {
  search?: string;
  barcode?: string;
  category?: string;
  active?: boolean;
}


export interface SavePlatformProductPayload {
  barcode?: string | null;
  name: string;
  brand?: string;
  presentation?: string;
  category?: string;
  unit: "unit" | "lb" | "kg" | "liter" | "portion";
  sale_mode: "unit" | "weight" | "amount";
  units_per_case: number;
  is_active?: boolean;
}


export interface CatalogImportResult {
  id: number;
  import_number: string;
  uploaded_by: number;
  uploaded_by_name: string;
  original_filename: string;
  file_format: string;
  status: string;
  status_display: string;
  total_rows: number;
  created_products: number;
  updated_products: number;
  unchanged_products: number;
  error_rows: number;
  errors: unknown[];
  was_successful: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}


const listResults = <T>(data: ApiList<T>): T[] =>
  Array.isArray(data) ? data : data.results;


export async function getPlatformCatalog(
  filters: PlatformCatalogFilters = {},
): Promise<CatalogProduct[]> {
  const response = await api.get<ApiList<CatalogProduct>>(
    "/colmado/platform-catalog/",
    {
      params: {
        search: filters.search?.trim() || undefined,
        barcode: filters.barcode?.trim() || undefined,
        category: filters.category?.trim() || undefined,
        active:
          filters.active === undefined
            ? undefined
            : filters.active
              ? "true"
              : "false",
      },
    },
  );

  return listResults(response.data);
}


export async function createPlatformProduct(
  payload: SavePlatformProductPayload,
): Promise<CatalogProduct> {
  const response = await api.post<CatalogProduct>(
    "/colmado/platform-catalog/",
    payload,
  );

  return response.data;
}


export async function updatePlatformProduct(
  productId: number,
  payload: Partial<SavePlatformProductPayload>,
): Promise<CatalogProduct> {
  const response = await api.patch<CatalogProduct>(
    `/colmado/platform-catalog/${productId}/`,
    payload,
  );

  return response.data;
}


export async function getCatalogImports(): Promise<
  CatalogImportResult[]
> {
  const response = await api.get<ApiList<CatalogImportResult>>(
    "/colmado/catalog-imports/",
  );

  return listResults(response.data);
}


export async function importPlatformCatalog(
  file: File,
): Promise<CatalogImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await api.post<CatalogImportResult>(
    "/colmado/catalog-imports/",
    formData,
  );

  return response.data;
}


export async function downloadCatalogTemplate(): Promise<Blob> {
  const response = await api.get<Blob>(
    "/colmado/catalog-imports/template/",
    {
      responseType: "blob",
    },
  );

  return response.data;
}