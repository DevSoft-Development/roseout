"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

const WORKSPACE_TABS = [
  { id: "overview", label: "Overview", tab: "overview" },
  { id: "profile", label: "Profile", tab: "profile" },
  { id: "photos", label: "Photos", tab: "photos" },