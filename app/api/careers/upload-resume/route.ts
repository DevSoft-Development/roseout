import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const BUCKET = "career-resumes";
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

function sanitizeFileName(name: string) {
  const fallback = "resume";
  const cleaned = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 120);
  return cleaned || fallback;
}

function extensionFor(name: string) {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("resume");
    if (!(file instanceof File)) return NextResponse.json({ error: "Please choose a resume file to upload." }, { status: 400 });
    const extension = extensionFor(file.name);
    if (!ALLOWED_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(extension)) return NextResponse.json({ error: "Please upload a PDF, DOC, or DOCX resume." }, { status: 400 });
    if (file.size > MAX_SIZE_BYTES) return NextResponse.json({ error: "Please upload a resume smaller than 5 MB." }, { status: 400 });

    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const originalName = sanitizeFileName(file.name);
    const storagePath = `resumes/${yyyy}/${mm}/${randomUUID()}-${originalName}`;
    const bytes = await file.arrayBuffer();
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (error || !data?.path) return NextResponse.json({ error: "We could not upload your resume. Please try again or submit a resume link." }, { status: 500 });

    return NextResponse.json({ fileUrl: data.path, storagePath: data.path, originalName: file.name, mimeType: file.type, sizeBytes: file.size });
  } catch (error) {
    console.error("Career resume upload failed", error);
    return NextResponse.json({ error: "We could not upload your resume. Please try again or submit a resume link." }, { status: 500 });
  }
}
