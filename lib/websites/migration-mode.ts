import type { WebsiteSection } from "@/lib/websites/data";

export type WebsiteMigrationMode = "preserve_exact" | "modernize" | "redesign";

export function normalizeWebsiteMigrationMode(value: unknown): WebsiteMigrationMode {
  return value === "preserve_exact" || value === "redesign" ? value : "modernize";
}

export function resolveMigrationDirection(input: {
  mode: WebsiteMigrationMode;
  requestedDirectionId: string | null;
  existingDirectionId: string | null;
}) {
  if (input.mode === "preserve_exact" && input.existingDirectionId) return input.existingDirectionId;
  return input.requestedDirectionId || input.existingDirectionId || null;
}

export function applyMigrationSections(
  mode: WebsiteMigrationMode,
  generatedSections: WebsiteSection[],
  existingSections: WebsiteSection[],
) {
  if (mode !== "preserve_exact" || existingSections.length === 0) return generatedSections;
  return existingSections;
}

export function migrationPromptContext(input: {
  mode: WebsiteMigrationMode;
  importedProvider?: string | null;
  importedTitle?: string | null;
  importedDescription?: string | null;
  importedThemeColor?: string | null;
  importedPages?: string[];
}) {
  const base = [
    `Migration mode: ${input.mode}`,
    input.importedProvider ? `Imported platform: ${input.importedProvider}` : null,
    input.importedTitle ? `Imported site title: ${input.importedTitle}` : null,
    input.importedDescription ? `Imported description: ${input.importedDescription}` : null,
    input.importedThemeColor ? `Imported brand color: ${input.importedThemeColor}` : null,
    input.importedPages?.length ? `Imported page structure: ${input.importedPages.slice(0, 12).join(", ")}` : null,
  ].filter(Boolean);

  if (input.mode === "preserve_exact") {
    base.push("Preserve the existing/imported visual identity and page structure. Improve implementation quality only; do not choose a new visual direction or reorder the owner's existing sections.");
  } else if (input.mode === "modernize") {
    base.push("Retain recognizable brand signals and content hierarchy from the imported site, while modernizing typography, spacing, responsiveness, accessibility, and premium composition.");
  } else {
    base.push("Use imported content only as factual/source material. You may choose a completely new premium visual direction and composition.");
  }
  return base.join("\n");
}
