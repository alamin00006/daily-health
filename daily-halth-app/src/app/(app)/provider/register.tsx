import { router } from 'expo-router';

import { ProviderProfileForm } from '@/components/provider/provider-profile-form';
import { BanglaText } from '@/components/ui/bangla-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { useProviderProfileActions } from '@/features/provider/use-provider';
import { showToast } from '@/lib/user-feedback';

/** A doctor, nutritionist or physio registers from the app (verified by an admin). */
export default function RegisterProviderScreen() {
  const { register } = useProviderProfileActions();
  return (
    <ScrollScreen header={<ScreenHeader title="সেবাদাতা হিসেবে নিবন্ধন" backIcon="close" fallbackHref="/provider" />}>
      <BanglaText variant="caption">
        নিবন্ধনের পর BMDC সনদের ছবি আর ফি দিলে অ্যাডমিন যাচাই করবেন। যাচাইয়ের পর রোগীরা আপনাকে খুঁজে পাবেন। আপনার
        নিজের আর পরিবারের রোগী প্রোফাইল আগের মতোই থাকবে।
      </BanglaText>
      <ProviderProfileForm
        submitting={register.isPending}
        error={register.error}
        onRegister={(body) =>
          register.mutate(body, {
            onSuccess: () => {
              showToast('নিবন্ধন হয়েছে। এবার কাগজপত্র দিন।');
              router.replace('/provider');
            },
          })
        }
      />
    </ScrollScreen>
  );
}
