import { router, useLocalSearchParams } from 'expo-router';
import { Flower2, Lock, MessagesSquare, PenSquare, Search, ShieldCheck, Hourglass } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { apiErrorMessage } from '@/api/api-error-messages';
import { PostCard } from '@/components/community/post-card';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { FormErrorBanner } from '@/components/ui/form-error-banner';
import { IconBadge } from '@/components/ui/icon-badge';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { openLogin, useIsGuest } from '@/features/auth/guest-access';
import { useCommunityAccess, useForumCategories, useJoinWomen, usePosts } from '@/features/community/use-community';
import { showToast } from '@/lib/user-feedback';
import type { CommunityAccessResponse, CommunitySpace } from '@/shared-contracts/community.contract';
import { colors } from '@/theme/design-tokens';

type Filter = 'ALL' | 'DOCTOR' | 'MINE' | string;

/** What a non-member sees in the women's space: how to join, or where the request stands. */
function WomenGate({ access }: { access: CommunityAccessResponse | undefined }) {
  const isGuest = useIsGuest();
  const join = useJoinWomen();
  const [error, setError] = useState<string | null>(null);
  const women = access?.women;

  const text = (() => {
    if (isGuest) return 'নারী কমিউনিটিতে যোগ দিতে আগে লগইন করুন।';
    if (!women) return '';
    if (women.status === 'PENDING') return 'আপনার অনুরোধ পাঠানো হয়েছে। একজন মডারেটর দেখে অনুমোদন দিলে এখানে লেখা ও পড়া যাবে। সাধারণত এক দিনের মধ্যে।';
    if (women.status === 'REMOVED') return 'আপনাকে এই কমিউনিটি থেকে সরানো হয়েছে।';
    if (women.blockedReason === 'NO_OWN_PROFILE') return 'যোগ দিতে আগে নিজের স্বাস্থ্য প্রোফাইল তৈরি করুন।';
    if (women.blockedReason === 'NOT_FEMALE') return 'এই কমিউনিটি শুধু নারীদের জন্য। আপনার নিজের প্রোফাইলে লিঙ্গ নারী দেওয়া থাকলে যোগ দেওয়ার অনুরোধ পাঠাতে পারবেন।';
    if (women.blockedReason === 'BANNED') return 'কমিউনিটির নিয়ম ভাঙার কারণে আপনি এখানে যোগ দিতে পারবেন না।';
    if (women.status === 'REJECTED') return 'আগের অনুরোধটি গ্রহণ করা যায়নি। চাইলে আবার পাঠাতে পারেন।';
    return 'শুধু নারীদের জন্য একটি নিরাপদ জায়গা: পিরিয়ড, গর্ভাবস্থা, সম্পর্ক বা মনের কথা খোলাখুলি জিজ্ঞেস করুন। এখানের পোস্ট বাইরের কেউ দেখেন না। যোগ দিতে অনুরোধ পাঠান, একজন মডারেটর একবার অনুমোদন দেবেন।';
  })();

  return (
    <View className="gap-4 rounded-3xl border border-rose/30 bg-rose-soft p-5">
      <IconBadge icon={women?.status === 'PENDING' ? Hourglass : Lock} tone="neutral" />
      <BanglaText variant="heading">নারী কমিউনিটি</BanglaText>
      <BanglaText variant="body">{text}</BanglaText>
      {women?.note ? <BanglaText variant="caption">মডারেটরের নোট: {women.note}</BanglaText> : null}
      <FormErrorBanner message={error} />
      {isGuest ? (
        <ActionButton label="লগইন করুন" onPress={openLogin} />
      ) : women?.canRequest ? (
        <ActionButton
          label="যোগ দিতে চাই"
          icon={Flower2}
          loading={join.isPending}
          onPress={() =>
            join.mutate(undefined, {
              onSuccess: () => showToast('অনুরোধ পাঠানো হয়েছে'),
              onError: (e) => setError(apiErrorMessage(e)),
            })
          }
        />
      ) : women?.blockedReason === 'NO_OWN_PROFILE' ? (
        <ActionButton
          label="নিজের প্রোফাইল তৈরি করুন"
          variant="outline"
          onPress={() => router.push({ pathname: '/profiles/new', params: { relation: 'SELF' } })}
        />
      ) : null}
    </View>
  );
}

/** Community: the common space for everyone, and the closed women's space. */
export default function CommunityTab() {
  const params = useLocalSearchParams<{ space?: string }>();
  const [space, setSpace] = useState<CommunitySpace>(params.space === 'WOMEN' ? 'WOMEN' : 'COMMON');
  const [spaceParam, setSpaceParam] = useState(params.space);
  if (params.space !== spaceParam) {
    setSpaceParam(params.space);
    if (params.space === 'WOMEN' || params.space === 'COMMON') setSpace(params.space);
  }
  const [filter, setFilter] = useState<Filter>('ALL');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text]);

  const isGuest = useIsGuest();
  const access = useCommunityAccess();
  const categories = useForumCategories();
  const isMember = access.data?.women.status === 'APPROVED';
  const canRead = space === 'COMMON' || isMember;
  const spaceCategories = (categories.data ?? []).filter((c) => c.space === space);
  const posts = usePosts(
    {
      space,
      q: q || undefined,
      categoryId: spaceCategories.some((c) => c.id === filter) ? filter : undefined,
      answeredByDoctor: filter === 'DOCTOR' || undefined,
      mine: filter === 'MINE' || undefined,
    },
    canRead
  );
  const list = posts.data?.pages.flatMap((p) => p.data) ?? [];
  const rose = space === 'WOMEN';

  return (
    <ScrollScreen
      inTabs
      onRefresh={() => Promise.all([posts.refetch(), access.refetch()])}
      header={
        <View className="flex-row items-center justify-between gap-3 px-5 pb-2 pt-2">
          <View className="flex-1">
            <BanglaText variant="title">কমিউনিটি</BanglaText>
            <BanglaText variant="caption" numberOfLines={1}>
              প্রশ্ন করুন, অভিজ্ঞতা ভাগ করুন, ডাক্তারের উত্তর পান
            </BanglaText>
          </View>
          {canRead && !isGuest && access.data?.canPost ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="প্রশ্ন করুন"
              onPress={() => router.push({ pathname: '/community/new', params: { space } })}
              className={`min-h-11 flex-row items-center gap-1.5 rounded-full px-4 ${rose ? 'bg-rose' : 'bg-primary active:bg-primary-700'}`}>
              <PenSquare size={18} color={colors.white} />
              <BanglaText variant="label" className="font-bangla-semibold text-white">
                প্রশ্ন করুন
              </BanglaText>
            </Pressable>
          ) : null}
        </View>
      }>
      <View className="flex-row rounded-2xl bg-line/50 p-1">
        {(['COMMON', 'WOMEN'] as const).map((s) => (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: space === s }}
            onPress={() => (setSpace(s), setFilter('ALL'))}
            className={`min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl ${space === s ? 'bg-surface-card' : ''}`}>
            {s === 'WOMEN' ? <Flower2 size={16} color={space === s ? colors.rose : colors.inkMuted} /> : <MessagesSquare size={16} color={space === s ? colors.primary : colors.inkMuted} />}
            <BanglaText
              variant="label"
              className={space === s ? `font-bangla-semibold ${s === 'WOMEN' ? 'text-rose' : 'text-primary'}` : 'text-ink-muted'}>
              {s === 'COMMON' ? 'সাধারণ' : 'নারী কমিউনিটি'}
            </BanglaText>
          </Pressable>
        ))}
      </View>

      {!canRead ? (
        <WomenGate access={access.data} />
      ) : (
        <>
          {rose ? (
            <View className="flex-row items-center gap-2 rounded-2xl bg-rose-soft px-4 py-3">
              <ShieldCheck size={18} color={colors.rose} />
              <BanglaText variant="caption" className="flex-1 text-ink">
                এখানের পোস্ট শুধু নারী কমিউনিটির সদস্যরা দেখেন। চাইলে নাম গোপন রেখে লিখুন।
              </BanglaText>
            </View>
          ) : null}
          <View className="min-h-[50px] flex-row items-center gap-3 rounded-2xl border border-line bg-surface-card px-4">
            <Search size={20} color={colors.inkMuted} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="প্রশ্ন খুঁজুন"
              placeholderTextColor={colors.inkSubtle}
              accessibilityLabel="প্রশ্ন খুঁজুন"
              className="min-h-[50px] flex-1 font-bangla text-[16px] text-ink"
            />
          </View>
          <ChipSelect<Filter>
            scroll
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: 'সব' },
              { value: 'DOCTOR', label: 'ডাক্তারের উত্তর আছে' },
              ...(isGuest ? [] : [{ value: 'MINE', label: 'আমার প্রশ্ন' }]),
              ...spaceCategories.map((c) => ({ value: c.id, label: c.nameBn })),
            ]}
          />
          {access.data?.bannedReason ? (
            <FormErrorBanner message={`কমিউনিটিতে লেখা আপনার জন্য বন্ধ: ${access.data.bannedReason}`} />
          ) : null}
          {posts.isLoading ? (
            <LoadingList rows={3} rowClassName="h-40" />
          ) : posts.isError ? (
            <ErrorState error={posts.error} onRetry={() => void posts.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title={q ? 'কিছু পাওয়া যায়নি' : 'এখনো কোনো প্রশ্ন নেই'}
              message={isGuest ? 'প্রশ্ন করতে লগইন করুন।' : 'প্রথম প্রশ্নটি আপনিই করুন।'}
              actionLabel={isGuest ? 'লগইন করুন' : 'প্রশ্ন করুন'}
              onAction={isGuest ? openLogin : () => router.push({ pathname: '/community/new', params: { space } })}
            />
          ) : (
            <>
              {list.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
              {posts.hasNextPage ? (
                <ActionButton label="আরও দেখুন" variant="outline" loading={posts.isFetchingNextPage} onPress={() => void posts.fetchNextPage()} />
              ) : null}
            </>
          )}
          {isGuest ? (
            <ActionButton label="প্রশ্ন করতে লগইন করুন" variant="outline" onPress={openLogin} />
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}
