"use client";

import { useRef, useState } from "react";

export type GoogleAddressFields = {
  address: string;
  city: string;
  state: string;
  zip_code: string;
  neighborhood: string;
  latitude: string;
  longitude: string;
  google_place_id: string;
  formatted_address: string;
};

type AddressPrediction = {
  place_id: string;
  description: string;
};

type GoogleAddressAutocompleteProps = {
  value?: string;
  onAddressChange?: (value: string) => void;
  onAddressSelect?: (address: GoogleAddressFields) => void;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  neighborhood?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  google_place_id?: string | null;
  formatted_address?: string | null;
  isAdmin?: boolean;
  showCoordinateRepairTools?: boolean;
  label?: string;
  placeholder?: string;
  required?: boolean;
  inputClassName?: string;
  labelClassName?: string;
  statusClassName?: string;
  dropdownClassName?: string;
  buttonClassName?: string;
  predictionButtonClassName?: string;
  helperText?: string;
  hiddenInputNames?: Partial<Record<keyof GoogleAddressFields, string>>;
};

function toStringValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function normalizeAddressFields(data: Partial<GoogleAddressFields>): GoogleAddressFields {
  return {
    address: data.address || "",
    city: data.city || "",
    state: data.state || "",
    zip_code: data.zip_code || "",
    neighborhood: data.neighborhood || "",
    latitude: toStringValue(data.latitude),
    longitude: toStringValue(data.longitude),
    google_place_id: data.google_place_id || "",
    formatted_address: data.formatted_address || "",
  };
}

export default function GoogleAddressAutocomplete({
  value,
  onAddressChange,
  onAddressSelect,
  address,
  city,
  state,
  zip_code,
  neighborhood,
  latitude,
  longitude,
  google_place_id,
  formatted_address,
  isAdmin = false,
  showCoordinateRepairTools = false,
  label = "Address",
  placeholder = "Start typing and select an address",
  required = false,
  inputClassName = "mt-2 w-full rounded-2xl border border-black/10 px-4 py-3 font-bold outline-none focus:border-rose-500",
  labelClassName = "text-sm font-black",
  statusClassName = "mt-2 text-xs font-bold",
  dropdownClassName = "absolute z-[999999] mt-2 w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl",
  buttonClassName = "mt-3 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60",
  predictionButtonClassName = "block w-full border-b border-black/10 px-4 py-3 text-left text-sm font-bold text-black/75 transition last:border-b-0 hover:bg-rose-50",
  helperText = "Start typing, then select an address from the list. You can keep typing or enter it manually if search is unavailable.",
  hiddenInputNames,
}: GoogleAddressAutocompleteProps) {
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState("");
  const activeRequestRef = useRef(0);

  const inputValue = value ?? address ?? "";
  const hasCoordinates = Boolean(toStringValue(latitude).trim() && toStringValue(longitude).trim());
  const canRepairCoordinates = isAdmin && showCoordinateRepairTools && (!hasCoordinates || Boolean(status));

  const emitAddressSelect = (data: Partial<GoogleAddressFields>) => {
    onAddressSelect?.(normalizeAddressFields(data));
  };

  const handleChange = async (nextValue: string) => {
    onAddressChange?.(nextValue);
    setRepairStatus("");

    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;

    if (nextValue.trim().length < 2) {
      setPredictions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const res = await fetch("/api/google/address-autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: nextValue }),
      });

      const data = await res.json();

      if (activeRequestRef.current !== requestId) return;

      if (!res.ok) {
        setPredictions([]);
        setStatus(data.error || "Address autocomplete is unavailable. You can enter the address manually.");
        return;
      }

      const nextPredictions = Array.isArray(data.predictions) ? data.predictions : [];
      setPredictions(nextPredictions);

      if (!nextPredictions.length) {
        setStatus("No address matches found yet. You can keep typing or enter the address manually.");
      }
    } catch {
      if (activeRequestRef.current !== requestId) return;
      setPredictions([]);
      setStatus("Address autocomplete is unavailable. You can enter the address manually.");
    } finally {
      if (activeRequestRef.current === requestId) setLoading(false);
    }
  };

  const selectPrediction = async (prediction: AddressPrediction) => {
    setPredictions([]);
    setLoading(true);
    setStatus("");
    onAddressChange?.(prediction.description);

    try {
      const res = await fetch("/api/google/address-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: prediction.place_id }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Could not read the selected address. You can enter it manually.");
        return;
      }

      emitAddressSelect({
        address: data.address || prediction.description,
        city: data.city || city || "",
        state: data.state || state || "",
        zip_code: data.zip_code || zip_code || "",
        neighborhood: data.neighborhood || neighborhood || "",
        latitude: data.latitude ?? "",
        longitude: data.longitude ?? "",
        google_place_id: data.google_place_id || prediction.place_id,
        formatted_address: data.formatted_address || prediction.description,
      });
    } catch {
      setStatus("Could not read the selected address. You can enter it manually.");
    } finally {
      setLoading(false);
    }
  };

  const repairCoordinates = async () => {
    setRepairing(true);
    setRepairStatus("");

    try {
      const res = await fetch("/api/google/geocode-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: inputValue,
          city,
          state,
          zip_code,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setRepairStatus(data.error || "Could not verify coordinates for this address.");
        return;
      }

      emitAddressSelect({
        address: data.address || inputValue,
        city: data.city || city || "",
        state: data.state || state || "",
        zip_code: data.zip_code || zip_code || "",
        neighborhood: data.neighborhood || neighborhood || "",
        latitude: data.latitude ?? "",
        longitude: data.longitude ?? "",
        google_place_id: data.google_place_id || google_place_id || "",
        formatted_address: data.formatted_address || formatted_address || "",
      });

      setRepairStatus("Coordinates verified and saved to hidden fields.");
    } catch {
      setRepairStatus("Could not verify coordinates for this address.");
    } finally {
      setRepairing(false);
    }
  };

  const hiddenValues: GoogleAddressFields = normalizeAddressFields({
    address: inputValue,
    city,
    state,
    zip_code,
    neighborhood,
    latitude: toStringValue(latitude),
    longitude: toStringValue(longitude),
    google_place_id: google_place_id || "",
    formatted_address: formatted_address || "",
  });

  return (
    <div className="relative">
      <label className="block">
        <span className={labelClassName}>
          {label}
          {required ? <span className="text-rose-600"> *</span> : null}
        </span>
        <input
          type="text"
          value={inputValue}
          onChange={(event) => handleChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className={inputClassName}
          required={required}
        />
      </label>

      {predictions.length > 0 && (
        <div className={dropdownClassName}>
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                selectPrediction(prediction);
              }}
              className={predictionButtonClassName}
            >
              {prediction.description}
            </button>
          ))}
        </div>
      )}

      <p className={statusClassName}>{loading ? "Searching addresses..." : helperText}</p>

      {status && <p className={`${statusClassName} text-rose-700`}>{status}</p>}

      {canRepairCoordinates && (
        <div>
          <button
            type="button"
            onClick={repairCoordinates}
            disabled={repairing || !inputValue.trim()}
            className={buttonClassName}
          >
            {repairing ? "Finding coordinates..." : "Find coordinates from address"}
          </button>
          {repairStatus && (
            <p className={`${statusClassName} ${repairStatus.startsWith("Coordinates") ? "text-emerald-700" : "text-rose-700"}`}>
              {repairStatus}
            </p>
          )}
        </div>
      )}

      {hiddenInputNames &&
        (Object.entries(hiddenInputNames) as Array<[keyof GoogleAddressFields, string]>).map(([key, name]) => (
          <input key={key} type="hidden" name={name} value={hiddenValues[key]} />
        ))}
    </div>
  );
}
