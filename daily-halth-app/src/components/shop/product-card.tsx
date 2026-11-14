import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Minus, Package, Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { taka } from '@/features/doctors/doctor-display';
import { toBanglaDigits } from '@/lib/bangla-digits';
import type { ProductSummaryResponse } from '@/shared-contracts/shop.contract';
import { colors } from '@/theme/design-tokens';

/** − 2 + stepper; 44px touch targets. */
export function QtyStepper({
  qty,
  max,
  busy,
  onChange,
}: {
  qty: number;
  max: number;
  busy?: boolean;
  onChange: (qty: number) => void;
}) {
  return (
    <View className="flex-row items-center rounded-xl border border-primary/40">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="একটি কম"
        disabled={busy || qty <= 0}
        onPress={() => onChange(qty - 1)}
        className="h-11 w-11 items-center justify-center active:bg-primary-50">
        <Minus size={18} color={colors.primary} />
      </Pressable>
      <BanglaText variant="body-strong" className="min-w-[28px] text-center">
        {toBanglaDigits(qty)}
      </BanglaText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="একটি বেশি"
        disabled={busy || qty >= max}
        onPress={() => onChange(qty + 1)}
        className={`h-11 w-11 items-center justify-center active:bg-primary-50 ${qty >= max ? 'opacity-40' : ''}`}>
        <Plus size={18} color={colors.primary} />
      </Pressable>
    </View>
  );
}

/** A product tile for home rows and grids: picture, discount tag, price, add to cart. */
export function ProductCard({
  product,
  qtyInCart,
  onAdd,
  adding,
  width = 168,
}: {
  product: ProductSummaryResponse;
  qtyInCart: number;
  onAdd: (qty: number) => void;
  adding?: boolean;
  width?: number | `${number}%`;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={product.name}
      onPress={() => router.push({ pathname: '/shop/product/[productId]', params: { productId: product.id } })}
      style={{ width }}
      className="overflow-hidden rounded-2xl border border-line/70 bg-surface-card active:bg-primary-50">
      <View className="h-[120px] items-center justify-center bg-white">
        {product.imageThumbnailUrl ? (
          <Image
            source={product.imageThumbnailUrl}
            style={{ width: '100%', height: 120 }}
            contentFit="contain"
            transition={150}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Package size={36} color={colors.primary300} />
        )}
        {product.discountPercent > 0 ? (
          <View className="absolute right-2 top-2 rounded-lg bg-primary-50 px-2 py-0.5">
            <BanglaText variant="caption" className="font-bangla-semibold text-primary">
              {toBanglaDigits(product.discountPercent)}% ছাড়
            </BanglaText>
          </View>
        ) : null}
        {product.requiresPrescription ? (
          <View className="absolute left-2 top-2 rounded-lg bg-warning-soft px-2 py-0.5">
            <BanglaText variant="caption" className="text-warning">
              Rx
            </BanglaText>
          </View>
        ) : null}
      </View>
      <View className="gap-1 p-3">
        <BanglaText variant="label" numberOfLines={2}>
          {[product.name, product.strength].filter(Boolean).join(' ')}
        </BanglaText>
        {product.packSize ? (
          <BanglaText variant="caption" numberOfLines={1}>
            {product.packSize}
          </BanglaText>
        ) : null}
        <View className="flex-row items-baseline gap-2">
          <BanglaText variant="body-strong">{taka(product.price)}</BanglaText>
          {product.mrp > product.price ? (
            <BanglaText variant="caption" className="line-through">
              {taka(product.mrp)}
            </BanglaText>
          ) : null}
        </View>
        {!product.inStock ? (
          <View className="min-h-11 items-center justify-center rounded-xl bg-line/50">
            <BanglaText variant="label" className="text-ink-muted">
              স্টকে নেই
            </BanglaText>
          </View>
        ) : qtyInCart > 0 ? (
          <QtyStepper qty={qtyInCart} max={100} busy={adding} onChange={onAdd} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${product.name} কার্টে যোগ করুন`}
            disabled={adding}
            onPress={() => onAdd(1)}
            className="min-h-11 items-center justify-center rounded-xl border border-primary active:bg-primary-50">
            <BanglaText variant="label" className="text-primary">
              কার্টে যোগ করুন
            </BanglaText>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}
