import type { User } from "../types/user";

export function getDashboardRedirect(user: User) {
  if (
    user.is_platform_owner ||
    user.role === "platform_owner"
  ) {
    return "/dashboard";
  }

  if (!user.organisation) {
    return "/login";
  }

  if (user.organisation.business_type === "disco") {
    if (
      user.role === "cashier" ||
      user.role === "bartender"
    ) {
      return "/disco/pos";
    }

    if (user.role === "door_staff") {
      return "/disco/entry-fees";
    }

    if (user.role === "inventory_manager") {
      return "/disco/inventory";
    }

    if (user.role === "accountant") {
      return "/disco/reports";
    }

    return "/disco/dashboard";
  }

  return "/dashboard";
}