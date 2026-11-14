import { Image } from 'expo-image';
import { router } from 'expo-router';
import { BadgePercent, ClipboardList, Package, Search, ShoppingCart, Store } from 'lucide-react-native';
import { Linking, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { ProductCard } from '@/components/shop/product-card';
import { BanglaText } from '@/components/ui/bangla-text';
import { SectionHeader } from '@/components/ui/list-row';
import { IconButton, ScreenHeader } from '@/components/ui/screen-header';
import { ScrollScreen } from '@/components/ui/scroll-screen';
import { EmptyState, ErrorState, LoadingList } from '@/components/ui/state-views';
import { CATEGORY_BADGE_TEXT } from '@/features/shop/shop-display';
import { useAddToCart } from '@/features/shop/use-add-to-cart';
import { useIsRegistered, useShopEnabled, useShopHome } from '@/features/shop/use-shop';
import type { ProductSummaryResponse, ShopBannerResponse } from '@/shared-contracts/shop.contract';
import { colors } from '@/theme/design-tokens';

function openBanner(banner: ShopBannerResponse) {
  switch (banner.linkType) {
    case 'CATEGORY':
      router.push({ pathname: '/shop/products', params: { categoryId: banner.linkValue!, title: banner.title } });
      return;
    case 'BRAND':
      router.push({ pathname: '/shop/products', params: { brandId: banner.linkValue!, title: banner.title } });
      return;
    case 'PRODUCT':
      router.push({ pathname: '/shop/product/[productId]', params: { productId: banner.linkValue! } });
      return;
    case 'URL':
      if (banner.linkValue) void Linking.openURL(banner.linkValue);
      return;
    default:
  }
}

function ProductRow({ products }: { products: ProductSummaryResponse[] }) {
  const cart = useAddToCart();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-4">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={p}
          qtyInCart={cart.qtyOf(p.id)}
          adding={cart.busyId === p.id}
          onAdd={(qty) => cart.set(p.id, qty)}
        />
      ))}
    </ScrollView>
  );
}

/** HealthStore home: search, offers, categories, trending, sections, brands, partners. */
export default function ShopHomeScreen() {
  const enabled = useShopEnabled();
  const home = useShopHome();
  const registered = useIsRegistered();
  const cart = useAddToCart();
  const { width } = useWindowDimensions();
  // Screen gutter (2×16) + card padding (2×16) + three 10px gaps.
  const tile = Math.floor((width - 32 - 32 - 3 * 10) / 4);
  const data = home.data;

  return (
    <ScrollScreen
      onRefresh={() => home.refetch()}
      header={
        <ScreenHeader
          title="হেলথস্টোর"
          subtitle="ওষুধ ও স্বাস্থ্যপণ্য, ঘরে বসে"
          fallbackHref="/home"
          actions={
            registered ? (
              <View className="flex-row gap-1">
                <IconButton icon={ClipboardList} label="আমার অর্ডার" onPress={() => router.push('/shop/orders')} />
                <IconButton
                  icon={ShoppingCart}
                  label="কার্ট"
                  tone="primary"
                  badge={cart.itemCount}
                  onPress={() => router.push('/shop/cart')}
                />
              </View>
            ) : undefined
          }
        />
      }>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="পণ্য খুঁজুন"
        onPress={() => router.push({ pathname: '/shop/products', params: { search: '1' } })}
        className="min-h-[52px] flex-row items-center gap-3 rounded-2xl border border-line bg-surface-card px-4 active:bg-primary-50">
        <Search size={20} color={colors.inkMuted} />
        <BanglaText variant="body" className="text-ink-subtle">
          ওষুধ বা পণ্যের নাম লিখুন
        </BanglaText>
      </Pressable>

      {!enabled && !home.isLoading ? (
        <EmptyState icon={Store} title="হেলথস্টোর এখন বন্ধ" message="শিগগিরই আবার চালু হবে।" />
      ) : home.isLoading ? (
        <LoadingList rows={3} rowClassName="h-40" />
      ) : home.isError ? (
        <ErrorState error={home.error} onRetry={() => void home.refetch()} />
      ) : data ? (
        <>
          {data.banners.length > 0 ? (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
              {data.banners.map((b) => (
                <Pressable
                  key={b.id}
                  accessibilityRole={b.linkType === 'NONE' ? 'image' : 'button'}
                  accessibilityLabel={b.title}
                  disabled={b.linkType === 'NONE'}
                  onPress={() => openBanner(b)}
                  style={{ width: width - 32 }}
                  className="overflow-hidden rounded-3xl">
                  <Image
                    source={b.imageUrl}
                    style={{ width: width - 32, height: (width - 32) * 0.42 }}
                    contentFit="cover"
                    transition={150}
                    accessibilityIgnoresInvertColors
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View className="gap-3 rounded-3xl bg-primary-50 p-4">
            <BanglaText variant="heading" className="text-center">
              জনপ্রিয় ক্যাটাগরি
            </BanglaText>
            <View className="flex-row flex-wrap gap-[10px]">
              {data.categories.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                  onPress={() => router.push({ pathname: '/shop/products', params: { categoryId: c.id, title: c.name } })}
                  style={{ width: tile }}
                  className="items-center gap-1">
                  <View
                    style={{ width: tile, height: tile }}
                    className="items-center justify-center overflow-hidden rounded-2xl bg-surface-card">
                    {c.imageThumbnailUrl ? (
                      <Image
                        source={c.imageThumbnailUrl}
                        style={{ width: tile, height: tile }}
                        contentFit="cover"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <Package size={28} color={colors.primary} />
                    )}
                    {c.badge ? (
                      <View className="absolute bottom-0 left-0 right-0 bg-primary py-0.5">
                        <BanglaText variant="caption" className="text-center text-[11px] leading-[16px] text-white">
                          {CATEGORY_BADGE_TEXT[c.badge]}
                        </BanglaText>
                      </View>
                    ) : null}
                  </View>
                  <BanglaText variant="caption" numberOfLines={2} className="text-center text-ink">
                    {c.name}
                  </BanglaText>
                </Pressable>
              ))}
            </View>
          </View>

          {data.trending.length > 0 ? (
            <View className="gap-3">
              <SectionHeader
                title="ট্রেন্ডিং পণ্য"
                actionLabel="সব দেখুন"
                onAction={() => router.push({ pathname: '/shop/products', params: { trending: '1', title: 'ট্রেন্ডিং পণ্য' } })}
              />
              <ProductRow products={data.trending} />
            </View>
          ) : null}

          {data.sections.map((s) => (
            <View key={s.category.id} className="gap-3">
              <SectionHeader
                title={s.category.name}
                actionLabel="সব দেখুন"
                onAction={() =>
                  router.push({ pathname: '/shop/products', params: { categoryId: s.category.id, title: s.category.name } })
                }
              />
              <ProductRow products={s.products} />
            </View>
          ))}

          {data.featuredBrands.length > 0 ? (
            <View className="gap-3">
              <SectionHeader title="ফিচার্ড ব্র্যান্ড" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-4">
                {data.featuredBrands.map((b) => (
                  <Pressable
                    key={b.id}
                    accessibilityRole="button"
                    accessibilityLabel={b.name}
                    onPress={() => router.push({ pathname: '/shop/products', params: { brandId: b.id, title: b.name } })}
                    className="w-[120px] items-center gap-2">
                    <View className="h-[90px] w-[120px] items-center justify-center overflow-hidden rounded-2xl border border-line/70 bg-white">
                      {b.logoThumbnailUrl ? (
                        <Image source={b.logoThumbnailUrl} style={{ width: 110, height: 80 }} contentFit="contain" />
                      ) : (
                        <BanglaText variant="label" className="px-2 text-center text-primary" numberOfLines={2}>
                          {b.name}
                        </BanglaText>
                      )}
                    </View>
                    <BanglaText variant="caption" numberOfLines={1} className="text-ink">
                      {b.name}
                    </BanglaText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {data.partners.length > 0 ? (
            <View className="gap-3">
              <SectionHeader title="আমাদের ডিসকাউন্ট পার্টনার" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-4">
                {data.partners.map((p) => (
                  <View key={p.id} className="w-[220px] gap-2 rounded-2xl border border-line/70 bg-surface-card p-3">
                    <View className="flex-row items-center gap-3">
                      <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-primary-50">
                        {p.logoThumbnailUrl ? (
                          <Image source={p.logoThumbnailUrl} style={{ width: 48, height: 48 }} contentFit="cover" />
                        ) : (
                          <BadgePercent size={22} color={colors.primary} />
                        )}
                      </View>
                      <BanglaText variant="label" numberOfLines={2} className="flex-1">
                        {p.name}
                      </BanglaText>
                    </View>
                    <BanglaText variant="body-strong" className="text-primary">
                      {p.offerText}
                    </BanglaText>
                    {p.address ? (
                      <BanglaText variant="caption" numberOfLines={1}>
                        {p.address}
                      </BanglaText>
                    ) : null}
                    {p.phone ? (
                      <Pressable
                        accessibilityRole="link"
                        onPress={() => void Linking.openURL(`tel:${p.phone}`)}
                        className="min-h-11 justify-center">
                        <BanglaText variant="label" className="text-primary">
                          কল করুন
                        </BanglaText>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {data.categories.length === 0 && data.trending.length === 0 ? (
            <EmptyState icon={Store} title="এখনো কোনো পণ্য নেই" message="শিগগিরই পণ্য যোগ হবে।" />
          ) : null}
        </>
      ) : null}
      {registered ? null : (
        <BanglaText variant="caption" className="text-center">
          কেনাকাটা করতে অ্যাকাউন্ট লাগবে; অতিথি হিসেবে দেখা যায়।
        </BanglaText>
      )}
      <View className="h-2" />
    </ScrollScreen>
  );
}
