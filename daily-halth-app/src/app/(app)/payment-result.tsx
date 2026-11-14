import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { colors } from '@/theme/design-tokens';

/**
 * `dailyhealth://payment-result?paymentId=…&status=…` normally closes the
 * in-app browser and never renders. When it opens the app from outside
 * (the payer used another browser), go to the receipt.
 */
export default function PaymentResultScreen() {
  const { paymentId } = useLocalSearchParams<{ paymentId?: string; status?: string }>();
  useEffect(() => {
    if (paymentId) {
      router.replace({ pathname: '/payments/[paymentId]', params: { paymentId } });
    } else {
      router.replace('/appointments');
    }
  }, [paymentId]);
  return (
    <View className="flex-1 items-center justify-center bg-surface">
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
