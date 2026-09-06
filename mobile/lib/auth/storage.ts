import * as SecureStore from "expo-secure-store";

const PREFIX = "theouthaven.mobile.";

export const secureAuthStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(`${PREFIX}${key}`),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(`${PREFIX}${key}`, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(`${PREFIX}${key}`),
};

export async function getOrCreateGuestId() {
  const key = `${PREFIX}guest-id`;
  const existing = await SecureStore.getItemAsync(key);
  if (existing) return existing;

  const guestId = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await SecureStore.setItemAsync(key, guestId);
  return guestId;
}
