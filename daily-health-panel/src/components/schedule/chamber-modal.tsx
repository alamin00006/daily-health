"use client";

import { Building2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button, Field, Input, Spinner } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useCreateChamber, useCreateHospital, useHospitalSearch, useUpdateChamber } from "@/features/panel-queries";
import { isApiError } from "@/lib/api-client";
import type { ChamberResponse, HospitalResponse } from "@/shared-contracts/doctors.contract";

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Add a chamber (find or add the hospital, then fees) or edit one. */
export function ChamberModal({ open, chamber, onClose }: { open: boolean; chamber: ChamberResponse | null; onClose: () => void }) {
  // Mounted fresh on every open, so the form starts from the chamber being edited.
  return open ? <ChamberModalBody chamber={chamber} onClose={onClose} /> : null;
}

function ChamberModalBody({ chamber, onClose }: { chamber: ChamberResponse | null; onClose: () => void }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const search = useHospitalSearch(useDebounced(query));
  const [hospital, setHospital] = useState<HospitalResponse | null>(chamber?.hospital ?? null);
  const [adding, setAdding] = useState(false);
  const [newHospital, setNewHospital] = useState({ name: "", address: "", district: "", phone: "" });
  const [room, setRoom] = useState(chamber?.room ?? "");
  const [fee, setFee] = useState(chamber ? String(chamber.fee) : "");
  const [followUpFee, setFollowUpFee] = useState(chamber?.followUpFee != null ? String(chamber.followUpFee) : "");
  const createHospital = useCreateHospital();
  const createChamber = useCreateChamber();
  const updateChamber = useUpdateChamber();

  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "সেভ হয়নি", "error");
  const feeValue = Number(fee);
  const valid = hospital && fee !== "" && feeValue >= 0;

  async function save() {
    if (!valid) return;
    const body = {
      room: room.trim() || null,
      fee: feeValue,
      followUpFee: followUpFee === "" ? null : Number(followUpFee),
    };
    try {
      if (chamber) await updateChamber.mutateAsync({ id: chamber.id, ...body });
      else await createChamber.mutateAsync({ hospitalId: hospital.id, ...body });
      toast("চেম্বার সেভ হয়েছে");
      onClose();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={chamber ? "চেম্বার বদলান" : "নতুন চেম্বার"}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>বাতিল</Button>
          <Button disabled={!valid} loading={createChamber.isPending || updateChamber.isPending} onClick={save}>সেভ করুন</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {hospital ? (
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-mint p-3">
            <Building2 className="mt-0.5 size-5 text-primary" />
            <div className="flex-1">
              <p className="font-semibold">{hospital.name}</p>
              <p className="text-sm text-muted">{hospital.address}, {hospital.district}</p>
            </div>
            {!chamber ? <button type="button" className="text-sm font-medium text-primary" onClick={() => setHospital(null)}>বদলান</button> : null}
          </div>
        ) : adding ? (
          <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
            <p className="text-sm font-semibold">নতুন হাসপাতাল বা চেম্বার</p>
            <Input placeholder="নাম, যেমন: ল্যাবএইড স্পেশালাইজড হাসপাতাল" value={newHospital.name} onChange={(e) => setNewHospital({ ...newHospital, name: e.target.value })} />
            <Input placeholder="ঠিকানা" value={newHospital.address} onChange={(e) => setNewHospital({ ...newHospital, address: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="জেলা, যেমন: ঢাকা" value={newHospital.district} onChange={(e) => setNewHospital({ ...newHospital, district: e.target.value })} />
              <Input placeholder="ফোন (ঐচ্ছিক)" value={newHospital.phone} onChange={(e) => setNewHospital({ ...newHospital, phone: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setAdding(false)}>খুঁজে দেখি</Button>
              <Button
                size="sm"
                loading={createHospital.isPending}
                disabled={newHospital.name.trim().length < 2 || newHospital.address.trim().length < 3 || newHospital.district.trim().length < 2}
                onClick={() =>
                  createHospital.mutate(
                    { ...newHospital, phone: newHospital.phone.trim() || undefined },
                    { onSuccess: (h) => { setHospital(h); setAdding(false); }, onError: fail },
                  )
                }
              >
                যোগ করুন
              </Button>
            </div>
          </div>
        ) : (
          <Field label="হাসপাতাল বা ডায়াগনস্টিক সেন্টার" htmlFor="hospital-search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <Input id="hospital-search" className="pl-9" placeholder="নাম লিখে খুঁজুন" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            </div>
            {query.trim().length >= 2 ? (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line">
                {search.isFetching ? (
                  <div className="flex justify-center p-4"><Spinner /></div>
                ) : (
                  <>
                    {search.data?.map((h) => (
                      <button key={h.id} type="button" className="block w-full border-b border-line px-3 py-2 text-left last:border-0 hover:bg-mint" onClick={() => setHospital(h)}>
                        <span className="font-medium">{h.name}</span>
                        <span className="block text-sm text-muted">{h.address}, {h.district}</span>
                      </button>
                    ))}
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-primary hover:bg-mint" onClick={() => { setAdding(true); setNewHospital({ ...newHospital, name: query }); }}>
                      <Plus className="size-4" /> তালিকায় নেই? নতুন যোগ করুন
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </Field>
        )}
        <Field label="রুম বা তলা (ঐচ্ছিক)" htmlFor="room">
          <Input id="room" placeholder="রুম ৪১২, ৪র্থ তলা" value={room} onChange={(e) => setRoom(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="ভিজিট ফি (৳)" htmlFor="fee">
            <Input id="fee" type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
          <Field label="ফলো-আপ ফি (৳, ঐচ্ছিক)" htmlFor="followUpFee" hint="আবার দেখাতে এলে">
            <Input id="followUpFee" type="number" min={0} value={followUpFee} onChange={(e) => setFollowUpFee(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
