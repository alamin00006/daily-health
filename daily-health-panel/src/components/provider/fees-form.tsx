"use client";

import { useState } from "react";
import { Button, Field, Input, Switch } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useUpdateProvider } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import type { MyProviderProfileResponse } from "@/shared-contracts/doctors.contract";

const toText = (value: number | null) => (value === null ? "" : String(value));
const toFee = (text: string) => (text.trim() === "" ? null : Number(text));

/** Online fees, home visits and the ৳10 quick-consult queue. */
export function FeesForm({ profile }: { profile: MyProviderProfileResponse }) {
  const toast = useToast();
  const update = useUpdateProvider();
  const [video, setVideo] = useState(toText(profile.fees.video));
  const [chat, setChat] = useState(toText(profile.fees.chat));
  const [home, setHome] = useState(toText(profile.offersHomeVisit ? profile.fees.homeVisit : null));
  const [offersHomeVisit, setOffersHomeVisit] = useState(profile.offersHomeVisit);
  const [quick, setQuick] = useState(profile.acceptsQuickConsult);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="ভিডিও কল ফি (৳)" htmlFor="video" hint="খালি = ভিডিওতে দেখেন না">
          <Input id="video" type="number" min={0} value={video} onChange={(e) => setVideo(e.target.value)} />
        </Field>
        <Field label="চ্যাট ফি (৳)" htmlFor="chat" hint="খালি = চ্যাটে দেখেন না">
          <Input id="chat" type="number" min={0} value={chat} onChange={(e) => setChat(e.target.value)} />
        </Field>
        <Field label="হোম ভিজিট ফি (৳)" htmlFor="home">
          <Input id="home" type="number" min={0} value={home} disabled={!offersHomeVisit} onChange={(e) => setHome(e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
        <span>
          <span className="block font-medium">বাসায় গিয়ে দেখি (হোম ভিজিট)</span>
          <span className="text-sm text-muted">রোগীরা ঠিকানা দিয়ে বুক করবেন</span>
        </span>
        <Switch label="হোম ভিজিট" checked={offersHomeVisit} onChange={setOffersHomeVisit} />
      </label>
      <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
        <span>
          <span className="block font-medium">৳১০-এর দ্রুত চ্যাট পরামর্শে আছি</span>
          <span className="text-sm text-muted">অনলাইনে থাকলে কিউ থেকে রোগী আসবে (শুধু চ্যাট)</span>
        </span>
        <Switch label="দ্রুত পরামর্শ" checked={quick} onChange={setQuick} />
      </label>
      {error ? <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p> : null}
      <div>
        <Button
          loading={update.isPending}
          onClick={() => {
            setError(null);
            update.mutate(
              {
                videoFee: toFee(video),
                chatFee: toFee(chat),
                homeVisitFee: offersHomeVisit ? toFee(home) : null,
                offersHomeVisit,
                acceptsQuickConsult: quick,
              },
              {
                onSuccess: () => toast("ফি সেভ হয়েছে"),
                onError: (e) => setError(isApiError(e) ? e.userMessage : "সেভ হয়নি"),
              },
            );
          }}
        >
          ফি সেভ করুন
        </Button>
      </div>
    </div>
  );
}
