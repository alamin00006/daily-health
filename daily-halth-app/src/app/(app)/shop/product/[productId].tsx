import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { FileText, Package, ShoppingCart } from 'lucide-react-native';
import { View } from 'react-native';

import { QtyStepper } from '@/components/shop/product-card';
import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { InlineAlert } from '@/components/ui/form-error-banner';
import { IconButton, ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { ErrorState, LoadingList } from '@/components/ui/state-views';
import { SurfaceCard } from '@/components/ui/surface-card';
import { taka } from '@/features/doctors/doctor-display';
import { useAddToCart } from '@/features/shop/use-add-to-cart';
import { useIsRegistered, useProduct } from '@/features/shop/use-shop';
import { toBanglaDigits } from '@/lib/bangla-digits';
import { colors } from '@/theme/design-tokens';

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row justify-between gap-4 py-1">
      <BanglaText variant="caption">{label}</BanglaText>
      <BanglaText variant="label" className="flex-1 text-right">
        {value}
      </BanglaText>
    </View>
  );
}

/** One product: picture, price, details, add to cart. */
export default function ProductScreen() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const product = useProduct(productId);
  const cart = useAddToCart();
  const registered = useIsRegistered();
  const p = product.data;
  const inCart = p ? cart.qtyOf(p.id) : 0;

  return (
    <ScrollScreen
      onRefresh={() => product.refetch()}
      header={
        <ScreenHeader
          title="পণ্যের বিবরণ"
          fallbackHref="/shop"
          actions={
            registered ? (
              <IconButton icon={ShoppingCart} label="কার্ট" tone="primary" badge={cart.itemCount} onPress={() => router.push('/shop/cart')} />
            ) : undefined
          }
        />
      }
      footer={
        p && p.inStock ? (
          <View className="flex-row items-center gap-3">
            {inCart > 0 ? (
              <>
                <QtyStepper qty={inCart} max={p.maxQty} busy={cart.busyId === p.id} onChange={(qty) => cart.set(p.id, qty)} />
                <View className="flex-1">
                  <ActionButton label="কার্টে যান" icon={ShoppingCart} onPress={() => router.push('/shop/cart')} />
                </View>
              </>
            ) : (
              <View className="flex-1">
                <ActionButton
                  label="কার্টে যোগ করুন"
                  icon={ShoppingCart}
                  loading={cart.busyId === p.id}
                  onPress={() => cart.set(p.id, 1)}
                />
              </View>
            )}
          </View>
        ) : undefined
      }>
      {product.isLoading ? (
        <LoadingList rows={2} rowClassName="h-64" />
      ) : product.isError ? (
        <ErrorState error={product.error} onRetry={() => void product.refetch()} />
      ) : p ? (
        <>
          <View className="h-[260px] items-center justify-center overflow-hidden rounded-3xl bg-white">
            {p.imageUrl ? (
              <Image source={p.imageUrl} style={{ width: '100%', height: 260 }} contentFit="contain" transition={150} accessibilityIgnoresInvertColors />
            ) : (
              <Package size={64} color={colors.primary300} />
            )}
          </View>
          <View className="gap-1">
            <BanglaText variant="caption" className="text-primary">
              {p.category.name}
              {p.brand ? ` · ${p.brand.name}` : ''}
            </BanglaText>
            <BanglaText variant="title">{[p.name, p.strength].filter(Boolean).join(' ')}</BanglaText>
            {p.genericName ? <BanglaText variant="body">জেনেরিক: {p.genericName}</BanglaText> : null}
            <View className="mt-1 flex-row items-baseline gap-3">
              <BanglaText variant="title" className="text-primary">
                {taka(p.price)}
              </BanglaText>
              {p.mrp > p.price ? (
                <>
                  <BanglaText variant="body" className="text-ink-muted line-through">
                    {taka(p.mrp)}
                  </BanglaText>
                  <BanglaText variant="label" className="text-success">
                    {toBanglaDigits(p.discountPercent)}% ছাড়
                  </BanglaText>
                </>
              ) : null}
            </View>
            {p.packSize ? <BanglaText variant="caption">{p.packSize}</BanglaText> : null}
          </View>

          {!p.inStock ? <InlineAlert tone="danger" message="পণ্যটি এখন স্টকে নেই। পরে আবার দেখুন।" /> : null}
          {p.requiresPrescription ? (
            <InlineAlert message="এই ওষুধ কিনতে প্রেসক্রিপশন লাগবে। অর্ডারের সময় প্রেসক্রিপশনের ছবি দেবেন, বা অ্যাপে পাওয়া প্রেসক্রিপশন বেছে নেবেন। আমাদের ফার্মাসিস্ট দেখে অনুমোদন দিলে অর্ডার পাঠানো হবে।" />
          ) : null}

          <SurfaceCard>
            <Fact label="ধরন" value={p.dosageForm} />
            <Fact label="প্রস্তুতকারক" value={p.manufacturer} />
            <Fact label="এক অর্ডারে সর্বোচ্চ" value={p.inStock ? `${toBanglaDigits(p.maxQty)}টি` : null} />
          </SurfaceCard>
          {p.description ? (
            <SurfaceCard>
              <View className="mb-1 flex-row items-center gap-2">
                <FileText size={18} color={colors.primary} />
                <BanglaText variant="body-strong">বিবরণ</BanglaText>
              </View>
              <BanglaText variant="body">{p.description}</BanglaText>
            </SurfaceCard>
          ) : null}
          <BanglaText variant="caption" className="text-center">
            ওষুধ খাওয়ার আগে ডাক্তারের পরামর্শ নিন।
          </BanglaText>
        </>
      ) : null}
    </ScrollScreen>
  );
}
