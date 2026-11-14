import { router } from 'expo-router';
import { MessagesSquare, Video, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import {
  CONSULT_STATUS_LABEL,
  CONSULT_STATUS_TONE,
  QUICK_KIND_LABEL,
  consultTitle,
} from '@/features/consultations/consultation-display';
import { useMyConsultations } from '@/features/consultations/use-consultations';
import { taka } from '@/features/doctors/doctor-display';
import { formatDateTime } from '@/lib/bangla-format';
import type { ConsultationResponse } from '@/shared-contracts/consultation.contract';
import { colors } from '@/theme/design-tokens';

const SCOPES = [
  { value: 'active' as const, label: 'চলমান' },
  { value: 'past' as const, label: 'আগের' },
];

function ConsultationRow({ c }: { c: ConsultationResponse }) {
  const Icon = c.tier === 'QUICK' ? Zap : c.channel === 'VIDEO' ? Video : MessagesSquare;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/consultations/[consultationId]', params: { consultationId: c.id } })}
      className="flex-row items-center gap-3 rounded-3xl border border-line bg-surface-card p-4 active:bg-primary-50">
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary-100">
        <Icon size={22} color={colors.primary} />
      </View>
      <View className="flex-1">
        <BanglaText variant="body-strong" numberOfLines={1}>
          {consultTitle(c)}
        </BanglaText>
        <BanglaText variant="caption" numberOfLines={1}>
          {c.patient.fullName} · {c.tier === 'QUICK' ? QUICK_KIND_LABEL[c.quickKind ?? 'GENERAL'] : (c.appointmentCode ?? '')} ·{' '}
          {taka(c.fee)}
        </BanglaText>
        <BanglaText variant="caption">{formatDateTime(c.startedAt ?? c.createdAt)}</BanglaText>
      </View>
      <StatusPill label={CONSULT_STATUS_LABEL[c.status]} tone={CONSULT_STATUS_TONE[c.status]} />
    </Pressable>
  );
}

/** Quick consults and video/chat sessions the user took part in. */
export default function ConsultationsScreen() {
  const [scope, setScope] = useState<'active' | 'past'>('active');
  const list = useMyConsultations(scope);
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <ScrollScreen
      header={<ScreenHeader title="আমার পরামর্শ" fallbackHref="/doctors" />}
      onRefresh={() => list.refetch()}>
      <ChipSelect options={SCOPES} value={scope} onChange={setScope} />
      {list.isLoading ? (
        <LoadingList rows={3} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={scope === 'active' ? 'এখন কোনো পরামর্শ চলছে না' : 'এখনো কোনো পরামর্শ হয়নি'}
          message="অনলাইন ডাক্তারের সাথে চ্যাটে দ্রুত পরামর্শ নিন।"
          actionLabel="দ্রুত পরামর্শ নিন"
          onAction={() => router.push('/quick-consult')}
        />
      ) : (
        <View className="gap-3">
          {rows.map((c) => (
            <ConsultationRow key={c.id} c={c} />
          ))}
          {list.hasNextPage ? (
            <ActionButton
              label="আরও দেখুন"
              variant="outline"
              size="sm"
              loading={list.isFetchingNextPage}
              onPress={() => void list.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
    </ScrollScreen>
  );
}
