import { Image } from 'expo-image';
import { FileText, Trash2, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { StatusPill } from '@/components/ui/status-pill';
import { SurfaceCard } from '@/components/ui/surface-card';
import { DOC_STATUS_LABEL, DOC_TYPE_LABEL } from '@/features/provider/provider-display';
import { useMyProvider, useProviderProfileActions } from '@/features/provider/use-provider';
import { choosePhotoSource, pickDocument, pickPhoto } from '@/lib/pick-upload-file';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { VerificationDocType } from '@/shared-contracts/doctors.contract';
import { colors } from '@/theme/design-tokens';

const TYPES = (Object.keys(DOC_TYPE_LABEL) as VerificationDocType[]).map((value) => ({
  value,
  label: DOC_TYPE_LABEL[value],
}));

/** Verification papers: BMDC certificate, NID, degrees (photo or PDF, private). */
export default function ProviderDocumentsScreen() {
  const me = useMyProvider();
  const actions = useProviderProfileActions();
  const [docType, setDocType] = useState<VerificationDocType>('BMDC_CERT');
  const docs = me.data?.documents ?? [];

  function upload() {
    const send = (file: Awaited<ReturnType<typeof pickDocument>>) => {
      if (!file) return;
      actions.uploadDocument.mutate(
        { file, docType },
        {
          onSuccess: () => showToast('জমা হয়েছে; অ্যাডমিন দেখবেন'),
          onError: (e) => showToast(apiErrorMessage(e)),
        }
      );
    };
    choosePhotoSource((source) => void pickPhoto(source).then(send), {
      label: 'PDF ফাইল বেছে নিন',
      onPress: () => void pickDocument().then(send),
    });
  }

  return (
    <ScrollScreen
      header={<ScreenHeader title="যাচাইয়ের কাগজপত্র" fallbackHref="/provider" />}
      onRefresh={() => me.refetch()}>
      {me.isLoading ? (
        <SkeletonBlock className="h-64" />
      ) : me.isError || !me.data ? (
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      ) : (
        <>
          <SurfaceCard className="gap-3">
            <BanglaText variant="body-strong">নতুন কাগজ জমা দিন</BanglaText>
            <ChipSelect options={TYPES} value={docType} onChange={setDocType} />
            <ActionButton
              label="ছবি তুলুন বা ফাইল দিন"
              icon={Upload}
              loading={actions.uploadDocument.isPending}
              onPress={upload}
            />
            <BanglaText variant="caption">ফাইল গোপন থাকে; শুধু অ্যাডমিন যাচাইয়ের সময় দেখেন।</BanglaText>
          </SurfaceCard>

          {docs.length === 0 ? (
            <BanglaText variant="caption" className="text-center">
              এখনো কোনো কাগজ জমা দেননি।
            </BanglaText>
          ) : (
            docs.map((d) => (
              <SurfaceCard key={d.id} className="flex-row items-center gap-3">
                {d.thumbnailUrl ? (
                  <Image source={{ uri: d.thumbnailUrl }} style={{ width: 56, height: 56, borderRadius: 12 }} contentFit="cover" />
                ) : (
                  <View className="h-14 w-14 items-center justify-center rounded-xl bg-primary-100">
                    <FileText size={24} color={colors.primary} />
                  </View>
                )}
                <View className="flex-1 gap-1">
                  <BanglaText variant="body-strong">{DOC_TYPE_LABEL[d.docType]}</BanglaText>
                  <StatusPill
                    label={DOC_STATUS_LABEL[d.status]}
                    tone={d.status === 'APPROVED' ? 'success' : d.status === 'REJECTED' ? 'danger' : 'warning'}
                  />
                </View>
                {d.status !== 'APPROVED' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="মুছে ফেলুন"
                    hitSlop={8}
                    onPress={() =>
                      void confirmAction({
                        title: 'কাগজটি মুছবেন?',
                        message: DOC_TYPE_LABEL[d.docType],
                        confirmLabel: 'মুছুন',
                        destructive: true,
                      }).then((ok) => ok && actions.removeDocument.mutate(d.id, { onError: (e) => showToast(apiErrorMessage(e)) }))
                    }
                    className="h-11 w-11 items-center justify-center rounded-full active:bg-danger-soft">
                    <Trash2 size={20} color={colors.danger} />
                  </Pressable>
                ) : null}
              </SurfaceCard>
            ))
          )}
        </>
      )}
    </ScrollScreen>
  );
}
