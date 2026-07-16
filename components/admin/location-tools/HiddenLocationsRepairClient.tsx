"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  display_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  location_type: string | null;
  is_hidden: boolean | null;
  is_low_level: boolean | null;
  is_searchable: boolean | null;
  public_visibility_tier: string | null;
  low_level_reason: string | null;
 