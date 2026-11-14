"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Palette, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, ErrorBox, Field, Input, PageHeader, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, isApiError } from "@/lib/api-client";
import { bn, formatInstant } from "@/lib/format";
import {
  contrastWithWhite,
  DEFAULT_PRIMARY_COLOR,
  MIN_PRIMARY_CONTRAST,
  primaryPalette,
  type AdminAppConfigResponse,
  type AppConfigChangeResponse,
} from "@/shared-contracts/app-config.contract";
import type { PaginatedResponse } from "@/shared-contracts/common-fields.contract";

const KEY = ["admin", "app-config"] as const;
const HISTORY_KEY = ["admin", "app-config", "history"] as const;

/** Readable on white text; picked to sit well with the fixed red/rose/green colours. */
const PRESETS = [
  { hex: DEFAULT_PRIMARY_COLOR, name: "টিল (আসল)" },
  { hex: "#1d4ed8", name: "নীল" },
  { hex: "#0e7490", name: "সায়ান" },
  { hex: "#6d28d9", name: "বেগুনি" },
  { hex: "#166534", name: "সবুজ" },
  { hex: "#9a3412", name: "কমলা-বাদামি" },
  { hex: "#334155", name: "স্লেট" },
];

const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v.trim());

/** What the app looks like with this colour: header, card, button, tab. */
function PhonePreview({ hex }: { hex: string }) {
  const p = primaryPalette(hex);
  return (
    <div className="mx-auto w-[260px] overflow-hidden rounded-[28px] border-8 border-ink/80 bg-[#f4f9f7] shadow-lg">
      <div className="space-y-3 p-4" style={{ background: `linear-gradient(180deg, ${p["100"]}, #f4f9f7)` }}>
        <p className="text-lg font-bold" style={{ color: p["600"] }}>দৈনিক স্বাস্থ্য</p>
        <div className="rounded-xl border bg-white px-3 py-2 text-xs text-muted">ডাক্তার খুঁজুন</div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4">
        {["দ্রুত পরামর্শ", "বিশেষজ্ঞ ডাক্তার"].map((t) => (
          <div key={t} className="rounded-xl p-3 text-xs font-semibold" style={{ background: p["50"], color: p["700"] }}>
            {t}
          </div>
        ))}
      </div>
      <div className="p-4">
        <div className="rounded-xl py-2.5 text-center text-sm font-semibold text-white" style={{ background: p["600"] }}>
          অ্যাপয়েন্টমেন্ট নিন
        </div>
      </div>
      <div className="flex justify-around border-t bg-white py-2 text-[10px]">
        <span className="rounded-full px-3 py-1 font-semibold" style={{ background: p["100"], color: p["600"] }}>হোম</span>
        <span className="flex size-9 -mt-5 items-center justify-center rounded-full text-white" style={{ background: p["600"] }}>+</span>
        <span className="px-3 py-1 text-muted">ওষুধ</span>
      </div>
    </div>
  );
}

/** ADMIN: the mobile app's primary colour. */
export default function BrandingPage() {
  const toast = useToast();
  const client = useQueryClient();
  const config = useQuery({ queryKey: KEY, queryFn: () => api.get<AdminAppConfigResponse>("/admin/app-config") });
  const history = useQuery({
    queryKey: HISTORY_KEY,
    queryFn: () => api.get<PaginatedResponse<AppConfigChangeResponse>>("/admin/app-config/history", { limit: 20 }),
  });
  const save = useMutation({
    mutationFn: (primaryColor: string) => api.patch<AdminAppConfigResponse>("/admin/app-config", { primaryColor }),
    onSuccess: (data) => {
      client.setQueryData(KEY, data);
      void client.invalidateQueries({ queryKey: HISTORY_KEY });
    },
  });
  const [draft, setDraft] = useState<string | null>(null);
  const current = config.data?.primaryColor ?? DEFAULT_PRIMARY_COLOR;
  const hex = (draft ?? current).trim().toLowerCase();
  const valid = isHex(hex);
  const contrast = valid ? contrastWithWhite(hex) : 0;
  const readable = contrast >= MIN_PRIMARY_CONTRAST;
  const changed = valid && hex !== current;

  return (
    <>
      <PageHeader title="অ্যাপের রং" subtitle="মোবাইল অ্যাপের মূল রং। জরুরি লাল, নারীস্বাস্থ্যের গোলাপি আর পুষ্টির সবুজ বদলায় না।" />
      {config.isPending ? (
        <Skeleton className="h-80" />
      ) : config.isError ? (
        <ErrorBox message={isApiError(config.error) ? config.error.userMessage : "লোড হয়নি"} onRetry={() => void config.refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="রং বেছে নিন"
                subtitle={`এখনকার রং ${current}${config.data?.updatedByName ? ` · শেষ বদল ${config.data.updatedByName}, ${formatInstant(config.data.updatedAt)}` : ""}`}
              />
              <div className="space-y-5 p-5">
                <div className="flex flex-wrap gap-3">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => setDraft(preset.hex)}
                      className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:bg-mint/40"
                      aria-pressed={hex === preset.hex}
                    >
                      <span className="size-6 rounded-full" style={{ background: preset.hex }} />
                      {preset.name}
                      {hex === preset.hex ? <Check className="size-4 text-primary" /> : null}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="নিজের রং" htmlFor="primary-hex" hint="যেমন #0f5c5a">
                    <div className="flex items-center gap-2">
                      <input
                        aria-label="রং বাছুন"
                        type="color"
                        value={valid ? hex : current}
                        onChange={(e) => setDraft(e.target.value)}
                        className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-white"
                      />
                      <Input id="primary-hex" value={draft ?? current} onChange={(e) => setDraft(e.target.value)} className="w-36" />
                    </div>
                  </Field>
                  {valid ? (
                    <Badge tone={readable ? "success" : "danger"}>
                      কনট্রাস্ট {bn(contrast.toFixed(1))}:১ {readable ? "· সাদা লেখা পড়া যাবে" : "· খুব হালকা, সাদা লেখা পড়া যাবে না"}
                    </Badge>
                  ) : (
                    <Badge tone="danger">সঠিক রং লিখুন (#RRGGBB)</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {valid
                    ? Object.entries(primaryPalette(hex))
                        .filter(([k]) => /^\d+$/.test(k))
                        .map(([k, v]) => (
                          <div key={k} className="text-center text-[10px] text-muted">
                            <div className="h-8 w-12 rounded-md border border-line" style={{ background: v }} />
                            {k}
                          </div>
                        ))
                    : null}
                </div>
                <div className="flex gap-3">
                  <Button
                    icon={Palette}
                    disabled={!changed || !readable}
                    loading={save.isPending}
                    onClick={() =>
                      save.mutate(hex, {
                        onSuccess: () => (toast("রং বদলেছে; অ্যাপ খুললেই নতুন রং দেখাবে"), setDraft(null)),
                        onError: (e) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error"),
                      })
                    }
                  >
                    অ্যাপে লাগান
                  </Button>
                  {current !== DEFAULT_PRIMARY_COLOR ? (
                    <Button variant="outline" icon={RotateCcw} onClick={() => setDraft(DEFAULT_PRIMARY_COLOR)}>
                      আসল রঙে ফিরুন
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader title="বদলের ইতিহাস" />
              <ul className="divide-y divide-line">
                {(history.data?.data ?? []).map((h) => (
                  <li key={h.id} className="flex items-center gap-2 px-5 py-3 text-sm">
                    <span className="size-4 rounded-full" style={{ background: h.fromColor }} />
                    {h.fromColor} →
                    <span className="size-4 rounded-full" style={{ background: h.toColor }} />
                    {h.toColor}
                    <span className="text-muted">· {h.changedByName ?? "অ্যাডমিন"}, {formatInstant(h.createdAt)}</span>
                  </li>
                ))}
                {history.data && history.data.data.length === 0 ? <li className="px-5 py-3 text-sm text-muted">এখনো বদলানো হয়নি।</li> : null}
              </ul>
            </Card>
          </div>
          <div>
            <p className="mb-2 text-center text-sm text-muted">প্রিভিউ</p>
            <PhonePreview hex={valid ? hex : current} />
          </div>
        </div>
      )}
    </>
  );
}
