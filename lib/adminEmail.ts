export const DEFAULT_ADMIN_EMAIL = "nick@theouthaven.com";

export function getAdminNotifyEmail() {
  return process.env.ADMIN_NOTIFY_EMAIL || DEFAULT_ADMIN_EMAIL;
}
