import type {
  PatientProfileResponse,
  ProfileRelation,
  ProfileRole,
} from '@/shared-contracts/profiles.contract';

/** Same rules as the API's ProfileAccessService (CLAUDE.md §1 "Family and caregivers"). */
export function canEdit(profile: Pick<PatientProfileResponse, 'myRole'> | null): boolean {
  return profile?.myRole === 'OWNER' || profile?.myRole === 'CAREGIVER';
}

export function canManageMembers(profile: Pick<PatientProfileResponse, 'myRole'> | null): boolean {
  return profile?.myRole === 'OWNER';
}

export const ROLE_LABELS: Record<ProfileRole, string> = {
  OWNER: 'মালিক',
  CAREGIVER: 'দেখাশোনাকারী',
  VIEWER: 'শুধু দেখতে পারেন',
};

export const ROLE_DESCRIPTIONS: Record<ProfileRole, string> = {
  OWNER: 'সব কিছু করতে পারেন, সদস্য যোগ ও বাদ দিতে পারেন',
  CAREGIVER: 'তথ্য দেখতে, যোগ ও বদলাতে পারেন',
  VIEWER: 'শুধু দেখতে পারেন, কিছু বদলাতে পারেন না',
};

/** "This profile is my …" */
export const RELATION_LABELS: Record<ProfileRelation, string> = {
  SELF: 'নিজে',
  FATHER: 'বাবা',
  MOTHER: 'মা',
  CHILD: 'সন্তান',
  SPOUSE: 'স্বামী/স্ত্রী',
  OTHER: 'অন্যান্য',
};

/** Short label shown under a family member's name ("বাবা", "আমি"). */
export function relationLabel(profile: Pick<PatientProfileResponse, 'myRelation'>): string {
  return profile.myRelation === 'SELF' ? 'আমি' : RELATION_LABELS[profile.myRelation];
}
