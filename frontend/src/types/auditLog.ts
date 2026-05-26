export interface AuditLog {
  id: number;
  organisation: number;
  organisation_name: string;
  user: number | null;
  user_email?: string | null;
  action: "create" | "update" | "delete" | "login" | "logout";
  model_name: string;
  object_id?: string | null;
  description?: string | null;
  ip_address?: string | null;
  created_at: string;
}