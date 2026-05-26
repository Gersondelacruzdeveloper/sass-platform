export interface Organisation {
  id: number;
  name: string;
  slug: string;
  logo?: string | null;
  email?: string | null;
  phone?: string | null;
  plan: "basic" | "pro" | "premium";
  is_active: boolean;
  created_at: string;
}

export interface Membership {
  id: number;
  user: number;
  user_email: string;
  organisation: number;
  organisation_name: string;
  role: "owner" | "admin" | "manager" | "staff" | "viewer";
  is_active: boolean;
  created_at: string;
}