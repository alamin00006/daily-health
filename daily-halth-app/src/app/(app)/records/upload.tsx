import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Camera, FileText, Images, RefreshCw, Upload } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { DateField } from '@/components/ui/date-time-field';
import { FormErrorBanner, InlineAlert } from '@/components/ui/form-error-banner';
import { IconBadge } from '@/components/ui/icon-badge';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenContainer } from '@/components/ui/screen-container';
import { ScreenHeader } from '@/components/ui/screen-header';
import { apiErrorMessage } from '@/api/api-error-messages';
import type { UploadFile } from '@/api/http-client';
import { FILE_TYPE_LABELS } from '@/features/health/health-display';
import { useActiveProfile } from '@/features/profiles/use-profiles';
import { useUploadMedicalFile } from '@/features/records/use-records';
import { pickDocument, pickPhoto } from '@/lib/pick-upload-file';
import { showToast } from '@/lib/user-feedback';
import type { MedicalFileType } from '@/shared-contracts/records.contract';
import { colors } from '@/theme/design-tokens';

const TYPE_OPTIONS = (Object.keys(FILE_TYPE_LABELS) as MedicalFileType[]).map((value) => ({
  value,
  label: FILE_TYPE_LABELS[value],
}));

function SourceButton({
  icon,
  label,
  onPress,
}: {
  icon: typeof Camera;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-1 items-center gap-2 rounded-3xl border border-line/70 bg-surface-card px-2 py-5 active:bg-primary-50">
      <IconBadge icon={icon} />
      <BanglaText variant="label" className="text-center font-bangla-semibold">
        {label}
      </BanglaText>
    </Pressable>
  );
}

export default function UploadRecordScreen() {
  const { profile } = useActiveProfile();
  const upload = useUploadMedicalFile(profile?.id ?? '');
  const [file, setFile] = useState<UploadFile | null>(null);
  const [type, setType] = useState<MedicalFileType>('LAB_REPORT');
  const [title, setTitle] = useState('');
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  const choose = async (source: 'camera' | 'library' | 'document') => {
    setPreparing(true);
    try {
      const picked = source === 'document' ? await pickDocument() : await pickPhoto(source);
      if (picked) {
        setFile(picked);
        if (picked.type === 'application/pdf' && !title)
          setTitle(picked.name.replace(/\.pdf$/i, ''));
      }
    } finally {
      setPreparing(false);
    }
  };

  const submit = () => {
    if (!file) return;
    upload.mutate(
      {
        file,
        fields: { type, title: title.trim() || FILE_TYPE_LABELS[type], reportDate },
      },
      {
        onSuccess: () => {
          showToast('ফাইল সেভ হয়েছে');
          router.back();
        },
      }
    );
  };

  return (
    <ScreenContainer
      header={
        <ScreenHeader
          title="নতুন ফাইল"
          subtitle={profile?.fullName}
          backIcon="close"
          fallbackHref="/records"
        />
      }
      footer={
        file ? (
          <ActionButton
            label="সেভ করুন"
            icon={Upload}
            loading={upload.isPending}
            onPress={submit}
          />
        ) : undefined
      }>
      {!file ? (
        <>
          <InlineAlert message="রিপোর্টটি সমান জায়গায় রেখে আলোতে ছবি তুলুন, যাতে লেখা পরিষ্কার পড়া যায়।" />
          <View className="flex-row gap-3">
            <SourceButton icon={Camera} label="ছবি তুলুন" onPress={() => void choose('camera')} />
            <SourceButton icon={Images} label="গ্যালারি" onPress={() => void choose('library')} />
            <SourceButton
              icon={FileText}
              label="PDF ফাইল"
              onPress={() => void choose('document')}
            />
          </View>
          {preparing ? (
            <BanglaText variant="caption" className="text-center">
              ছবি প্রস্তুত হচ্ছে…
            </BanglaText>
          ) : null}
        </>
      ) : (
        <>
          <View className="overflow-hidden rounded-3xl border border-line/70 bg-surface-card">
            {file.type.startsWith('image/') ? (
              <Image
                source={{ uri: file.uri }}
                style={{ width: '100%', height: 260 }}
                contentFit="contain"
              />
            ) : (
              <View className="h-40 items-center justify-center gap-2">
                <FileText size={40} color={colors.danger} />
                <BanglaText variant="label" numberOfLines={1} className="px-4">
                  {file.name}
                </BanglaText>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => setFile(null)}
              className="flex-row items-center justify-center gap-2 border-t border-line/60 py-3 active:bg-primary-50">
              <RefreshCw size={16} color={colors.primary} />
              <BanglaText variant="label" className="font-bangla-semibold text-primary">
                অন্য ফাইল বেছে নিন
              </BanglaText>
            </Pressable>
          </View>

          <ChipSelect
            label="কী ধরনের ফাইল?"
            options={TYPE_OPTIONS}
            value={type}
            onChange={setType}
          />
          <LabeledTextInput
            label="শিরোনাম"
            value={title}
            onChangeText={setTitle}
            placeholder={
              type === 'LAB_REPORT'
                ? 'যেমন: CBC রিপোর্ট'
                : type === 'PRESCRIPTION_SCAN'
                  ? 'যেমন: ডা. হাসানের প্রেসক্রিপশন'
                  : 'যেমন: বুকের এক্স-রে'
            }
            maxLength={120}
            helperText="খালি রাখলে ধরনের নামই শিরোনাম হবে।"
          />
          <DateField
            label="রিপোর্টের তারিখ (ঐচ্ছিক)"
            value={reportDate}
            onChange={setReportDate}
            maximumDate={new Date()}
            clearable
          />
          <FormErrorBanner message={upload.error ? apiErrorMessage(upload.error) : null} />
        </>
      )}
    </ScreenContainer>
  );
}
