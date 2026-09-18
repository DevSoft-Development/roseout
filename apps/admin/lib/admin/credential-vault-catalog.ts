export type CredentialProviderId =
  | "aws"
  | "google"
  | "supabase"
  | "vercel"
  | "github"
  | "microsoft"
  | "openai"
  | "huggingface"
  | "brave"
  | "serpapi"
  | "stripe"
  | "resend"
  | "twilio"
  | "telnyx"
  | "threecx"
  | "stamps"
  | "meta"
  | "tiktok"
  | "apple"
  | "turnstile"
  | "expo"
  | "domains"
  | "platform";

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
  category: "Cloud" | "Data" | "AI" | "Identity" | "Communications" | "Social" | "Domains" | "Payments" | "Security";
  description: string;
  fields: readonly CredentialField[];
  note?: string;
};

export const CREDENTIAL_PROVIDERS: readonly CredentialProvider[] = [
  { id: "aws", label: "AWS", category: "Cloud", description: "Optional service credentials for workloads that cannot use an AWS IAM role.", note: "Prefer IAM roles and temporary credentials. Never store AWS root account credentials here.", fields: [
    { key: "accessKeyId", label: "Access key ID", secret: true }, { key: "secretAccessKey", label: "Secret access key", secret: true }, { key: "sessionToken", label: "Session token", secret: true, multiline: true }, { key: "roleArn", label: "Role ARN", placeholder: "arn:aws:iam::123456789012:role/ExampleRole" }, { key: "region", label: "Default region", placeholder: "us-east-1" },
  ] },
  { id: "google", label: "Google", category: "Cloud", description: "Google Maps, Places, Business Profile, and OAuth credentials.", fields: [
    { key: "apiKey", label: "API key", secret: true }, { key: "clientId", label: "OAuth client ID" }, { key: "clientSecret", label: "OAuth client secret", secret: true },
  ] },
  { id: "supabase", label: "Supabase", category: "Data", description: "Supabase project URL and server-side credentials.", fields: [
    { key: "url", label: "Project URL", placeholder: "https://project-ref.supabase.co" }, { key: "publishableKey", label: "Publishable / anon key", secret: true, multiline: true }, { key: "serviceRoleKey", label: "Service role key", secret: true, multiline: true },
  ] },
  { id: "vercel", label: "Vercel", category: "Cloud", description: "Vercel API access for deployment and environment operations.", fields: [
    { key: "token", label: "Access token", secret: true }, { key: "teamId", label: "Team ID" },
  ] },
  { id: "github", label: "GitHub", category: "Cloud", description: "GitHub token or GitHub App credentials for repository automation.", note: "The GitHub token used for automatic credential propagation must be allowed to dispatch Actions workflows for this repository.", fields: [
    { key: "token", label: "Token", secret: true }, { key: "appId", label: "GitHub App ID" }, { key: "privateKey", label: "GitHub App private key", secret: true, multiline: true },
  ] },
  { id: "microsoft", label: "Microsoft / Azure", category: "Identity", description: "Microsoft Entra application credentials and tenant configuration.", fields: [
    { key: "tenantId", label: "Tenant ID" }, { key: "clientId", label: "Client ID" }, { key: "clientSecret", label: "Client secret", secret: true },
  ] },
  { id: "openai", label: "OpenAI", category: "AI", description: "OpenAI API credential used by server-side AI features and assistant workloads.", fields: [
    { key: "apiKey", label: "API key", secret: true },
  ] },
  { id: "huggingface", label: "Hugging Face", category: "AI", description: "Hugging Face access token used by search and AI services.", fields: [{ key: "token", label: "Access token", secret: true }] },
  { id: "brave", label: "Brave Search", category: "AI", description: "Brave Search API credential used by search enrichment and discovery.", fields: [{ key: "apiKey", label: "API key", secret: true }] },
  { id: "serpapi", label: "SerpAPI", category: "AI", description: "SerpAPI credential used by search and enrichment fallbacks.", fields: [{ key: "apiKey", label: "API key", secret: true }] },
  { id: "stripe", label: "Stripe", category: "Payments", description: "Stripe server and webhook credentials used by payments, subscriptions, and Connect.", fields: [
    { key: "secretKey", label: "Secret key", secret: true },
    { key: "webhookSecret", label: "Webhook signing secret", secret: true },
    { key: "connectWebhookSecret", label: "Connect webhook signing secret", secret: true },
  ] },
  { id: "resend", label: "Resend", category: "Communications", description: "Resend API and webhook credentials for transactional email.", fields: [
    { key: "apiKey", label: "API key", secret: true },
    { key: "webhookSecret", label: "Webhook signing secret", secret: true },
  ] },
  { id: "twilio", label: "Twilio", category: "Communications", description: "Twilio account credentials for SMS and phone workflows.", fields: [
    { key: "accountSid", label: "Account SID" }, { key: "authToken", label: "Auth token", secret: true },
  ] },
  { id: "telnyx", label: "Telnyx", category: "Communications", description: "Telnyx production messaging credentials for transactional, reservations, CRM, support, marketing, and concierge traffic.", fields: [
    { key: "publicKey", label: "Public key" },
    { key: "transactionalApiKey", label: "Transactional API key", secret: true },
    { key: "reservationsApiKey", label: "Reservations API key", secret: true },
    { key: "crmApiKey", label: "CRM API key", secret: true },
    { key: "supportApiKey", label: "Support API key", secret: true },
    { key: "marketingApiKey", label: "Marketing API key", secret: true },
    { key: "conciergeApiKey", label: "Concierge API key", secret: true },
  ] },
  { id: "threecx", label: "3CX", category: "Communications", description: "3CX CRM integration credential.", fields: [
    { key: "crmApiKey", label: "CRM API key", secret: true },
  ] },
  { id: "stamps", label: "Stamps.com", category: "Communications", description: "Production USPS postage credentials for the Stamps.com SWS/IM v160 integration.", note: "For SWS/IM, use the Stamps API/partner username, not the email address used to sign in to the Stamps website. In Stamps.com, go to Manage Account > Profile > Personal Contact Info > Get Username. Credentials remain only in AWS Secrets Manager; connection validation is non-transactional and does not purchase postage.", fields: [
    { key: "integrationId", label: "Production Integration ID", secret: true, placeholder: "Production SWS/IM Integration ID" },
    { key: "username", label: "Production API username (not email)", secret: true, placeholder: "Stamps username from Get Username" },
    { key: "password", label: "Production password", secret: true },
  ] },
  { id: "meta", label: "Meta / Instagram", category: "Social", description: "Platform credentials for Facebook/Meta and Instagram Business Login.", note: "Instagram Business Login uses its own Instagram App ID and Instagram App Secret from Meta's API setup with Instagram login. Do not use the generic Facebook/Meta App ID for Instagram login.", fields: [
    { key: "appId", label: "Facebook / Meta App ID" },
    { key: "appSecret", label: "Facebook / Meta App Secret", secret: true },
    { key: "instagramAppId", label: "Instagram App ID" },
    { key: "instagramAppSecret", label: "Instagram App Secret", secret: true },
    { key: "graphVersion", label: "Graph API version" },
    { key: "loginConfigurationId", label: "Facebook Login configuration ID" },
    { key: "accessToken", label: "Platform access token", secret: true },
  ] },
  { id: "tiktok", label: "TikTok", category: "Social", description: "TikTok developer application credentials.", fields: [
    { key: "clientKey", label: "Client key" }, { key: "clientSecret", label: "Client secret", secret: true },
  ] },
  { id: "apple", label: "Apple Business", category: "Identity", description: "Apple Business API credentials used for Business Manager and device enrollment integrations.", note: "Use the Apple Business API Client ID, Key ID, and downloaded private key. App Store Connect Issuer ID is not used here.", fields: [
    { key: "issuerId", label: "Client ID", placeholder: "BUSINESSAPI..." }, { key: "keyId", label: "Key ID" }, { key: "privateKey", label: "Private key (PEM)", secret: true, multiline: true },
  ] },
  { id: "turnstile", label: "Cloudflare Turnstile", category: "Security", description: "Turnstile server-side verification credential.", fields: [
    { key: "secretKey", label: "Secret key", secret: true },
  ] },
  { id: "expo", label: "Expo", category: "Communications", description: "Expo access token used for authenticated mobile push delivery.", fields: [
    { key: "accessToken", label: "Access token", secret: true },
  ] },
  { id: "domains", label: "Domain Provider", category: "Domains", description: "Wholesale registrar and domain gateway credentials.", fields: [
    { key: "apiKey", label: "API key", secret: true },
    { key: "apiSecret", label: "API secret", secret: true },
    { key: "accountId", label: "Account ID" },
    { key: "gatewaySecret", label: "Domain gateway shared secret", secret: true },
  ] },
  { id: "platform", label: "TheOutHaven Platform", category: "Security", description: "Internal service-to-service, webhook, cron, import, and cross-cloud shared secrets used by TheOutHaven runtimes.", note: "These are application credentials, not AWS IAM credentials. AWS IAM roles remain role-managed.", fields: [
    { key: "cronSecret", label: "Cron secret", secret: true },
    { key: "importSecret", label: "Import secret", secret: true },
    { key: "internalImportSecret", label: "Internal import secret", secret: true },
    { key: "outingReminderCronSecret", label: "Outing reminder cron secret", secret: true },
    { key: "googleLocationEnrichmentCronSecret", label: "Google enrichment cron secret", secret: true },
    { key: "adminApiSecret", label: "Admin API secret", secret: true },
    { key: "adminDigestSecret", label: "Admin digest secret", secret: true },
    { key: "notificationSecret", label: "Notification secret", secret: true },
    { key: "supportEmailWebhookSecret", label: "Support email webhook secret", secret: true },
    { key: "supportInboundSecret", label: "Support inbound secret", secret: true },
    { key: "websiteHostingGatewaySecret", label: "Website hosting gateway secret", secret: true },
    { key: "drGatewaySecret", label: "DR gateway secret", secret: true },
    { key: "jobGatewaySecret", label: "Job gateway secret", secret: true },
    { key: "integrationApiSecret", label: "Integration API secret", secret: true },
    { key: "assistantApiSecret", label: "Assistant API secret", secret: true },
  ] },
] as const;

const PROVIDER_BY_ID = new Map(CREDENTIAL_PROVIDERS.map((provider) => [provider.id, provider]));

export function getCredentialProvider(id: unknown) {
  return typeof id === "string" ? PROVIDER_BY_ID.get(id as CredentialProviderId) ?? null : null;
}

export function allowedCredentialFieldKeys(providerId: CredentialProviderId) {
  return new Set((PROVIDER_BY_ID.get(providerId)?.fields || []).map((field) => field.key));
}
