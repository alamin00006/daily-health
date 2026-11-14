import { zodResolver } from '@hookform/resolvers/zod';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { ImagePlus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/api/api-error-messages';
import type { UploadFile } from '@/api/http-client';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { FormErrorBanner, InlineAlert } from '@/components/ui/form-error-banner';
import { LabeledTextInput } from '@/components/ui/labeled-text-input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { SwitchRow } from '@/components/ui/switch-row';
import { useCreatePost, useForumCategories } from '@/features/community/use-community';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { choosePhotoSource, pickPhoto } from '@/lib/pick-upload-file';
import { showToast } from '@/lib/user-feedback';
import { MAX_POST_IMAGES, type CommunitySpace } from '@/shared-contracts/community.contract';
import { colors } from '@/theme/design-tokens';

const postFormSchema = z.object({
  categoryId: z.string({ message: 'বিষয় বেছে নিন।' }).min(1, 'বিষয় বেছে নিন।'),
  title: z.string().trim().min(5, 'প্রশ্নটি অন্তত ৫ অক্ষরে লিখুন।').max(150, 'সর্বোচ্চ ১৫০ অক্ষর।'),
  body: z.string().trim().min(10, 'একটু বিস্তারিত লিখুন (অন্তত ১০ অক্ষর)।').max(5000, 'সর্বোচ্চ ৫,০০০ অক্ষর।'),
  isAnonymous: z.boolean(),
});
type PostFormValues = z.infer<typeof postFormSchema>;

/** Ask a question in the common or the women's community. */
export default function NewPostScreen() {
  const params = useLocalSearchParams<{ space?: string }>();
  const space: CommunitySpace = params.space === 'WOMEN' ? 'WOMEN' : 'COMMON';
  const categories = useForumCategories();
  const create = useCreatePost();
  const [images, setImages] = useState<UploadFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { control, handleSubmit } = useForm<PostFormValues>({
    resolver: zodResolver(postFormSchema),
    defaultValues: { categoryId: '', title: '', body: '', isAnonymous: space === 'WOMEN' },
  });

  const submit = handleSubmit((values) => {
    setError(null);
    create.mutate(
      { body: values, images },
      {
        onSuccess: (post) => {
          showToast('প্রশ্ন প্রকাশ হয়েছে');
          router.replace({ pathname: '/community/[postId]', params: { postId: post.id } });
        },
        onError: (e) => setError(apiErrorMessage(e)),
      }
    );
  });

  return (
    <ScrollScreen
      header={<ScreenHeader title={space === 'WOMEN' ? 'নারী কমিউনিটিতে প্রশ্ন' : 'প্রশ্ন করুন'} fallbackHref="/community" backIcon="close" />}
      footer={<ActionButton label="প্রকাশ করুন" loading={create.isPending} onPress={() => void submit()} />}>
      {space === 'WOMEN' ? (
        <InlineAlert message="এই প্রশ্ন শুধু নারী কমিউনিটির সদস্যরা দেখবেন।" />
      ) : (
        <InlineAlert message="প্রশ্নটি সবাই দেখবেন। নিজের বা অন্যের ফোন নম্বর, ঠিকানা লিখবেন না।" />
      )}
      <FormErrorBanner message={error} />
      <Controller
        control={control}
        name="categoryId"
        render={({ field, fieldState }) => (
          <ChipSelect
            label="বিষয়"
            value={field.value}
            onChange={field.onChange}
            errorText={fieldState.error?.message}
            options={(categories.data ?? []).filter((c) => c.space === space).map((c) => ({ value: c.id, label: c.nameBn }))}
          />
        )}
      />
      <Controller
        control={control}
        name="title"
        render={({ field, fieldState }) => (
          <LabeledTextInput
            label="প্রশ্ন"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="যেমন: সকালে প্রেশার বেশি থাকে কেন?"
            maxLength={150}
            errorText={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="body"
        render={({ field, fieldState }) => (
          <LabeledTextInput
            label="বিস্তারিত"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            placeholder="বয়স, কতদিন ধরে, কী কী লক্ষণ, কী ওষুধ খাচ্ছেন…"
            multiline
            maxLength={5000}
            errorText={fieldState.error?.message}
          />
        )}
      />
      <View className="gap-2">
        <BanglaText variant="label">ছবি (ঐচ্ছিক, সর্বোচ্চ {toBanglaDigits(MAX_POST_IMAGES)}টি)</BanglaText>
        <View className="flex-row flex-wrap gap-2">
          {images.map((img, i) => (
            <View key={img.uri} className="h-20 w-20 overflow-hidden rounded-xl">
              <Image source={img.uri} style={{ width: 80, height: 80 }} contentFit="cover" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ছবি সরান"
                onPress={() => setImages((list) => list.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 h-7 w-7 items-center justify-center rounded-full bg-ink/60">
                <X size={14} color={colors.white} />
              </Pressable>
            </View>
          ))}
          {images.length < MAX_POST_IMAGES ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ছবি যোগ করুন"
              onPress={() =>
                choosePhotoSource((source) =>
                  void pickPhoto(source).then((file) => {
                    if (file) setImages((list) => [...list, file].slice(0, MAX_POST_IMAGES));
                  })
                )
              }
              className="h-20 w-20 items-center justify-center rounded-xl border border-dashed border-line-strong">
              <ImagePlus size={24} color={colors.inkMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <Controller
        control={control}
        name="isAnonymous"
        render={({ field }) => (
          <SwitchRow
            title="নাম গোপন রাখুন"
            subtitle="অন্যরা আপনার নাম দেখবেন না, একটি ছদ্মনাম দেখবেন"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </ScrollScreen>
  );
}
