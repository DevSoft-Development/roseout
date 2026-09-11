import "server-only";

export type LiveProbe = {
  ok: boolean;
  status: number | null;
  response_ms: number | null;
  error: string | null;
};

async function probe(url: string, timeoutMs = 7000): Promise<LiveProbe> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      headers: { "user-agent": "TheOutHaven Website Health/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      ok: response.ok,
      status: response.status,
      response_ms: Date.now() - started,
      error: response.ok ? null : `http_${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      response_ms: Date.now() - started,
      error: error instanceof Error ? error.name || error.message : "request_failed",
    };
  }
}

export async function checkHostedWebsiteLiveHealth(input: {
  liveUrl: string | null;
  reservationUrl?: string | null;
}) {
  if (!input.liveUrl) {
    return {
      checked_at: new Date().toISOString(),
      site: null,
      sitemap: null,
      robots: null,
      reservation: null,
    };
  }

  const base = input.liveUrl.replace(/\/$/, "");
  const [site, sitemap, robots, reservation] = await Promise.all([
    probe(base),
    probe(`${base}/sitemap.xml`, 5000),
    probe(`${base}/robots.txt`, 5000),
    input.reservationUrl && /^https?:\/\//i.test(input.reservationUrl)
      ? probe(input.reservationUrl, 7000)
      : Promise.resolve(null),
  ]);

  return {
    checked_at: new Date().toISOString(),
    site,
    sitemap,
    robots,
    reservation,
  };
}
