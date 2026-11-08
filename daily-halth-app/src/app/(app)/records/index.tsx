import { router } from 'expo-router';
import { FileText, Upload } from 'lucide-react-native';

import { FileThumbnail } from '@/components/records/file-thumbnail';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { FILE_TYPE_LABELS } from '@/features/health/health-display';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { useMedicalFiles } from '@/features/records/use-records';
import { formatDate, timeAgo } from '@/lib/bangla-format';
import type { MedicalFileType } from '@/shared-contracts/records.contract';

type Filter = MedicalFileType | 'ALL';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'সব' },
  ...(Object.keys(FILE_TYPE_LABELS) as MedicalFileType[]).map((value) => ({
    value,
    label: FILE_TYPE_LABELS[value],
  })),
];

export default function RecordsScreen() {
  const { profile } = useActiveProfile();
  const [filter, setFilter] = useState<Filter>('ALL');
  const files = useMedicalFiles(profile?.id, filter === 'ALL' ? undefined : filter);
  const items = files.data?.pages.flatMap((page) => page.data) ?? [];
  const editable = canEdit(profile);

  return (
    <ScrollScreen
      header={
        <ScreenHeader
          title="রিপোর্ট ও প্রেসক্রিপশন"
          subtitle={profile?.fullName}
          fallbackHref="/health"
        />
      }
      onRefresh={() => files.refetch()}
      footer={
        editable ? (
          <ActionButton
            label="নতুন ফাইল যোগ করুন"
            icon={Upload}
            onPress={() => router.push('/records/upload')}
          />
        ) : undefined
      }>
      <ChipSelect options={FILTERS} value={filter} onChange={setFilter} scroll />

      {files.isLoading ? (
        <LoadingList rows={4} rowClassName="h-20" />
      ) : files.isError ? (
        <ErrorState error={files.error} onRetry={() => void files.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="কোনো ফাইল নেই"
          message="ল্যাব রিপোর্ট, প্রেসক্রিপশন বা এক্স-রের ছবি তুলে রাখুন। ডাক্তার দেখাতে কাগজ খুঁজতে হবে না।"
        />
      ) : (
        <View className="gap-3">
          {items.map((file) => (
            <Pressable
              key={file.id}
              accessibilityRole="button"
              accessibilityLabel={file.title}
              onPress={() =>
                router.push({ pathname: '/records/[fileId]', params: { fileId: file.id } })
              }
              className="flex-row items-center gap-3.5 rounded-3xl border border-line/70 bg-surface-card p-3 active:bg-primary-50">
              <FileThumbnail file={file} />
              <View className="flex-1 gap-0.5">
                <BanglaText variant="body-strong" numberOfLines={2}>
                  {file.title}
                </BanglaText>
                <BanglaText variant="caption">
                  {FILE_TYPE_LABELS[file.type]}
                  {file.reportDate
                    ? ` · ${formatDate(file.reportDate)}`
                    : ` · ${timeAgo(file.createdAt)}`}
                </BanglaText>
              </View>
            </Pressable>
          ))}
          {files.hasNextPage ? (
            <ActionButton
              label="আরও দেখুন"
              variant="ghost"
              size="sm"
              loading={files.isFetchingNextPage}
              onPress={() => void files.fetchNextPage()}
            />
          ) : null}
        </View>
      )}
    </ScrollScreen>
  );
}
