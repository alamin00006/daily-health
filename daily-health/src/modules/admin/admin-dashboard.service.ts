import { Injectable } from '@nestjs/common';
import { dhakaDate } from '../../common/time/dhaka-time.js';
import type { AdminDashboardResponse } from '../../shared-contracts/admin.contract.js';
import { AppointmentLookupService } from '../appointments/appointment-lookup.service.js';
import { UserAccountsService } from '../auth/user-accounts.service.js';
import { HealthTipsService } from '../content/health-tips.service.js';
import { ProviderDirectoryService } from '../doctors/provider-directory.service.js';
import { EmergencyRequestsService } from '../emergency/emergency-requests.service.js';
import { RefundsService } from '../payments/refunds.service.js';
import { PatientProfilesService } from '../users/patient-profiles.service.js';

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** Counts for the admin's home page, each from the module that owns it. */
@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly accounts: UserAccountsService,
    private readonly profiles: PatientProfilesService,
    private readonly providers: ProviderDirectoryService,
    private readonly emergencies: EmergencyRequestsService,
    private readonly refunds: RefundsService,
    private readonly appointments: AppointmentLookupService,
    private readonly tips: HealthTipsService,
  ) {}

  async get(): Promise<AdminDashboardResponse> {
    const [total, newLast7Days, patientProfiles, pending, live, refunds, today, tips] = await Promise.all([
      this.accounts.countAccounts(),
      this.accounts.countAccounts(new Date(Date.now() - WEEK_MS)),
      this.profiles.countActive(),
      this.providers.countPendingVerification(),
      this.emergencies.countLive(),
      this.refunds.countOpen(),
      this.appointments.countOnDay(dhakaDate()),
      this.tips.countPublished(),
    ]);
    return {
      accounts: { total, newLast7Days },
      patientProfiles,
      providersPendingVerification: pending,
      liveEmergencies: live,
      refundsWaiting: refunds,
      appointmentsToday: today,
      publishedHealthTips: tips,
    };
  }
}
