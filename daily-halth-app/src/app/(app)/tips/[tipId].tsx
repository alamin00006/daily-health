import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { ListRow } from '@/components/ui/list-row';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { TIP_CATEGORY_LABELS } from '@/features/content/tip-display';
import { useHealthTip } from '@/features/content/use-health-tips';
import { providerTitle } from '@/features/doctors/doctor-display';
import { formatDateTime } from '@/lib/bangla-format';

/** One health tip, with the doctor who wrote it. */
export default function HealthTipScreen() {
  const { tipId } = useLocalSearchParams<{ tipId: string }>();
  const query = useHealthTip(tipId);
  const tip = query.data;
  const author = tip?.author ?? null;

  return (
    <ScrollScreen header={<ScreenHeader title="স্বাস্থ্য টিপস" fallbackHref="/tips" />}>
      {query.isLoading ? (
        <SkeletonBlock className="h-96" />
      ) : query.isError || !tip ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {tip.imageUrl ? (
            <Image
              source={tip.imageUrl}
              style={{ width: '100%', aspectRatio: 16 / 10, borderRadius: 24 }}
              contentFit="cover"
              transition={150}
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <View className="gap-1">
            <BanglaText variant="caption" className="text-primary">
              {TIP_CATEGORY_LABELS[tip.category]}
              {tip.publishedAt ? ` · ${formatDateTime(tip.publishedAt)}` : ''}
            </BanglaText>
            <BanglaText variant="title">{tip.title}</BanglaText>
          </View>
          <BanglaText className="text-[17px] leading-[30px]">{tip.body}</BanglaText>
          {author ? (
            <SurfaceCard flush>
              <ListRow
                leading={<ProfileAvatar name={author.displayName} photoUrl={author.avatarThumbnailUrl} size="sm" />}
                title={providerTitle(author.type, author.displayName)}
                subtitle={author.designation ?? 'লেখক'}
                onPress={() => router.push({ pathname: '/doctors/[providerId]', params: { providerId: author.id } })}
              />
            </SurfaceCard>
          ) : null}
          <BanglaText variant="caption" className="px-1">
            এটি সাধারণ স্বাস্থ্য তথ্য, চিকিৎসকের পরামর্শের বিকল্প নয়।
          </BanglaText>
        </>
      )}
    </ScrollScreen>
  );
}
