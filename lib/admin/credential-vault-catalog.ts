export type CredentialProviderId =
  | "aws"
  | "google"
  | "supabase"
  | "vercel"
  | "github"
  | "microsoft"
  | "huggingface"
  | "resend"
  | "twilio"
  | "meta"
  | "tiktok"
  | "apple"
  | "domains";

export type CredentialField = {
  key: string;
  label: string;
  secret?: boolean;
  multiline?: boolean;
  placeholder?: string;
};

export type CredentialProvider = {
  id: CredentialProviderId;
  label: string;
  category: "Cloud" | "Data" | "AI" | "Identity" | "Communications" | "Social" | "Domains";
  description: string;
  fields: readonly CredentialField[];
  note?: string;
};

export const CREDENTIAL_PROVIDERS: readonly CredentialProvider[] = [
  {
    id: "aws",
    label: "AWS",
    category: "Cloud",
    description: "Optional service credentials for workloads that cannot use an AWS IAM role.",
    note: "Prefer IAM roles and temporary credentials. Never store AWS root account credentials here.",
    fields: [
      { key: "accessKeyId", label: "Access key ID", secret: true },
      { key: "secretAccessKey", label: "Secret access key", secret: true },
      { key: "sessionToken", label: "Session token", secret: true, multiline: true },
      { key: "roleArn", label: "Role ARN", placeholder: "arn:aws:iam::123456789012:role/ExampleRole" },
      { key: "region", label: "Default region", placeholder: "us-east-1" },
    ],
  },
  {
    id: "google",
    label: "Google",
    category: "Cloud",
    description: "Google Maps, Places, Business Profile, and OAuth credentials.",
    fields: [
      { key: "apiKey", label: "API key", secret: true },
      { key: "clientId", label: "OAuth client ID" },
      { key: "clientSecret", label: "OAuth client secret", secret: true },
    ],
  },
  {
    id: "supabase",
    label: "Supabase",
    category: "Data",
    description: "Supabase project URL and server-side credentials.",
    fields: [
      { key: "url", label: "Project URL", placeholder: "https://project-ref.supabase.co" },
      { key: "publishableKey", label: "Publishable / anon key", secret: true, multiline: true },
      { key: "serviceRoleKey", label: "Service role key", secret: true, multiline: true },
    ],
  },
  {
    id: "vercel",
    label: "Vercel",
    category: "Cloud",
    description: "Vercel API access for deployment and environment operations.",
    fields: [
      { key: "token", label: "Access token", secret: true },
      { key: "teamId", label: "Team ID" },
    ],
  },
  {
    id: "github",
    label: "GitHub",
    category: "Cloud",
    description: "GitHub token or GitHub App credentials for repository automation.",
    fields: [
      { key: "token", label: "Token", secret: true },
      { key: "appId", label: "GitHub App ID" },
      { key: "privateKey", label: "GitHub App private key", secret: true, multiline: true },
    ],
  },
  {
    id: "microsoft",
    label: "Microsoft / Azure",
    category: "Identity",
    description: "Microsoft Entra application credentials and tenant configuration.",
    fields: [
      { key: "tenantId", label: "Tenant ID" },
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    category: "AI",
    description: "Hugging Face access token used by search and AI services.",
    fields: [{ key: "token", label: "Access token", secret: true }],
  },
  {
    id: "resend",
    label: "Resend",
    category: "Communications",
    description: "Resend API credentials for transactional email.",
    fields: [{ key: "apiKey", label: "API key", secret: true }],
  },
  {
    id: "twilio",
    label: "Twilio",
    category: "Communications",
    description: "Twilio account credentials for SMS and phone workflows.",
    fields: [
      { key: "accountSid", label: "Account SID" },
      { key: "authToken", label: "Auth token", secret: true },
    ],
  },
  {
    id: "meta",
    label: "Meta / Instagram",
    category: "Social",
    description: "Meta app and Graph API credentials for Facebook and Instagram.",
    fields: [
      { key: "appId", label: "App ID" },
      { key: "appSecret", label: "App secret", secret: true },
      { key: "accessToken", label: "Access token", secret: true, multiline: true },
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    category: "Social",
    description: "TikTok developer application credentials.",
    fields: [
      { key: "clientKey", label: "Client key" },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
  },
  {
    id: "apple",
    label: "Apple Business",
    category: "Identity",
    description: "Apple Business API credentials used for Business Manager and device enrollment integrations.",
    note: "Use the Apple Business API Client ID, Key ID, and downloaded private key. App Store Connect Issuer ID is not used here.",
    fields: [
      { key: "issuerId", label: "Client ID", placeholder: "BUSINESSAPI..." },
      { key: "keyId", label: "Key ID" },
      { key: "privateKey", label: "Private key (PEM)", secret: true, multiline: true },
    ],
  },
  {
    id: "domains",
    label: "Domain Provider",
    category: "Domains",
    description: "Wholesale registrar / domain provider API credentials.",
    fields: [
      { key: "apiKey", label: "API key", secret: true },
      { key: "apiSecret", label: "API secret", secret: true },
      { key: "accountId", label: "Account ID" },
    ],
  },
] as const;

const PROVIDER_BY_ID = new Map(CREDENTIAL_PROVIDERS.map((provider) => [provider.id, provider]));

export function getCredentialProvider(id: unknown) {
  return typeof id === "string" ? PROVIDER_BY_ID.get(id as CredentialProviderId) ?? null : null;
}

export function allowedCredentialFieldKeys(providerId: CredentialProviderId) {
  return new Set((PROVIDER_BY_ID.get(providerId)?.fields || []).map((field) => field.key));
}
