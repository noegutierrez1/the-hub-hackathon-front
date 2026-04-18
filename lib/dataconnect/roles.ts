const STAFF_ROLES = new Set(["staff", "admin", "manager", "owner"]);

/** Role string from `User.role` or JWT claim `role`. */
export function isStaffRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return STAFF_ROLES.has(role.trim().toLowerCase());
}
