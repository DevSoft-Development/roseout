import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;
const BUCKET = "postcard-templates";
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const TARGET_WIDTH = 1800;
const TARGET_HEIGHT = 1200;

function pathForSide(side: string) {
  if (side === "front") return "claim-front";
  if (side === "back") return "claim-back";
  return null;
}

function imageDimensions(bytes: Uint8Array, type: string): { width: number; height: number } | null {
  if (type === "image/png" && bytes.length >= 24) {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (pngSignature.every((value, index) => bytes[index] === value)) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }
  }

  if (type === "image/jpeg" && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;
      const isStartOfFrame = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
      if (isStartOfFrame && length >= 7) {
        return {
          height: (bytes[offset + 3] << 8) | bytes[offset + 4],
          width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        };
      }
      offset += length;
    }
  }

  if (type === "image/webp" && bytes.length >= 30) {
    const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
    if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
      const chunk = ascii(12, 4);
      if (chunk === "VP8X") {
        const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
        const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
        return { width, height };
      }
      if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
        const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
        return { width, height };
      }
      if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
        const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
        const width = (bits & 0x3fff) + 1;
        const height = ((bits >> 14) & 0x3fff) + 1;
        return { width, height };
      }
    }
  }

  return null;
}

async function templateState() {
  const { data: objects, error } = await supabaseAdmin.storage.from(BUCKET).list("", { limit: 100 });
  if (error) throw error;
  const names = new Set((objects || []).map((item) => item.name));
  const front = supabaseAdmin.storage.from(BUCKET).getPublicUrl("claim-front").data.publicUrl;
  const back = supabaseAdmin.storage.from(BUCKET).getPublicUrl("claim-back").data.publicUrl;
  return {
    front: { ready: names.has("claim-front"), url: front },
    back: { ready: names.has("claim-back"), url: back },
    ready: names.has("claim-front") && names.has("claim-back"),
  };
}

export async function GET() {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;
  try {
    return Response.json({ success: true, templates: await templateState() });
  } catch (error) {
    console.error("Postcard template status failed", error);
    return Response.json({ success: false, error: "Could not load postcard template status." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  try {
    const formData = await request.formData();
    const side = String(formData.get("side") || "").trim().toLowerCase();
    const storagePath = pathForSide(side);
    const file = formData.get("file");

    if (!storagePath) {
      return Response.json({ success: false, error: "Choose the front or back template." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return Response.json({ success: false, error: "Choose a postcard image." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return Response.json({ success: false, error: "Use a PNG, JPG, or WebP image." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return Response.json({ success: false, error: "Postcard image must be under 10MB." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const dimensions = imageDimensions(bytes, file.type);
    if (!dimensions) {
      return Response.json({ success: false, error: "Could not read the postcard image dimensions." }, { status: 400 });
    }

    if (dimensions.width * 2 !== dimensions.height * 3) {
      return Response.json({
        success: false,
        error: `The ${side} artwork must be a true 6×4 landscape (3:2) image. Received ${dimensions.width}×${dimensions.height}.`,
      }, { status: 400 });
    }

    if (dimensions.width < TARGET_WIDTH || dimensions.height < TARGET_HEIGHT) {
      return Response.json({
        success: false,
        error: `For production printing, upload the ${side} master at 1800×1200 pixels or larger. Received ${dimensions.width}×${dimensions.height}.`,
      }, { status: 400 });
    }

    const normalizedFile = new File([bytes], file.name, { type: file.type });
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, normalizedFile, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    return Response.json({ success: true, templates: await templateState() });
  } catch (error) {
    console.error("Postcard template upload failed", error);
    return Response.json({ success: false, error: "Could not upload the postcard template." }, { status: 500 });
  }
}
