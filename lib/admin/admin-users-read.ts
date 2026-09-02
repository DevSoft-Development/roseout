import "server-only";

import {
  getAdminUserDetail as getAdminUserDetailFallback,
  listAdminUsers as listAdminUsersFallback,
  requireAdminOrSupport,
} from "@/lib/admin-users";
import {
  readAdminUserDetailViaCoreApi,
  readAdminUsersListViaCoreApi,
} from "@/lib/aws/admin-users-core-api";

type AdminUsersListResult = Awaited<ReturnType<typeof listAdminUsersFallback>>;
type AdminUserDetailResult = Awaited<ReturnType<typeof getAdminUserDetailFallback>>;

export async function listAdminUsersRead(
  filters: Record<string, string | undefined> = {},
): Promise<AdminUsersListResult> {
  await requireAdminOrSupport();
  try {
    const result = await readAdminUsersListViaCoreApi(filters);
    if (result.success !== true || !Array.isArray(result.users)) {
      throw new Error("admin_users_core_list_invalid");
    }
    return result as unknown as AdminUsersListResult;
  } catch {
    return listAdminUsersFallback(filters);
  }
}

export async function getAdminUserDetailRead(userId: string): Promise<AdminUserDetailResult> {
  await requireAdminOrSupport();
  try {
    const result = await readAdminUserDetailViaCoreApi(userId);
    if (result.success !== true || !result.profile) {
      throw new Error("admin_users_core_detail_invalid");
    }
    return result as unknown as AdminUserDetailResult;
  } catch {
    return getAdminUserDetailFallback(userId);
  }
}
