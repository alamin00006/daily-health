import { router } from 'expo-router';
import { BadgeCheck, Heart, ImageIcon, MessageCircle, UserRound } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { timeAgo } from '@/lib/bangla-format';
import { toBanglaDigits } from '@/lib/bangla-digits';
import type { CommunityAuthor, PostSummaryResponse } from '@/shared-contracts/community.contract';
import { colors } from '@/theme/design-tokens';

/** "ডা. মাহবুবুর রহমান ✓" or "বেনামী সদস্য ৪৮২১", with a small avatar. */
export function AuthorLine({ author, at }: { author: CommunityAuthor; at: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className={`h-8 w-8 items-center justify-center rounded-full ${author.provider ? 'bg-primary-100' : 'bg-line/60'}`}>
        <UserRound size={16} color={author.provider ? colors.primary : colors.inkMuted} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-1">
          <BanglaText variant="label" numberOfLines={1} className="font-bangla-semibold">
            {author.displayName}
            {author.isMe ? ' (আপনি)' : ''}
          </BanglaText>
          {author.provider ? <BadgeCheck size={15} color={colors.primary} /> : null}
        </View>
        <BanglaText variant="caption" className="text-[12px] leading-[17px]">
          {author.provider ? `যাচাই করা ${author.provider.type === 'DOCTOR' ? 'ডাক্তার' : 'সেবাদাতা'} · ` : ''}
          {timeAgo(at)}
        </BanglaText>
      </View>
    </View>
  );
}

/** A post in the feed: category, title, excerpt, counts; opens the post. */
export function PostCard({ post }: { post: PostSummaryResponse }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={post.title}
      onPress={() => router.push({ pathname: '/community/[postId]', params: { postId: post.id } })}
      className="gap-2 rounded-3xl border border-line/70 bg-surface-card p-4 active:bg-primary-50">
      <AuthorLine author={post.author} at={post.createdAt} />
      <View className="self-start rounded-full bg-primary-50 px-2.5 py-0.5">
        <BanglaText variant="caption" className="text-[12px] text-primary">
          {post.category.nameBn}
        </BanglaText>
      </View>
      <BanglaText variant="body-strong">{post.title}</BanglaText>
      <BanglaText variant="body" numberOfLines={3} className="text-ink-muted">
        {post.excerpt}
      </BanglaText>
      <View className="flex-row items-center gap-4 pt-1">
        <View className="flex-row items-center gap-1">
          <Heart size={16} color={post.likedByMe ? colors.rose : colors.inkMuted} fill={post.likedByMe ? colors.rose : 'transparent'} />
          <BanglaText variant="caption">{toBanglaDigits(post.likeCount)}</BanglaText>
        </View>
        <View className="flex-row items-center gap-1">
          <MessageCircle size={16} color={colors.inkMuted} />
          <BanglaText variant="caption">{toBanglaDigits(post.answerCount)}টি উত্তর</BanglaText>
        </View>
        {post.doctorAnswerCount > 0 ? (
          <View className="flex-row items-center gap-1">
            <BadgeCheck size={16} color={colors.primary} />
            <BanglaText variant="caption" className="text-primary">
              ডাক্তারের উত্তর
            </BanglaText>
          </View>
        ) : null}
        {post.imageCount > 0 ? <ImageIcon size={16} color={colors.inkMuted} /> : null}
      </View>
    </Pressable>
  );
}
