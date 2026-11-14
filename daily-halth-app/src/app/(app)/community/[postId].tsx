import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Flag, Heart, Pin, Send, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { AuthorLine } from '@/components/community/post-card';
import { BanglaText } from '@/components/ui/bangla-text';
import { FormErrorBanner, InlineAlert } from '@/components/ui/form-error-banner';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, LoadingList } from '@/components/ui/state-views';
import { SwitchRow } from '@/components/ui/switch-row';
import { openLogin, useIsGuest } from '@/features/auth/guest-access';
import { useAnswers, useCommunityAccess, usePost, usePostActions } from '@/features/community/use-community';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { confirmAction, showToast } from '@/lib/user-feedback';
import type { ReportReason, ReportTarget } from '@/shared-contracts/community.contract';
import { colors } from '@/theme/design-tokens';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'MISINFO', label: 'ভুল বা ক্ষতিকর তথ্য' },
  { value: 'ABUSE', label: 'গালিগালাজ বা হয়রানি' },
  { value: 'SPAM', label: 'স্প্যাম' },
  { value: 'ADS', label: 'বিজ্ঞাপন' },
  { value: 'PRIVACY', label: 'কারো ব্যক্তিগত তথ্য' },
];

function LikeButton({ liked, count, onPress }: { liked: boolean; count: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'পছন্দ তুলে নিন' : 'পছন্দ করুন'} onPress={onPress} className="min-h-11 flex-row items-center gap-1.5 pr-2">
      <Heart size={18} color={liked ? colors.rose : colors.inkMuted} fill={liked ? colors.rose : 'transparent'} />
      <BanglaText variant="label" className={liked ? 'text-rose' : 'text-ink-muted'}>
        {toBanglaDigits(count)}
      </BanglaText>
    </Pressable>
  );
}

/** One question with its answers; members answer, like and report. */
export default function PostScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const post = usePost(postId);
  const answers = useAnswers(postId);
  const access = useCommunityAccess();
  const actions = usePostActions(postId);
  const isGuest = useIsGuest();
  const [body, setBody] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = post.data;
  const list = answers.data?.pages.flatMap((pg) => pg.data) ?? [];
  const canWrite = !isGuest && Boolean(access.data?.canPost) && p?.status === 'PUBLISHED';

  const like = (targetType: ReportTarget, targetId: string, liked: boolean) => {
    if (isGuest) return openLogin();
    actions.like.mutate({ targetType, targetId, liked: !liked }, { onError: (e) => showToast(apiErrorMessage(e)) });
  };

  const report = (targetType: ReportTarget, targetId: string) => {
    if (isGuest) return openLogin();
    Alert.alert('কেন রিপোর্ট করছেন?', 'মডারেটর দেখে ব্যবস্থা নেবেন। কে রিপোর্ট করেছেন তা লেখক জানবেন না।', [
      ...REASONS.map((r) => ({
        text: r.label,
        onPress: () =>
          actions.report.mutate(
            { targetType, targetId, reason: r.value },
            { onSuccess: () => showToast('রিপোর্ট পাঠানো হয়েছে'), onError: (e) => showToast(apiErrorMessage(e)) }
          ),
      })),
      { text: 'বাতিল', style: 'cancel' as const },
    ]);
  };

  const send = () => {
    if (body.trim().length < 2) return;
    setError(null);
    actions.answer.mutate(
      { body: body.trim(), isAnonymous: anonymous },
      { onSuccess: () => (setBody(''), showToast('উত্তর দেওয়া হয়েছে')), onError: (e) => setError(apiErrorMessage(e)) }
    );
  };

  return (
    <ScrollScreen
      header={<ScreenHeader title={p?.category.nameBn ?? 'প্রশ্ন'} fallbackHref="/community" />}
      onRefresh={() => Promise.all([post.refetch(), answers.refetch()])}
      footer={
        canWrite ? (
          <View className="gap-2">
            <FormErrorBanner message={error} />
            <View className="flex-row items-end gap-2">
              <TextInput
                value={body}
                onChangeText={setBody}
                placeholder="উত্তর বা অভিজ্ঞতা লিখুন"
                placeholderTextColor={colors.inkSubtle}
                multiline
                maxLength={3000}
                accessibilityLabel="উত্তর লিখুন"
                className="max-h-32 min-h-[48px] flex-1 rounded-2xl border border-line bg-surface-card px-4 py-3 font-bangla text-[16px] text-ink"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="পাঠান"
                disabled={actions.answer.isPending || body.trim().length < 2}
                onPress={send}
                className={`h-12 w-12 items-center justify-center rounded-full ${body.trim().length < 2 ? 'bg-line' : 'bg-primary'}`}>
                <Send size={20} color={colors.white} />
              </Pressable>
            </View>
            <SwitchRow title="নাম গোপন রাখুন" value={anonymous} onChange={setAnonymous} />
          </View>
        ) : isGuest ? (
          <Pressable accessibilityRole="button" onPress={openLogin} className="min-h-12 items-center justify-center rounded-2xl bg-primary">
            <BanglaText variant="body-strong" className="text-white">
              উত্তর দিতে লগইন করুন
            </BanglaText>
          </Pressable>
        ) : undefined
      }>
      {post.isLoading ? (
        <LoadingList rows={2} rowClassName="h-40" />
      ) : post.isError ? (
        <ErrorState error={post.error} onRetry={() => void post.refetch()} />
      ) : p ? (
        <>
          {p.status === 'HIDDEN' ? <InlineAlert tone="danger" message="মডারেটর এই পোস্টটি লুকিয়েছেন। শুধু আপনি দেখতে পাচ্ছেন।" /> : null}
          <AuthorLine author={p.author} at={p.createdAt} />
          <BanglaText variant="title">{p.title}</BanglaText>
          <BanglaText variant="body">{p.body}</BanglaText>
          {p.images.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {p.images.map((img) => (
                <Image key={img.id} source={img.url} style={{ width: 150, height: 150, borderRadius: 16 }} contentFit="cover" accessibilityLabel="পোস্টের ছবি" />
              ))}
            </View>
          ) : null}
          <View className="flex-row items-center gap-3 border-b border-line pb-2">
            <LikeButton liked={p.likedByMe} count={p.likeCount} onPress={() => like('POST', p.id, p.likedByMe)} />
            {p.author.isMe ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="পোস্ট মুছুন"
                onPress={async () => {
                  const ok = await confirmAction({ title: 'পোস্ট মুছবেন?', message: 'উত্তরগুলোও আর দেখা যাবে না।', confirmLabel: 'মুছুন', destructive: true });
                  if (ok) actions.removePost.mutate(undefined, { onSuccess: () => (showToast('মুছে ফেলা হয়েছে'), router.back()) });
                }}
                className="min-h-11 flex-row items-center gap-1">
                <Trash2 size={16} color={colors.danger} />
                <BanglaText variant="label" className="text-danger">মুছুন</BanglaText>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="রিপোর্ট করুন" onPress={() => report('POST', p.id)} className="min-h-11 flex-row items-center gap-1">
                <Flag size={16} color={colors.inkMuted} />
                <BanglaText variant="label" className="text-ink-muted">রিপোর্ট</BanglaText>
              </Pressable>
            )}
          </View>

          <BanglaText variant="heading">
            {p.answerCount > 0 ? `${toBanglaDigits(p.answerCount)}টি উত্তর` : 'এখনো কোনো উত্তর নেই'}
          </BanglaText>
          {answers.isLoading ? (
            <LoadingList rows={2} rowClassName="h-24" />
          ) : (
            list.map((a) => (
              <View
                key={a.id}
                className={`gap-2 rounded-2xl p-4 ${a.author.provider ? 'border border-primary/30 bg-primary-50' : 'bg-surface-card'}`}>
                {a.isHighlighted ? (
                  <View className="flex-row items-center gap-1">
                    <Pin size={14} color={colors.primary} />
                    <BanglaText variant="caption" className="text-primary">মডারেটরের বাছাই করা উত্তর</BanglaText>
                  </View>
                ) : null}
                <AuthorLine author={a.author} at={a.createdAt} />
                <BanglaText variant="body">{a.body}</BanglaText>
                <View className="flex-row items-center gap-3">
                  <LikeButton liked={a.likedByMe} count={a.likeCount} onPress={() => like('ANSWER', a.id, a.likedByMe)} />
                  {a.author.isMe ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="উত্তর মুছুন"
                      onPress={async () => {
                        const ok = await confirmAction({ title: 'উত্তর মুছবেন?', message: '', confirmLabel: 'মুছুন', destructive: true });
                        if (ok) actions.removeAnswer.mutate(a.id);
                      }}
                      className="min-h-11 justify-center">
                      <BanglaText variant="caption" className="text-danger">মুছুন</BanglaText>
                    </Pressable>
                  ) : (
                    <Pressable accessibilityRole="button" accessibilityLabel="উত্তর রিপোর্ট করুন" onPress={() => report('ANSWER', a.id)} className="min-h-11 justify-center">
                      <BanglaText variant="caption">রিপোর্ট</BanglaText>
                    </Pressable>
                  )}
                </View>
              </View>
            ))
          )}
          {answers.hasNextPage ? (
            <Pressable accessibilityRole="button" onPress={() => void answers.fetchNextPage()} className="min-h-11 items-center justify-center">
              <BanglaText variant="label" className="text-primary">আরও উত্তর দেখুন</BanglaText>
            </Pressable>
          ) : null}
          <BanglaText variant="caption" className="text-center">
            কমিউনিটির উত্তর ডাক্তারের পরামর্শের বিকল্প নয়। জরুরি হলে আকস্মিক সেবা ব্যবহার করুন।
          </BanglaText>
        </>
      ) : null}
    </ScrollScreen>
  );
}
