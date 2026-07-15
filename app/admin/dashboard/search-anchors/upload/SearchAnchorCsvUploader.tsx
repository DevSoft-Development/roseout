"use client";

import { ChangeEvent, DragEvent, useMemo, useState } from "react";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1000;
const REQUIRED_COLUMNS = [
  "canonical_name",
  "anchor_type",
  "default_radius_miles",
  "max_radius_miles",
  "radius_strategy",
