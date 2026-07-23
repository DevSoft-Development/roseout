export type WorkerCatalogStatus = "active" | "ready" | "planned";

export type WorkerCatalogItem = {
  key: string;
  label: string;
  family: "Photos" | "Location" | "AI" | "Search" | "Messaging" | "Operations";
  description: string;
  cadence: string;
  status: WorkerCatalogStatus;
};

export const WORKER_CATALOG: WorkerCatalogItem[] = [
  { key: "photo.metadata_repair", label: "Photo Metadata Repair", family: "Photos", description: "Synchronizes photo flags when a valid stored image already exists.", cadence: "Manual / daily", status: "active" },
  { key: "photo.storage_migration", label: "Photo Storage Migration", family: "Photos", description: "Copies legacy Google photo URLs into Supabase Storage and removes embedded keys.", cadence: "Hourly until complete", status: "ready" },
  { key: "photo.backfill", label: "Photo Backfill", family: "Photos", description: "Finds truly missing or placeholder photos and safely stores replacements.", cadence: "Nightly", status: "ready" },
  { key: "enrichment.google_metadata", label: "Google Enrichment", family: "Location", description: "Refreshes approved Google metadata such as hours, rating, phone, and website.", cadence: "Nightly / on demand", status: "ready" },
  { key: "enrichment.ai_profile", label: "AI Profile Enrichment", family: "AI", description: "Generates structured profile copy, occasions, highlights, and search tags.", cadence: "On change", status: "planned" },
  { key: "enrichment.ai_menu", label: "AI Menu Extraction", family: "AI", description: "Extracts menu categories, items, prices, and dietary metadata from supported sources.", cadence: "On upload", status: "planned" },
  { key: "ml.duplicate_detection.recalculate", label: "Duplicate Detection", family: "Location", description: "Scores probable duplicate locations for safe review and merge workflows.", cadence: "Nightly", status: "ready" },
  { key: "search.document_rebuild", label: "Search Document Rebuild", family: "Search", description: "Rebuilds canonical search documents after location, menu, or profile changes.", cadence: "On change", status: "planned" },
  { key: "search.embedding_generation", label: "Embedding Generation", family: "Search", description: "Creates versioned embeddings for semantic retrieval and similarity features.", cadence: "On change", status: "planned" },
  { key: "analytics.aggregate", label: "Analytics Aggregation", family: "Search", description: "Rolls raw events into bounded daily operational and business metrics.", cadence: "Hourly / daily", status: "planned" },
  { key: "search.qa.batch", label: "Search Health", family: "Search", description: "Evaluates no-result, pairing, latency, parser, and relevance failure signals.", cadence: "Hourly", status: "ready" },
  { key: "notification.email_deliver", label: "Email Delivery", family: "Messaging", description: "Delivers queued email with idempotency, status tracking, and retry controls.", cadence: "Continuous", status: "planned" },
  { key: "notification.sms_deliver", label: "SMS Delivery", family: "Messaging", description: "Delivers consent-aware SMS with idempotency, status tracking, and retries.", cadence: "Continuous", status: "planned" },
  { key: "reservation.cleanup", label: "Reservation Cleanup", family: "Operations", description: "Expires stale holds, waitlist entries, sessions, and abandoned operational records.", cadence: "Every 15 minutes", status: "planned" },
  { key: "review.moderation", label: "Review Moderation", family: "Operations", description: "Flags spam, unsafe content, profanity, and suspicious review behavior.", cadence: "On submission", status: "planned" },
  { key: "location.publishability_repair", label: "Location Publishability Repair", family: "Location", description: "Recomputes searchable, hidden, quality, photo, and publish-ready state consistently.", cadence: "On change / nightly", status: "planned" },
];

export const WORKER_FAMILIES = ["Photos", "Location", "AI", "Search", "Messaging", "Operations"] as const;
