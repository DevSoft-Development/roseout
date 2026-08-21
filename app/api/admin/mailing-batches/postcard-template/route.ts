import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;
const BUCKET = "postcard-templates";
const MAX_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function pathForSide(side: string) {
  if (side === "front") return "claim-front";
  if (side === "back") return "claim-back";
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

    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, file, {
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
