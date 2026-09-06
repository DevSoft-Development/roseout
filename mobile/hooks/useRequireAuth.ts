import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";

export function useRequireAuth() {
  const router = useRouter();
  const { user } = useAuth();

  return useCallback((action?: () => void) => {
    if (!user) {
      router.push("/auth");
      return false;
    }
    action?.();
    return true;
  }, [router, user]);
}
