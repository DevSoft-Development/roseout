import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const ORIGINAL_GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const ORIGINAL_GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  if (ORIGINAL_GOOGLE_PLACES_API_KEY === undefined) {
    delete process.env.GOOGLE_PLACES_API_KEY;
  } else {
    process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_GOOGLE_PLACES_API_KEY;
  }

  if (ORIGINAL_GOOGLE_API_KEY === undefined) {
    delete process.env.GOOGLE_API_KEY;
  } else {
    process.env.GOOGLE_API_KEY = ORIGINAL_GOOGLE_API_KEY;
  }
});

describe("GET /api/public/google-place-photo", () => {
  it("redirects to the branded fallback when the Google API key is missing", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_API_KEY;

    const response = await GET(
      new Request("https://theouthaven.com/api/public/google-place-photo?placeId=test-place"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://theouthaven.com/toh_logo.png");
    expect(response.headers.get("x-theouthaven-photo-fallback")).toBe("1");
  });

  it("redirects to the branded fallback when Google returns no usable photo", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    delete process.env.GOOGLE_API_KEY;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ZERO_RESULTS", result: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await GET(
      new Request("https://theouthaven.com/api/public/google-place-photo?placeId=test-place"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://theouthaven.com/toh_logo.png");
    expect(response.headers.get("x-theouthaven-photo-fallback-reason")).toBe(
      "fresh_photo_lookup_failed",
    );
  });

  it("returns the proxied image when Google returns a valid photo", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    delete process.env.GOOGLE_API_KEY;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "OK",
            result: { photos: [{ photo_reference: "fresh-ref" }] },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("https://theouthaven.com/api/public/google-place-photo?placeId=test-place"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-theouthaven-photo-fallback")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
