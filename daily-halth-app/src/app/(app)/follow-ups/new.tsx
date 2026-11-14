import { router } from 'expo-router';
import { MapPin, Save, UserRound } from 'lucide-react-native';
import { useState } from 'react';

import { CurrentProfileChip } from '@/components/profile/active-profile-chip';
import { ActionButton } from '@/components/ui/action-button';
import { ChipSelect } from '@/components/ui/chip-select';
import { DateField, TimeField } from '@/components/ui/date-time-field';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { apiErrorMessage } from '@/api/api-error-messages';
import { FOLLOW_UP_MODE_LABEL } from '@/features/doctors/doctor-display';
import { useFollowUpActions } from '@/features/doctors/use-doctors';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { addDays, dhakaDate } from '@/lib/bangla-format';
import { showToast } from '@/lib/user-feedback';
import type { FollowUpMode } from '@/shared-contracts/appointments.contract';

const MODES = (Object.keys(FOLLOW_UP_MODE_LABEL) as FollowUpMode[]).map((value) => ({
  value,
  label: FOLLOW_UP_MODE_LABEL[value],
}));

/** A follow-up with a doctor outside the app, reminded 24 h and 2 h before. */
export default function NewFollowUpScreen() {
  const { profile } = useActiveProfile();
  const { create } = useFollowUpActions(profile?.id ?? '');
  const [doctorName, setDoctorName] = useState('');
  const [location, setLocation] = useState('');
  const [mode, setMode] = useState<FollowUpMode>('IN_PERSON');
  const [date, setDate] = useState<string | null>(addDays(dhakaDate(), 7));
  const [time, setTime] = useState<string | null>('10:00');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Dhaka wall time → instant (+06:00, no daylight saving).
  const dueAt = date && time ? `${date}T${time}:00+06:00` : null;
  const [openedAt] = useState(() => Date.now());
  const inPast = dueAt ? Date.parse(dueAt) <= openedAt : false;
  const valid = doctorName.trim().length >= 2 && dueAt && !inPast;

  return (
    <ScrollScreen
      header={<ScreenHeader title="ফলো-আপ যোগ করুন" backIcon="close" fallbackHref="/appointments" />}
      footer={
        <ActionButton
          label="সেভ করুন"
          icon={Save}
          disabled={!valid}
          loading={create.isPending}
          onPress={() => {
            if (!dueAt) return;
            setError(null);
            create.mutate(
              {
                doctorName: doctorName.trim(),
                location: location.trim() || undefined,
                mode,
                dueAt,
                note: note.trim() || undefined,
              },
              {
                onSuccess: () => {
                  showToast('সেভ হয়েছে; আগের দিন আর ২ ঘণ্টা আগে মনে করিয়ে দেব');
                  router.back();
                },
                onError: (e) => setError(apiErrorMessage(e)),
              }
            );
          }}
        />
      }>
      <CurrentProfileChip />
      <LabeledTextInput
        label="ডাক্তারের নাম"
        icon={UserRound}
        value={doctorName}
        onChangeText={setDoctorName}
        placeholder="যেমন: ডা. সেলিনা হক (চক্ষু)"
        maxLength={80}
      />
      <ChipSelect label="কীভাবে" options={MODES} value={mode} onChange={setMode} />
      <DateField label="তারিখ" value={date} onChange={setDate} minimumDate={new Date()} />
      <TimeField
        label="সময়"
        value={time}
        onChange={setTime}
        errorText={inPast ? 'সময়টি পেরিয়ে গেছে' : undefined}
      />
      <LabeledTextInput
        label="কোথায় (ঐচ্ছিক)"
        icon={MapPin}
        value={location}
        onChangeText={setLocation}
        placeholder="হাসপাতাল বা চেম্বার"
        maxLength={160}
      />
      <LabeledTextInput
        label="নোট (ঐচ্ছিক)"
        value={note}
        onChangeText={setNote}
        placeholder="যেমন: রক্তের রিপোর্ট নিয়ে যেতে হবে"
        multiline
        maxLength={300}
      />
      {error ? <FormErrorBanner message={error} /> : null}
    </ScrollScreen>
  );
}
