"use client";

import LocationProfileEditor from "@/components/admin/LocationProfileEditor";
import type { EnhancementFieldName, LocationTableName } from "@/lib/listing-enhancement";

type EnhancementRecord = Partial<Record<EnhancementFieldName | string, unknown>>;
type Props = { table: LocationTableName; id: string; record: EnhancementRecord; canEdit: boolean; };

export default function ListingEnhancementEditor({ table, id, record, canEdit }: Props) {
  return <LocationProfileEditor table={table} id={id} record={record as Record<string, unknown>} canEdit={canEdit} canViewAdvancedSystemData={true} saveMode="admin" />;
}
