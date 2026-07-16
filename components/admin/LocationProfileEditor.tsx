"use client";
import { useState, type ReactNode } from "react";
import { PRICE_RANGE_OPTIONS, normalizeTagList } from "@/lib/location-profile-fields";
import { formatOperatingHoursForEditor, parseWeeklyHoursFromEditor } from "@/lib/weekly-hours";

type Props = { table?: string; id: string; record: Record<string, any>; canEdit: boolean; canViewAdvancedSystemData: boolean; saveMode?: "admin" | "