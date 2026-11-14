import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Package, ShoppingCart, Trash2 } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { QtyStepper } from '@/components/shop/product-card';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { taka } from '@/features/doctors/doctor-display';
import { useAddToCart } from '@/features/shop/use-add-to-cart';
import { useCart } from '@/features/shop/use-shop';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { colors } from '@/theme/design-tokens';

/** The cart: change amounts, see savings, go to checkout. */
export default function CartScreen() {
  const cart = useCart();
  const add = useAddToCart();
  const data = cart.data;
  const blocked = data?.items.some((i) => i.maxQty === 0 || i.qty > i.maxQty) ?? false;

  return (
    <ScrollScreen
      onRefresh={() => cart.refetch()}
      header={<ScreenHeader title="কার্ট" fallbackHref="/shop" />}
      footer={
        data && data.items.length > 0 ? (
          <View className="gap-2">
            <View className="flex-row justify-between">
              <BanglaText variant="body">সাবটোটাল ({toBanglaDigits(data.itemCount)}টি)</BanglaText>
              <BanglaText variant="body-strong">{taka(data.subtotal)}</BanglaText>
            </View>
            <ActionButton
              label="অর্ডার করতে এগিয়ে যান"
              disabled={blocked}
              onPress={() => router.push('/shop/checkout')}
            />
          </View>
        ) : undefined
      }>
      {cart.isLoading ? (
        <LoadingList rows={3} rowClassName="h-28" />
      ) : cart.isError ? (
        <ErrorState error={cart.error} onRetry={() => void cart.refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="কার্ট খালি"
          message="হেলথস্টোর থেকে ওষুধ বা পণ্য যোগ করুন।"
          actionLabel="কেনাকাটা করুন"
          onAction={() => router.replace('/shop')}
        />
      ) : (
        <>
          {blocked ? <InlineAlert tone="danger" message="লাল চিহ্নিত পণ্যগুলোর পরিমাণ ঠিক করুন বা সরিয়ে দিন।" /> : null}
          {data.requiresPrescription ? (
            <InlineAlert message="কার্টে প্রেসক্রিপশনের ওষুধ আছে। অর্ডারের পর প্রেসক্রিপশন দিতে হবে।" />
          ) : null}
          {data.items.map((item) => {
            const p = item.product;
            const problem = item.maxQty === 0 ? 'এখন স্টকে নেই' : item.qty > item.maxQty ? `এখন সর্বোচ্চ ${toBanglaDigits(item.maxQty)}টি` : null;
            return (
              <SurfaceCard key={p.id} className={problem ? 'border-danger/40' : ''}>
                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={p.name}
                    onPress={() => router.push({ pathname: '/shop/product/[productId]', params: { productId: p.id } })}
                    className="h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-white">
                    {p.imageThumbnailUrl ? (
                      <Image source={p.imageThumbnailUrl} style={{ width: 64, height: 64 }} contentFit="contain" />
                    ) : (
                      <Package size={26} color={colors.primary300} />
                    )}
                  </Pressable>
                  <View className="flex-1 gap-0.5">
                    <BanglaText variant="label" numberOfLines={2}>
                      {[p.name, p.strength].filter(Boolean).join(' ')}
                    </BanglaText>
                    {p.packSize ? <BanglaText variant="caption">{p.packSize}</BanglaText> : null}
                    <BanglaText variant="body-strong">{taka(item.lineTotal)}</BanglaText>
                    {problem ? (
                      <BanglaText variant="caption" className="text-danger">
                        {problem}
                      </BanglaText>
                    ) : null}
                  </View>
                </View>
                <View className="mt-2 flex-row items-center justify-between">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${p.name} সরিয়ে দিন`}
                    onPress={() => add.set(p.id, 0)}
                    className="min-h-11 flex-row items-center gap-1 px-1">
                    <Trash2 size={16} color={colors.danger} />
                    <BanglaText variant="label" className="text-danger">
                      সরান
                    </BanglaText>
                  </Pressable>
                  <QtyStepper
                    qty={item.qty}
                    max={Math.max(item.maxQty, 1)}
                    busy={add.busyId === p.id}
                    onChange={(qty) => add.set(p.id, qty)}
                  />
                </View>
              </SurfaceCard>
            );
          })}
          {data.savings > 0 ? (
            <BanglaText variant="label" className="text-center text-success">
              এই অর্ডারে আপনি বাঁচাচ্ছেন {taka(data.savings)}
            </BanglaText>
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}
