import api from "../../../api/axios";

export type TableStatus =
  | "available"
  | "occupied"
  | "reserved"
  | "cleaning"
  | "out_of_service";

export interface DiscoTable {
  id: number;
  organisation: number;

  name: string;
  floor: string;

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

export interface UpdateTablePayload
  extends Partial<CreateTablePayload> {}

export async function getTables() {
  const res = await api.get<DiscoTable[]>("/disco/tables/");
  return res.data;
}

export async function getTable(id: number) {
  const res = await api.get<DiscoTable>(
    `/disco/tables/${id}/`
  );
  return res.data;
}

export async function createTable(
  payload: CreateTablePayload
) {
  const res = await api.post<DiscoTable>(
    "/disco/tables/",
    payload
  );

  return res.data;
}

export async function updateTable(
  id: number,
  payload: UpdateTablePayload
) {
  const res = await api.patch<DiscoTable>(
    `/disco/tables/${id}/`,
    payload
  );

  return res.data;
}

export async function deleteTable(id: number) {
  await api.delete(`/disco/tables/${id}/`);
}

export async function getAvailableTables() {
  const res = await api.get<DiscoTable[]>("/disco/tables/", {
    params: {
      status: "available",
    },
  });

  return res.data;
}

export async function getReservedTables() {
  const res = await api.get<DiscoTable[]>("/disco/tables/", {
    params: {
      status: "reserved",
    },
  });

  return res.data;
}

export async function getOccupiedTables() {
  const res = await api.get<DiscoTable[]>("/disco/tables/", {
    params: {
      status: "occupied",
    },
  });

  return res.data;
}

export async function markTableAvailable(id: number) {
  const res = await api.patch<DiscoTable>(
    `/disco/tables/${id}/`,
    {
      status: "available",
    }
  );

  return res.data;
}

export async function markTableOccupied(id: number) {
  const res = await api.patch<DiscoTable>(
    `/disco/tables/${id}/`,
    {
      status: "occupied",
    }
  );

  return res.data;
}

export async function markTableReserved(id: number) {
  const res = await api.patch<DiscoTable>(
    `/disco/tables/${id}/`,
    {
      status: "reserved",
    }
  );

  return res.data;
}

export async function markTableCleaning(id: number) {
  const res = await api.patch<DiscoTable>(
    `/disco/tables/${id}/`,
    {
      status: "cleaning",
    }
  );

  return res.data;
}