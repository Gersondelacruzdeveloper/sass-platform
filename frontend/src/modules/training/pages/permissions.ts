export type TrainingPermission =
  | "can_create_employees"
  | "can_create_trainings"
  | "can_create_evaluations"
  | "can_view_reports";

export function hasPermission(
  user: any,
  permission: TrainingPermission,
) {
  if (!user) return false;

  if (user.role === "owner" || user.role === "admin" || user.role === "manager") {
    return true;
  }

  return Boolean(user.permissions?.[permission]);
}

export function isAdminUser(user: any) {
  return user?.role === "owner" || user?.role === "admin" || user?.role === "manager";
}

export function isFacilitatorUser(user: any) {
  return user?.role === "facilitator";
}