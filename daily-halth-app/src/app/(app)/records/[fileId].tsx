import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, FileText, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { DateField } from '@/components/ui/date-time-field';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { IconButton, ScreenHeader } from '@/components/ui/screen-header';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { apiErrorMessage } from '@/api/api-error-messages';
import { FILE_TYPE_LABELS } from '@/features/health/health-display';
import { canEdit } from '@/features/profiles/profile-permissions';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import {
  useDeleteMedicalFile,
  useMedicalFile,
  useUpdateMedicalFile,
} from '@/features/records/use-records';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/bangla-format';
import { resolveFileUrl } from '@/lib/file-url';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { MedicalFileType } from '@/shared-contracts/records.contract';
import { colors } from '@/theme/design-tokens';

const TYPE_OPTIONS = (Object.keys(FILE_TYPE_LABELS) as MedicalFileType[]).map((value) => ({
  value,
  label: FILE_TYPE_LABELS[value],
}));

export default function MedicalFileScreen() {
  const { fileId } = useLocalSearchParams<{ fileId: string }>();
  const { profile } = useActiveProfile();
  const file = useMedicalFile(profile?.id, fileId);
  const update = useUpdateMedicalFile(profile?.id ?? '', fileId ?? '');
  const remove = useDeleteMedicalFile(profile?.id ?? '');
  const editable = canEdit(profile);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<MedicalFileType>('LAB_REPORT');
  const [reportDate, setReportDate] = useState<string | null>(null);

  const data = file.data;
  const startEdit = () => {
    if (!data) return;
    setTitle(data.title);
    setType(data.type);
    setReportDate(data.reportDate);
    setEditing(true);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <ScreenHeader
        title={data?.title ?? 'ফাইল'}
        subtitle={data ? FILE_TYPE_LABELS[data.type] : undefined}
        fallbackHref="/records"
        actions={
          editable && data && !editing ? (
            <IconButton icon={Pencil} label="তথ্য বদলান" onPress={startEdit} />
          ) : undefined
        }
      />
      <ScrollView contentContainerClassName="gap-5 px-5 pb-10" showsVerticalScrollIndicator={false}>
        {file.isLoading ? (
          <SkeletonBlock className="h-96" />
        ) : file.isError || !data ? (
          <ErrorState error={file.error} onRetry={() => void file.refetch()} />
        ) : (
          <>
            {data.previewUrl ? (
              <View className="overflow-hidden rounded-3xl border border-line/70 bg-surface-card">
                <Image
                  source={{ uri: resolveFileUrl(data.previewUrl), cacheKey: `${data.id}-800` }}
                  placeholder={{
                    uri: resolveFileUrl(data.thumbnailUrl ?? ''),
                    cacheKey: `${data.id}-200`,
                  }}
                  style={{ width: '100%', aspectRatio: 3 / 4 }}
                  contentFit="contain"
                  transition={200}
                  accessibilityLabel={data.title}
                />
              </View>
            ) : (
              <SurfaceCard className="items-center gap-3 py-8">
                <FileText size={44} color={colors.danger} />
                <BanglaText variant="body-strong">PDF ফাইল</BanglaText>
              </SurfaceCard>
            )}

            <ActionButton
              label={data.previewUrl ? 'পূর্ণ আকারে খুলুন' : 'PDF খুলুন'}
              icon={ExternalLink}
              variant="secondary"
              onPress={() => void WebBrowser.openBrowserAsync(resolveFileUrl(data.fileUrl))}
            />

            {editing ? (
              <SurfaceCard className="gap-4">
                <LabeledTextInput
                  label="শিরোনাম"
                  value={title}
                  onChangeText={setTitle}
                  maxLength={120}
                />
                <ChipSelect label="ধরন" options={TYPE_OPTIONS} value={type} onChange={setType} />
                <DateField
                  label="রিপোর্টের তারিখ"
                  value={reportDate}
                  onChange={setReportDate}
                  maximumDate={new Date()}
                  clearable
                />
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <ActionButton
                      label="বাতিল"
                      variant="outline"
                      size="sm"
                      onPress={() => setEditing(false)}
                    />
                  </View>
                  <View className="flex-1">
                    <ActionButton
                      label="সেভ করুন"
                      size="sm"
                      loading={update.isPending}
                      disabled={!title.trim()}
                      onPress={() =>
                        update.mutate(
                          { title: title.trim(), type, reportDate },
                          {
                            onSuccess: () => {
                              setEditing(false);
                              showToast('সেভ হয়েছে');
                            },
                            onError: (error) => showToast(apiErrorMessage(error)),
                          }
                        )
                      }
                    />
                  </View>
                </View>
              </SurfaceCard>
            ) : (
              <SurfaceCard className="gap-2">
                <Detail
                  label="রিপোর্টের তারিখ"
                  value={data.reportDate ? formatDate(data.reportDate) : 'দেওয়া হয়নি'}
                />
                <Detail label="যোগ করা হয়েছে" value={formatDateTime(data.createdAt)} />
                <Detail label="আকার" value={formatFileSize(data.sizeBytes)} />
              </SurfaceCard>
            )}

            {editable ? (
              <ActionButton
                label="ফাইলটি মুছে ফেলুন"
                icon={Trash2}
                variant="danger"
                size="sm"
                loading={remove.isPending}
                onPress={async () => {
                  const ok = await confirmAction({
                    title: 'ফাইলটি মুছবেন?',
                    message: `"${data.title}" আর ফেরানো যাবে না।`,
                    confirmLabel: 'মুছে ফেলুন',
                    destructive: true,
                  });
                  if (!ok) return;
                  remove.mutate(data.id, {
                    onSuccess: () => {
                      showToast('ফাইল মুছে ফেলা হয়েছে');
                      router.back();
                    },
                    onError: (error) => showToast(apiErrorMessage(error)),
                  });
                }}
              />
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between gap-3">
      <BanglaText variant="label" className="font-bangla text-ink-muted">
        {label}
      </BanglaText>
      <BanglaText variant="label" className="flex-1 text-right">
        {value}
      </BanglaText>
    </View>
  );
}
