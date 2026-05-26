export type BusinessType =
  | "disco"
  | "hotel"
  | "restaurant"
  | "store"
  | "excursions";

export type UserRole =
  | "platform_owner"
  | "owner"
  | "admin"
  | "manager"
  | "cashier"
  | "bartender"
  | "door_staff"
  | "inventory_manager"
  | "accountant"
  | "staff"
  | "viewer";

export type User = {
  id: number;
  email: string;
  username: string;
  is_platform_owner: boolean;

  role: UserRole | null;

  organisation: {
    id: number;
    name: string;
    business_type: BusinessType;
    plan: string;
  } | null;
};