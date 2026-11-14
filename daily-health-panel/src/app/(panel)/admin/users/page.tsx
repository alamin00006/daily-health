"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Search, ShieldPlus, UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Modal } from "@/components/ui/modal";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBox, Field, Input, PageHeader, Select, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL } from "@/features/labels";
import { useMe } from "@/features/panel-queries";
import { useAdminUsers, useSetSuspended, useStaffActions, useStaffMembers } from "@/features/staff-queries";
import { isApiError } from "@/lib/api-client";
import { formatInstant } from "@/lib/format";
import type { AdminUserResponse, StaffRole } from "@/shared-contracts/admin.contract";

const staffForm = z.object({
  email: z.string().trim().toLowerCase().email("ঠিক ইমেইল দিন"),
  fullName: z.string().trim().min(2, "নাম লিখুন").max(80),
  role: z.enum(["MODERATOR", "ADMIN"]),
});
type StaffValues = z.infer<typeof staffForm>;

function without(filters: Record<string, string>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(filters).filter(([k]) => k !== key));
}

const STAFF_ROLE_HINT: Record<StaffRole, string> = {
  MODERATOR: "জরুরি সেবার তালিকা আর স্বাস্থ্য টিপস (পরে ফোরাম মডারেশন)",
  ADMIN: "সব কিছু: সেবাদাতা যাচাই, টাকা, দাম, ব্যবহারকারী, অডিট লগ",
};

function AddStaffModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { add } = useStaffActions();
  const form = useForm<StaffValues>({ resolver: zodResolver(staffForm), defaultValues: { email: "", fullName: "", role: "MODERATOR" } });
  const errors = form.formState.errors;
  const role = useWatch({ control: form.control, name: "role" });
  const submit = form.handleSubmit((values) =>
    add.mutate(values, {
      onSuccess: () => {
        toast("স্টাফ যোগ হয়েছে; পরের লগইনে নতুন মেনু দেখবেন");
        onClose();
      },
      onError: (e) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error"),
    }),
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="স্টাফ যোগ করুন"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            বাতিল
          </Button>
          <Button loading={add.isPending} onClick={() => void submit()}>
            যোগ করুন
          </Button>
        </>
      }
    >
      <form noValidate className="grid gap-4" onSubmit={(e) => (e.preventDefault(), void submit())}>
        <Field label="ইমেইল" htmlFor="s-email" error={errors.email?.message} hint="আগে থেকেই যাচাই করা অ্যাকাউন্ট থাকতে হবে">
          <Input id="s-email" type="email" {...form.register("email")} aria-invalid={Boolean(errors.email)} />
        </Field>
        <Field label="পুরো নাম" htmlFor="s-name" error={errors.fullName?.message}>
          <Input id="s-name" {...form.register("fullName")} aria-invalid={Boolean(errors.fullName)} />
        </Field>
        <Field label="ভূমিকা" htmlFor="s-role" hint={STAFF_ROLE_HINT[role]}>
          <Select id="s-role" {...form.register("role")}>
            <option value="MODERATOR">মডারেটর</option>
            <option value="ADMIN">অ্যাডমিন</option>
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

function StaffSection() {
  const toast = useToast();
  const me = useMe();
  const staff = useStaffMembers();
  const actions = useStaffActions();
  const [adding, setAdding] = useState(false);
  const fail = (e: unknown) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error");
  return (
    <Card className="mb-6">
      <CardHeader
        title="স্টাফ"
        subtitle="মডারেটর আর অ্যাডমিন। স্টাফ আইডি কখনো বদলায় না।"
        action={
          <Button size="sm" icon={ShieldPlus} onClick={() => setAdding(true)}>
            স্টাফ যোগ করুন
          </Button>
        }
      />
      {staff.isPending ? (
        <Skeleton className="m-5 h-24" />
      ) : staff.isError ? (
        <div className="p-5">
          <ErrorBox message="লোড হয়নি" onRetry={() => void staff.refetch()} />
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {staff.data.map((s) => {
            const self = s.userId === me.data?.id;
            return (
              <li key={s.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {s.fullName} {self ? <span className="text-xs text-muted">(আপনি)</span> : null}
                  </p>
                  <p className="text-xs text-muted">
                    {s.staffCode} · {s.email}
                    {s.addedByName ? ` · যোগ করেছেন ${s.addedByName}` : ""}
                  </p>
                </div>
                {s.suspended ? <Badge tone="danger">স্থগিত</Badge> : null}
                <Select
                  aria-label={`${s.fullName}-এর ভূমিকা`}
                  className="w-auto"
                  value={s.role}
                  disabled={self || actions.update.isPending}
                  onChange={(e) =>
                    actions.update.mutate(
                      { userId: s.userId, body: { role: e.target.value as StaffRole } },
                      { onSuccess: () => toast("ভূমিকা বদলেছে"), onError: fail },
                    )
                  }
                >
                  <option value="MODERATOR">মডারেটর</option>
                  <option value="ADMIN">অ্যাডমিন</option>
                </Select>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={UserMinus}
                  disabled={self}
                  className="text-danger hover:bg-danger-soft"
                  onClick={() => {
                    if (window.confirm(`${s.fullName}-কে স্টাফ থেকে বাদ দেবেন? তাঁর অ্যাকাউন্ট সাধারণ অ্যাকাউন্ট হয়ে যাবে।`)) {
                      actions.remove.mutate(s.userId, { onSuccess: () => toast("বাদ দেওয়া হয়েছে"), onError: fail });
                    }
                  }}
                >
                  বাদ দিন
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? <AddStaffModal onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}

function UserRow({ u, self }: { u: AdminUserResponse; self: boolean }) {
  const toast = useToast();
  const suspend = useSetSuspended();
  return (
    <tr className="border-b border-line/60">
      <td className="px-4 py-3">
        <p className="font-medium">{u.name ?? "—"}</p>
        <p className="text-xs text-muted">{u.email}</p>
      </td>
      <td className="px-4 py-3">
        {ROLE_LABEL[u.role]}
        {u.code ? <p className="text-xs text-muted">{u.code}</p> : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">
        খোলা {formatInstant(u.createdAt)}
        <br />
        শেষ লগইন {u.lastLoginAt ? formatInstant(u.lastLoginAt) : "—"}
      </td>
      <td className="px-4 py-3">{u.suspended ? <Badge tone="danger">স্থগিত</Badge> : <Badge tone="success">সক্রিয়</Badge>}</td>
      <td className="px-4 py-3 text-right">
        <Button
          size="sm"
          variant={u.suspended ? "outline" : "ghost"}
          disabled={self}
          loading={suspend.isPending}
          className={u.suspended ? undefined : "text-danger hover:bg-danger-soft"}
          onClick={() => {
            const ok = u.suspended || window.confirm(`${u.email} স্থগিত করবেন? সব ডিভাইস থেকে লগআউট হয়ে যাবে, আর লগইন করতে পারবেন না।`);
            if (ok) {
              suspend.mutate(
                { userId: u.id, suspended: !u.suspended },
                {
                  onSuccess: () => toast(u.suspended ? "আবার সক্রিয় হয়েছে" : "স্থগিত করা হয়েছে"),
                  onError: (e) => toast(isApiError(e) ? e.userMessage : "হয়নি", "error"),
                },
              );
            }
          }}
        >
          {u.suspended ? "সক্রিয় করুন" : "স্থগিত করুন"}
        </Button>
      </td>
    </tr>
  );
}

/** Accounts (suspend / reactivate) and staff. */
export default function UsersPage() {
  const me = useMe();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const users = useAdminUsers(filters);
  const rows = users.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <PageHeader title="ব্যবহারকারী ও স্টাফ" subtitle="অ্যাকাউন্ট স্থগিত বা আবার সক্রিয় করুন, মডারেটর আর অ্যাডমিন ঠিক করুন।" />
      <StaffSection />
      <Card>
        <CardHeader title="অ্যাকাউন্ট" subtitle="নতুনগুলো আগে" />
        <form
          className="flex flex-wrap gap-3 border-b border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters(q.trim().length >= 2 ? { ...filters, q: q.trim() } : without(filters, "q"));
          }}
        >
          <Input aria-label="ইমেইল দিয়ে খুঁজুন" placeholder="ইমেইলের অংশ" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
          <Select
            aria-label="ভূমিকা"
            className="w-auto"
            value={filters.role ?? ""}
            onChange={(e) => setFilters(e.target.value ? { ...filters, role: e.target.value } : without(filters, "role"))}
          >
            <option value="">সব ভূমিকা</option>
            {Object.entries(ROLE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            aria-label="অবস্থা"
            className="w-auto"
            value={filters.status ?? ""}
            onChange={(e) => setFilters(e.target.value ? { ...filters, status: e.target.value } : without(filters, "status"))}
          >
            <option value="">সক্রিয় ও স্থগিত</option>
            <option value="ACTIVE">শুধু সক্রিয়</option>
            <option value="SUSPENDED">শুধু স্থগিত</option>
          </Select>
          <Button type="submit" icon={Search}>
            খুঁজুন
          </Button>
        </form>
        {users.isPending ? (
          <Skeleton className="m-5 h-48" />
        ) : users.isError ? (
          <div className="p-5">
            <ErrorBox message={isApiError(users.error) ? users.error.userMessage : "লোড হয়নি"} onRetry={() => void users.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="কোনো অ্যাকাউন্ট পাওয়া যায়নি" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line bg-surface text-xs text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">নাম ও ইমেইল</th>
                  <th className="px-4 py-3 font-medium">ভূমিকা</th>
                  <th className="px-4 py-3 font-medium">সময়</th>
                  <th className="px-4 py-3 font-medium">অবস্থা</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <UserRow key={u.id} u={u} self={u.id === me.data?.id} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {users.hasNextPage ? (
          <div className="p-4">
            <Button variant="outline" loading={users.isFetchingNextPage} onClick={() => void users.fetchNextPage()}>
              আরও দেখুন
            </Button>
          </div>
        ) : null}
      </Card>
    </>
  );
}
