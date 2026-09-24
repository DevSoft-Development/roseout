import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ACTIONS = new Set(["mobile_signin", "mobile_signup", "mobile_password_reset"]);

function safeJson(value: string) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export async function GET(request: NextRequest) {
  const requestedAction = request.nextUrl.searchParams.get("action") || "mobile_signin";
  const action = ALLOWED_ACTIONS.has(requestedAction) ? requestedAction : "mobile_signin";
  const siteKey = String(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();

  const siteKeyJson = safeJson(siteKey);
  const actionJson = safeJson(action);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <meta name="color-scheme" content="dark" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
    body { display: flex; align-items: center; justify-content: center; padding: 0; }
    #turnstile { width: 100%; display: flex; align-items: center; justify-content: center; }
    .fallback {
      width: 100%;
      min-height: 62px;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font: 600 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      color: rgba(255,255,255,.66);
      background: rgba(255,255,255,.035);
      text-align: center;
      padding: 12px;
    }
  </style>
</head>
<body>
  <div id="turnstile"></div>
  <script>
    const SITE_KEY = ${siteKeyJson};
    const ACTION = ${actionJson};

    function send(payload) {
      if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
      // React Native receives the token through postMessage. Avoid changing
      // window.location here because WebView navigation can cause Turnstile
      // to reinitialize and appear to loop.
    }

    function fail(message) {
      send({ type: "turnstile-error", action: ACTION, message });
    }

    window.onTurnstileLoad = function () {
      if (!SITE_KEY) {
        document.getElementById("turnstile").innerHTML =
          '<div class="fallback">Security verification is temporarily unavailable.</div>';
        fail("Security verification is temporarily unavailable.");
        return;
      }

      window.turnstile.render("#turnstile", {
        sitekey: SITE_KEY,
        action: ACTION,
        theme: "dark",
        size: "flexible",
        callback: function (token) {
          send({ type: "turnstile-success", action: ACTION, token: token });
        },
        retry: "never",
        "refresh-expired": "never",
        "refresh-timeout": "never",
        "error-callback": function () {
          fail("Security verification did not complete. Please try again.");
        },
        "expired-callback": function () {
          fail("Security verification expired. Tap retry to continue.");
        },
        "timeout-callback": function () {
          fail("Security verification timed out. Tap retry to continue.");
        }
      });
    };
  </script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit" async defer></script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
