console.log(JSON.stringify({
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  TURNSTILE_SECRET_KEY: Boolean(process.env.TURNSTILE_SECRET_KEY),
  TURNSTILE_ENABLED: process.env.TURNSTILE_ENABLED ?? "true",
}, null, 2));
