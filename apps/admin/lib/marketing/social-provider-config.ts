import "server-only";

import { getCredentialVaultRuntimeSnapshot } from "@/lib/aws/admin-credential-vault";

export type MetaSocialConfig = {
  appId: string;
  appSecret: string;
  instagramAppId: string;
  instagramAppSecret: string;
  graphVersion: string;
  loginConfigurationId: string;
};

export type InstagramSocialConfig = {
  appId: string;
  appSecret: string;
  graphVersion: string;
};

function first(...values: Array<string | undefined | null>) {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return "";
}

async function vaultMeta() {
  try {
    const snapshot = await getCredentialVaultRuntimeSnapshot("production");
    return snapshot.providers.meta || {};
  } catch (error) {
    console.warn("Could not load Meta credentials from central vault; falling back to runtime environment.", error);
    return {};
  }
}

export async function loadMetaSocialConfig(): Promise<MetaSocialConfig> {
  const vault = await vaultMeta();
  return {
    appId: first(vault.appId, process.env.META_APP_ID, process.env.FACEBOOK_APP_ID),
    appSecret: first(vault.appSecret, process.env.META_APP_SECRET, process.env.FACEBOOK_APP_SECRET),
    instagramAppId: first(vault.instagramAppId, process.env.INSTAGRAM_APP_ID, process.env.META_INSTAGRAM_APP_ID),
    instagramAppSecret: first(vault.instagramAppSecret, process.env.INSTAGRAM_APP_SECRET, process.env.META_INSTAGRAM_APP_SECRET),
    graphVersion: first(vault.graphVersion, process.env.META_GRAPH_VERSION),
    loginConfigurationId: first(vault.loginConfigurationId, process.env.META_LOGIN_CONFIGURATION_ID),
  };
}

export async function loadInstagramSocialConfig(): Promise<InstagramSocialConfig> {
  const config = await loadMetaSocialConfig();
  return {
    appId: config.instagramAppId,
    appSecret: config.instagramAppSecret,
    graphVersion: config.graphVersion,
  };
}

export function metaSocialConfigComplete(config: MetaSocialConfig) {
  return Boolean(config.appId && config.appSecret && config.graphVersion && config.loginConfigurationId);
}
