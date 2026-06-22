// src/modules/disco/api/tablesApi.ts

import api from "../../../api/axios";

export type TableStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "cleaning"
  | "inactive";

export interface DiscoTable {
  id: number;
  organisation: number;

  name: string;
  floor?: string | null;

  capacity: number;
  minimum_spend: string;

  status: TableStatus;
  is_vip: boolean;

  created_at?: string;
  updated_at?: string;
}

export interface CreateTablePayload {
  name: string;
  floor?: string;
  capacity: number;
  minimum_spend?: number | string;
  status?: TableStatus;
  is_vip?: boolean;
}

export interface UpdateTablePayload extends Partial<CreateTablePayload> {}

export async function getTables(params?: { status?: TableStatus }) {
  const res = await api.get<DiscoTable[]>("/disco/tables/", {
    params,
  });

  return res.data;
}

export async function getTable(id: number) {
  const res = await api.get<DiscoTable>(`/disco/tables/${id}/`);
  return res.data;
}

export async function createTable(payload: CreateTablePayload) {
  const res = await api.post<DiscoTable>("/disco/tables/", payload);
  return res.data;
}

export async function updateTable(id: number, payload: UpdateTablePayload) {
  const res = await api.patch<DiscoTable>(`/disco/tables/${id}/`, payload);
  return res.data;
}

export async function deleteTable(id: number) {
  await api.delete(`/disco/tables/${id}/`);
}

export async function getAvailableTables() {
  return getTables({ status: "available" });
}

export async function getReservedTables() {
  return getTables({ status: "reserved" });
}

export async function getOccupiedTables() {
  return getTables({ status: "occupied" });
}

export async function getCleaningTables() {
  return getTables({ status: "cleaning" });
}

export async function getInactiveTables() {
  return getTables({ status: "inactive" });
}

export async function markTableAvailable(id: number) {
  return updateTable(id, { status: "available" });
}

export async function markTableOccupied(id: number) {
  return updateTable(id, { status: "occupied" });
}

export async function markTableReserved(id: number) {
  return updateTable(id, { status: "reserved" });
}

export async function markTableCleaning(id: number) {
  return updateTable(id, { status: "cleaning" });
}

export async function markTableInactive(id: number) {
  return updateTable(id, { status: "inactive" });
}