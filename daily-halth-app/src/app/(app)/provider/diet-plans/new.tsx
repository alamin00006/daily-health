import { useLocalSearchParams } from 'expo-router';

import { DietPlanEditor } from '@/components/provider/diet-plan-editor';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';

/** A new diet chart for one visit (opened from the "চার্ট দেওয়া বাকি" list). */
export default function NewDietPlanScreen() {
  const { appointmentId, patientName } = useLocalSearchParams<{ appointmentId: string; patientName?: string }>();
  return (
    <ScrollScreen
      header={<ScreenHeader title="নতুন ডায়েট চার্ট" subtitle={patientName || undefined} fallbackHref="/provider/diet-plans" />}>
      <DietPlanEditor appointmentId={appointmentId} />
    </ScrollScreen>
  );
}
