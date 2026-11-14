import { MODE_LABEL } from "@/features/labels";
import { bn, formatInstant, money } from "@/lib/format";
import type { ProviderAppointmentResponse } from "@/shared-contracts/appointments.contract";

export function AppointmentMeta({ appointment }: { appointment: ProviderAppointmentResponse }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <div>
        <dt className="text-muted">বুকিং কোড</dt>
        <dd className="font-mono font-semibold">{appointment.code}</dd>
      </div>
      <div>
        <dt className="text-muted">রোগীর ID</dt>
        <dd className="font-mono font-semibold">{appointment.patient.patientCode}</dd>
      </div>
      <div>
        <dt className="text-muted">ধরন</dt>
        <dd>{MODE_LABEL[appointment.mode]}{appointment.kind === "FOLLOW_UP" ? " (ফলো-আপ)" : ""}</dd>
      </div>
      <div>
        <dt className="text-muted">সময়</dt>
        <dd>{formatInstant(appointment.estimatedAt ?? appointment.scheduledAt)}{appointment.serialNo ? `, সিরিয়াল ${bn(appointment.serialNo)}` : ""}</dd>
      </div>
      <div>
        <dt className="text-muted">আগের ভিজিট</dt>
        <dd>{appointment.patient.previousVisits > 0 ? `${bn(appointment.patient.previousVisits)} বার` : "নতুন রোগী"}</dd>
      </div>
      <div>
        <dt className="text-muted">ফি</dt>
        <dd>{money(appointment.fee)}</dd>
      </div>
      {appointment.homeAddress ? (
        <div className="col-span-2">
          <dt className="text-muted">বাসার ঠিকানা</dt>
          <dd>{appointment.homeAddress}</dd>
        </div>
      ) : null}
      {appointment.reason ? (
        <div className="col-span-2">
          <dt className="text-muted">কেন আসছেন</dt>
          <dd>{appointment.reason}</dd>
        </div>
      ) : null}
      {appointment.cancelReason ? (
        <div className="col-span-2">
          <dt className="text-muted">বাতিলের কারণ</dt>
          <dd>{appointment.cancelReason}</dd>
        </div>
      ) : null}
      {appointment.followUpDueAt ? (
        <div className="col-span-2">
          <dt className="text-muted">ফলো-আপ</dt>
          <dd>{formatInstant(appointment.followUpDueAt)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

