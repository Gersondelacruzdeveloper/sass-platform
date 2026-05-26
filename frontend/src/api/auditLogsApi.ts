import api from "./axios";
import type { AuditLog } from "../types/auditLog";

export const getAuditLogs = async (): Promise<AuditLog[]> => {
  const response = await api.get<AuditLog[]>("/auditlogs/auditlogs/");
  return response.data;
};