import { router, useLocalSearchParams } from 'expo-router';
import { Search, SearchX, ShoppingCart } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { TextInput, useWindowDimensions, View } from 'react-native';

import { ProductCard } from '@/components/shop/product-card';
import { ActionButton } from '@/components/ui/action-button';
import { ChipSelect } from '@/components/ui/chip-select';
import { IconButton, ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { useAddToCart } from '@/features/shop/use-add-to-cart';
import { useIsRegistered, useProducts } from '@/features/shop/use-shop';
import type { ProductSort } from '@/shared-contracts/shop.contract';
import { colors } from '@/theme/design-tokens';

const SORTS: { value: ProductSort; label: string }[] = [
  { value: 'RELEVANCE', label: 'প্রাসঙ্গিক' },
  { value: 'PRICE_LOW', label: 'দাম কম আগে' },
  { value: 'PRICE_HIGH', label: 'দাম বেশি আগে' },
  { value: 'DISCOUNT', label: 'বেশি ছাড়' },
  { value: 'NEWEST', label: 'নতুন' },
];

/** Search results, or one category / brand / trending, two cards a row. */
export default function ShopProductsScreen() {
  const params = useLocalSearchParams<{ categoryId?: string; brandId?: string; trending?: string; title?: string; search?: string }>();
  const searching = params.search === '1';
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<ProductSort>('RELEVANCE');
  const registered = useIsRegistered();
  const cart = useAddToCart();
  const { width } = useWindowDimensions();
  const cardWidth = (width - 32 - 12) / 2;

  // Search as you type, after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text]);

  const products = useProducts(
    {
      q: q || undefined,
      categoryId: params.categoryId,
      brandId: params.brandId,
      trending: params.trending === '1' || undefined,
      sort,
    },
    !searching || q.length > 0
  );
  const list = products.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <ScrollScreen
      onRefresh={() => products.refetch()}
      header={
        <ScreenHeader
          title={searching ? 'পণ্য খুঁজুন' : (params.title ?? 'পণ্য')}
          fallbackHref="/shop"
          actions={
            registered ? (
              <IconButton icon={ShoppingCart} label="কার্ট" tone="primary" badge={cart.itemCount} onPress={() => router.push('/shop/cart')} />
            ) : undefined
          }
        />
      }>
      {searching ? (
        <View className="min-h-[52px] flex-row items-center gap-3 rounded-2xl border border-primary bg-surface-card px-4">
          <Search size={20} color={colors.inkMuted} />
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            placeholder="যেমন: নাপা, প্যারাসিটামল, ডায়াপার"
            placeholderTextColor={colors.inkSubtle}
            accessibilityLabel="পণ্য খুঁজুন"
            returnKeyType="search"
            className="min-h-[52px] flex-1 font-bangla text-[16px] text-ink"
          />
        </View>
      ) : null}
      <ChipSelect<ProductSort> scroll value={sort} onChange={setSort} options={SORTS} />

      {searching && q.length === 0 ? (
        <EmptyState icon={Search} title="কী খুঁজছেন লিখুন" message="ওষুধের নাম, জেনেরিক নাম বা পণ্যের নাম। বানান একটু ভুল হলেও চলবে।" />
      ) : products.isLoading ? (
        <LoadingList rows={3} rowClassName="h-56" />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={SearchX} title="কিছু পাওয়া যায়নি" message={searching ? 'অন্য নামে খুঁজে দেখুন।' : 'এখানে এখনো কোনো পণ্য নেই।'} />
      ) : (
        <>
          <View className="flex-row flex-wrap gap-3">
            {list.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                width={cardWidth}
                qtyInCart={cart.qtyOf(p.id)}
                adding={cart.busyId === p.id}
                onAdd={(qty) => cart.set(p.id, qty)}
              />
            ))}
          </View>
          {products.hasNextPage ? (
            <ActionButton
              label="আরও দেখুন"
              variant="outline"
              loading={products.isFetchingNextPage}
              onPress={() => void products.fetchNextPage()}
            />
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}
