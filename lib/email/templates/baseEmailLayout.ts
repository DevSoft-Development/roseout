import { renderBrandedEmail } from "../render";
import type { EmailDepartment } from "../types";

type BaseEmailLayoutProps = { previewText?: string; heading: string; bodyHtml: string; ctaLabel?: string; ctaUrl?: string; department?: EmailDepartment | string; signature?: string; footerNote?: string };

export function baseEmailLayout({ previewText, heading, bodyHtml, ctaLabel, ctaUrl, department, footerNote }: BaseEmailLayoutProps) {
  return renderBrandedEmail({
    department: (department || "account") as EmailDepartment,
    subject: heading,
    preview: previewText || heading,
    heading,
    intro: bodyHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    cta: ctaLabel && ctaUrl ? { label: ctaLabel, url: ctaUrl } : undefined,
    footerNote,
  }).html;
}
