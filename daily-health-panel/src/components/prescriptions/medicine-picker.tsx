"use client";

import { Pill } from "lucide-react";
import { useState } from "react";
import { Input, Spinner } from "@/components/ui/primitives";
import { MEDICINE_FORM_LABEL } from "@/features/labels";
import { useMedicineSearch } from "@/features/prescription-queries";
import type { MedicineResponse } from "@/shared-contracts/medicine.contract";

/**
 * Medicine name with catalog suggestions. Typing a name not in the catalog is
 * fine (free text); picking a suggestion also fills strength, form and unit.
 */
export function MedicinePicker({
  id,
  value,
  invalid,
  onType,
  onPick,
}: {
  id: string;
  value: string;
  invalid?: boolean;
  onType: (name: string) => void;
  onPick: (medicine: MedicineResponse) => void;
}) {
  const [open, setOpen] = useState(false);
  const search = useMedicineSearch(open ? value : "");
  const results = search.data ?? [];

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        autoComplete="off"
        placeholder="যেমন: Napa"
        aria-invalid={invalid}
        aria-autocomplete="list"
        aria-expanded={open && results.length > 0}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && value.trim().length >= 2 ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-white shadow-lg">
          {search.isFetching && results.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted">
              <Spinner className="size-4" /> খোঁজা হচ্ছে…
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">তালিকায় নেই; যেমন লিখেছেন তেমনই থাকবে।</p>
          ) : (
            <ul role="listbox">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onPick(m);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-mint"
                  >
                    <Pill className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {m.brandName} {m.strength}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {m.genericName} · {MEDICINE_FORM_LABEL[m.form]}
                        {m.manufacturer ? ` · ${m.manufacturer}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
