import { router } from 'expo-router';
import { UserRoundPlus, UsersRound } from 'lucide-react-native';
import { View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { IconBadge } from '@/components/ui/icon-badge';
import { useSignOutMutation } from '@/features/auth/use-auth-mutations';

/** Guests can look around but cannot keep health data (CLAUDE.md §1). */
export function GuestNotice({ what }: { what: string }) {
  const signOut = useSignOutMutation();
  return (
    <View className="gap-4 overflow-hidden rounded-3xl bg-primary p-5">
      <View
        pointerEvents="none"
        className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary-500"
      />
      <IconBadge icon={UserRoundPlus} tone="neutral" />
      <View className="gap-1">
        <BanglaText variant="heading" className="text-white">
          অ্যাকাউন্ট খুলে শুরু করুন
        </BanglaText>
        <BanglaText variant="label" className="font-bangla text-primary-100">
          {what} রাখতে একটি অ্যাকাউন্ট লাগবে। ইমেইল দিয়ে এক মিনিটেই খোলা যায়।
        </BanglaText>
      </View>
      <ActionButton
        label="অ্যাকাউন্ট খুলুন বা লগইন করুন"
        variant="secondary"
        loading={signOut.isPending}
        onPress={() => signOut.mutate()}
      />
    </View>
  );
}

/** A new account has no profile yet: the first step is the user's own. */
export function CreateOwnProfileCard() {
  return (
    <View className="gap-4 rounded-3xl border border-primary-200 bg-primary-50 p-5">
      <IconBadge icon={UsersRound} />
      <View className="gap-1">
        <BanglaText variant="heading">আপনার স্বাস্থ্য প্রোফাইল তৈরি করুন</BanglaText>
        <BanglaText variant="label" className="font-bangla text-ink-muted">
          নাম, বয়স আর রক্তের গ্রুপ দিন। পরে বাবা-মা বা সন্তানের প্রোফাইলও যোগ করতে পারবেন।
        </BanglaText>
      </View>
      <View className="gap-2">
        <ActionButton
          label="নিজের প্রোফাইল তৈরি করুন"
          onPress={() => router.push({ pathname: '/profiles/new', params: { relation: 'SELF' } })}
        />
        <ActionButton
          label="পরিবারের কারো প্রোফাইল তৈরি করুন"
          variant="ghost"
          size="sm"
          onPress={() => router.push('/profiles/new')}
        />
      </View>
    </View>
  );
}
