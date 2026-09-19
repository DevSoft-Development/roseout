import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const ORIGINAL_GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();

  if (ORIGINAL_GOOGLE_PLACES_API_KEY === undefined) {
    delete process.env.GOOGLE_PLACES_API_KEY;
  } else {
    process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_GOOGLE_PLACES_API_KEY;
  }
});

describe("GET /api/public/google-place-photo", () => {
  it("redirects to the branded fallback when the Places API key is missing", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;

    const response = await GET(
      new Request(
        "https://theouthaven.com/api/public/google-place-photo?placeId=test-place",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://theouthaven.com/toh_logo.png",
    );
    expect(response.headers.get("x-theouthaven-photo-fallback")).toBe("1");
    expect(response.headers.get("x-theouthaven-photo-fallback-reason")).toBe(
      "missing_google_places_api_key",
    );
  });

  it("redirects to the branded fallback when Places API New returns no photo", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ photos: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await GET(
      new Request(
        "https://theouthaven.com/api/public/google-place-photo?placeId=test-place",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://theouthaven.com/toh_logo.png",
    );
    expect(response.headers.get("x-theouthaven-photo-fallback-reason")).toBe(
      "google_photo_proxy_failed",
    );
  });

  it("returns the proxied image using a Places API New photo resource", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            photos: [{ name: "places/test-place/photos/fresh-ref" }],
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
      new Request(
        "https://theouthaven.com/api/public/google-place-photo?placeId=test-place",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("x-theouthaven-photo-fallback")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstCall = fetchMock.mock.calls[0];
    expect(String(firstCall?.[0])).toContain(
      "https://places.googleapis.com/v1/places/test-place",
    );
    expect((firstCall?.[1] as RequestInit)?.headers).toMatchObject({
      "X-Goog-Api-Key": "test-key",
      "X-Goog-FieldMask": "photos",
    });

    const secondCall = fetchMock.mock.calls[1];
    expect(String(secondCall?.[0])).toContain(
      "https://places.googleapis.com/v1/places/test-place/photos/fresh-ref/media",
    );
  });

  it("accepts a Places API New photo resource name directly", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(
        "https://theouthaven.com/api/public/google-place-photo?ref=places%2Ftest-place%2Fphotos%2Fphoto-1&maxwidth=900",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("maxWidthPx=900");
  });

  it("does not try to redeem a legacy photo_reference with the new project", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(
        "https://theouthaven.com/api/public/google-place-photo?ref=old-legacy-photo-reference",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("x-theouthaven-photo-fallback-reason")).toBe(
      "legacy_photo_reference_requires_place_id",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
