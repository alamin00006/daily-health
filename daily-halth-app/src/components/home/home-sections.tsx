import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  Apple,
  Bell,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  FilePlus2,
  FileText,
  Flower2,
  HeartPulse,
  Lightbulb,
  LockKeyhole,
  LogIn,
  MessagesSquare,
  Package,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Store,
  UsersRound,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { BrandLogo } from '@/components/brand/brand-logo';
import { DoctorCard } from '@/components/doctors/doctor-card';
import { ProductCard } from '@/components/shop/product-card';
import { BanglaText } from '@/components/ui/bangla-text';
import { ChipSelect } from '@/components/ui/chip-select';
import { SectionHeader } from '@/components/ui/list-row';
import { IconButton } from '@/components/ui/screen-header';
import { SkeletonBlock } from '@/components/ui/state-views';
import { openLogin } from '@/features/auth/guest-access';
import { useLatestHealthTips } from '@/features/content/use-health-tips';
import { useQuickConsultOptions } from '@/features/consultations/use-consultations';
import { specialtyIcon, taka } from '@/features/doctors/doctor-display';
import { useProviderSearch, useSpecialties } from '@/features/doctors/use-doctors';
import { canViewWomensHealth } from '@/features/profiles/profile-permissions';
import { CATEGORY_BADGE_TEXT } from '@/features/shop/shop-display';
import { useAddToCart } from '@/features/shop/use-add-to-cart';
import { useShopHome } from '@/features/shop/use-shop';
import { toBanglaDigits } from '@/lib/bangla-digits';
import type { PatientProfileResponse } from '@/shared-contracts/profiles.contract';
import { colors, shadows } from '@/theme/design-tokens';

// ---------------------------------------------------------------------------
// Header: brand, whose care, alerts, cart, search
// ---------------------------------------------------------------------------

export function HomeHeader({
  profile,
  isGuest,
  unread,
  cartCount,
  shopEnabled,
}: {
  profile: PatientProfileResponse | null;
  isGuest: boolean;
  unread: number;
  cartCount: number;
  shopEnabled: boolean;
}) {
  return (
    <View className="gap-3 rounded-b-[28px] bg-primary-50 px-5 pb-4 pt-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center gap-3">
          <BrandLogo size={38} />
          <View className="flex-1">
            <BanglaText variant="heading" className="text-primary">
              দৈনিক স্বাস্থ্য
            </BanglaText>
            {profile ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`এখন দেখছেন ${profile.fullName}-এর তথ্য; বদলাতে চাপুন`}
                onPress={() => router.push('/profile-switcher')}
                hitSlop={8}
                className="flex-row items-center gap-1">
                <BanglaText variant="caption">কার জন্য:</BanglaText>
                <BanglaText variant="label" numberOfLines={1} className="max-w-[150px] font-bangla-semibold">
                  {profile.fullName}
                </BanglaText>
                <ChevronDown size={16} color={colors.ink} />
              </Pressable>
            ) : (
              <BanglaText variant="caption">আপনার প্রতিদিনের ডিজিটাল স্বাস্থ্যসেবা</BanglaText>
            )}
          </View>
        </View>
        {isGuest ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="লগইন বা অ্যাকাউন্ট খুলুন"
            onPress={openLogin}
            className="min-h-11 flex-row items-center gap-1.5 rounded-full bg-primary px-4 active:bg-primary-700">
            <LogIn size={18} color={colors.white} />
            <BanglaText variant="label" className="font-bangla-semibold text-white">
              লগইন
            </BanglaText>
          </Pressable>
        ) : (
          <View className="flex-row gap-2">
            <IconButton icon={Bell} label="বার্তা" badge={unread} onPress={() => router.push('/notifications')} />
            <IconButton icon={Settings} label="অ্যাকাউন্ট ও সেটিংস" onPress={() => router.push('/settings')} />
            {shopEnabled ? (
              <IconButton icon={ShoppingCart} label="কার্ট" badge={cartCount} onPress={() => router.push('/shop/cart')} />
            ) : null}
          </View>
        )}
      </View>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="ডাক্তার বা বিশেষত্ব খুঁজুন"
        onPress={() => router.push('/doctors')}
        className="min-h-[50px] flex-row items-center gap-3 rounded-2xl border border-line bg-surface-card px-4 active:bg-primary-50">
        <Search size={20} color={colors.inkMuted} />
        <BanglaText variant="body" className="text-ink-subtle">
          ডাক্তার, বিশেষত্ব বা BMDC নম্বর খুঁজুন
        </BanglaText>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The four big service cards
// ---------------------------------------------------------------------------

function ServiceCard({
  title,
  subtitle,
  icon: Icon,
  tag,
  onPress,
}: {
  title: string;
  subtitle?: React.ReactNode;
  icon: LucideIcon;
  tag?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={shadows.card}
      className="min-h-[112px] flex-1 overflow-hidden rounded-3xl bg-surface-card p-4 active:opacity-90">
      {tag ? (
        <View className="absolute right-0 top-0 rounded-bl-xl bg-rose px-2.5 py-0.5">
          <BanglaText className="font-bangla-semibold text-[11px] leading-[16px] text-white">{tag}</BanglaText>
        </View>
      ) : null}
      <BanglaText variant="body-strong" className="pr-10">
        {title}
      </BanglaText>
      {subtitle ? <View className="mt-0.5">{subtitle}</View> : null}
      <View className="absolute bottom-3 right-3 h-12 w-12 items-center justify-center rounded-full bg-primary-100">
        <Icon size={24} color={colors.primary} />
      </View>
    </Pressable>
  );
}

export function ServiceCards({ shopEnabled, signedUp }: { shopEnabled: boolean; signedUp: boolean }) {
  const options = useQuickConsultOptions();
  const general = options.data?.find((o) => o.kind === 'GENERAL');
  const online = general?.doctorsOnline ?? 0;
  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <ServiceCard
          title="দ্রুত ডাক্তার পরামর্শ"
          icon={Zap}
          onPress={() => router.push('/quick-consult')}
          subtitle={
            general?.isEnabled ? (
              <View className="gap-0.5">
                <BanglaText variant="body-strong" className="text-primary">
                  {taka(general.price)}
                </BanglaText>
                <BanglaText variant="caption">
                  {online > 0 ? `${toBanglaDigits(online)} জন ডাক্তার অনলাইনে` : 'চ্যাটে পরামর্শ'}
                </BanglaText>
              </View>
            ) : (
              <BanglaText variant="caption">চ্যাটে পরামর্শ</BanglaText>
            )
          }
        />
        <ServiceCard
          title="বিশেষজ্ঞ ডাক্তার"
          icon={Stethoscope}
          subtitle={<BanglaText variant="caption">চেম্বার, ভিডিও বা চ্যাট</BanglaText>}
          onPress={() => router.push('/doctors')}
        />
      </View>
      <View className="flex-row gap-3">
        {shopEnabled ? (
          <ServiceCard
            title="হেলথস্টোর"
            tag="নতুন"
            icon={Store}
            subtitle={<BanglaText variant="caption">ওষুধ ও স্বাস্থ্যপণ্য ঘরে বসে</BanglaText>}
            onPress={() => router.push('/shop')}
          />
        ) : (
          <ServiceCard
            title="স্বাস্থ্য টিপস"
            icon={Lightbulb}
            subtitle={<BanglaText variant="caption">ডাক্তারদের পরামর্শ</BanglaText>}
            onPress={() => router.push('/tips')}
          />
        )}
        <ServiceCard
          title={signedUp ? 'অ্যাপয়েন্টমেন্ট' : 'আমার পরামর্শ'}
          icon={signedUp ? CalendarClock : MessagesSquare}
          subtitle={<BanglaText variant="caption">{signedUp ? 'সামনের ও আগের ভিজিট' : 'চলমান ও আগের পরামর্শ'}</BanglaText>}
          onPress={() => router.push(signedUp ? '/appointments' : '/consultations')}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Other services: one row that scrolls
// ---------------------------------------------------------------------------

export function OtherServices({ profile, shopEnabled }: { profile: PatientProfileResponse; shopEnabled: boolean }) {
  const items: { label: string; icon: LucideIcon; href: Parameters<typeof router.push>[0]; tone?: 'rose' }[] = [
    { label: 'মাপ লিখুন', icon: HeartPulse, href: '/vitals/new' },
    { label: 'রিপোর্ট যোগ', icon: FilePlus2, href: '/records/upload' },
    { label: 'প্রেসক্রিপশন', icon: FileText, href: '/prescriptions' },
    { label: 'হেলথ কার্ড', icon: QrCode, href: '/health-card' },
    { label: 'পরিবার', icon: UsersRound, href: '/family' },
    { label: 'আমার পরামর্শ', icon: MessagesSquare, href: '/consultations' },
    ...(canViewWomensHealth(profile) ? [{ label: 'নারীস্বাস্থ্য', icon: Flower2, href: '/womens-health' as const, tone: 'rose' as const }] : []),
    { label: 'ডায়েট চার্ট', icon: Apple, href: '/diet' },
    { label: 'স্বাস্থ্য টিপস', icon: Lightbulb, href: '/tips' },
    ...(shopEnabled ? [{ label: 'আমার অর্ডার', icon: ClipboardList, href: '/shop/orders' as const }] : []),
    { label: 'পেমেন্ট', icon: Wallet, href: '/payments' },
  ];
  return (
    <View className="gap-3">
      <SectionHeader title="অন্যান্য সেবা" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-4">
        {items.map((item) => {
          const Icon = item.icon;
          const rose = item.tone === 'rose';
          return (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={() => router.push(item.href)}
              className="w-[84px] items-center gap-2">
              <View
                className={`h-[68px] w-[68px] items-center justify-center rounded-3xl ${rose ? 'bg-rose-soft' : 'bg-primary-50'} active:opacity-80`}>
                <Icon size={28} color={rose ? colors.rose : colors.primary} />
              </View>
              <BanglaText variant="caption" numberOfLines={2} className="text-center text-ink">
                {item.label}
              </BanglaText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Banner carousel: health tips with a picture
// ---------------------------------------------------------------------------

export function TipsCarousel() {
  const tips = useLatestHealthTips();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const cardWidth = width - 40;
  const withPicture = (tips.data ?? []).filter((t) => t.imageUrl).slice(0, 6);
  if (tips.isLoading) return <SkeletonBlock className="h-40 rounded-3xl" />;
  if (withPicture.length === 0) return null;
  return (
    <View className="gap-2">
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / cardWidth))}>
        {withPicture.map((tip) => (
          <Pressable
            key={tip.id}
            accessibilityRole="button"
            accessibilityLabel={tip.title}
            onPress={() => router.push({ pathname: '/tips/[tipId]', params: { tipId: tip.id } })}
            style={{ width: cardWidth }}
            className="overflow-hidden rounded-3xl">
            <Image
              source={tip.imageUrl}
              style={{ width: cardWidth, height: cardWidth * 0.45 }}
              contentFit="cover"
              transition={150}
              accessibilityIgnoresInvertColors
            />
            <View className="absolute bottom-0 left-0 right-0 bg-ink/55 px-4 py-2">
              <BanglaText variant="body-strong" numberOfLines={1} className="text-white">
                {tip.title}
              </BanglaText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
      {withPicture.length > 1 ? (
        <View className="flex-row justify-center gap-1.5">
          {withPicture.map((tip, i) => (
            <View key={tip.id} className={`h-2 rounded-full ${i === index ? 'w-5 bg-primary' : 'w-2 bg-line'}`} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Common health concerns → doctors of that specialty
// ---------------------------------------------------------------------------

const CONCERN_TINTS = ['bg-primary-50', 'bg-rose-soft', 'bg-nutrition-soft', 'bg-primary-100'] as const;

export function CommonConcerns() {
  const specialties = useSpecialties('DOCTOR');
  const list = (specialties.data ?? []).filter((s) => s.providerCount > 0).slice(0, 8);
  if (specialties.isLoading) return <SkeletonBlock className="h-36 rounded-3xl" />;
  if (list.length === 0) return null;
  return (
    <View className="gap-3">
      <SectionHeader title="কোন সমস্যায় ডাক্তার খুঁজছেন?" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-4">
        {list.map((s, i) => {
          const Icon = specialtyIcon(s.iconName);
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={s.nameBn}
              onPress={() => router.push({ pathname: '/doctors', params: { specialty: s.slug } })}
              className={`h-[150px] w-[150px] justify-between rounded-3xl p-4 active:opacity-80 ${CONCERN_TINTS[i % CONCERN_TINTS.length]}`}>
              <BanglaText variant="body-strong" numberOfLines={2}>
                {s.nameBn}
              </BanglaText>
              <View className="flex-row items-end justify-between">
                <BanglaText variant="caption">{toBanglaDigits(s.providerCount)} জন</BanglaText>
                <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-card">
                  <Icon size={28} color={colors.primary} />
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Top doctors with a specialty filter
// ---------------------------------------------------------------------------

export function TopDoctors() {
  const specialties = useSpecialties('DOCTOR');
  const [specialty, setSpecialty] = useState<string>('ALL');
  const search = useProviderSearch({ type: 'DOCTOR', specialty: specialty === 'ALL' ? undefined : specialty });
  const doctors = (search.data?.pages[0]?.data ?? []).slice(0, 6);
  const { width } = useWindowDimensions();
  return (
    <View className="gap-3">
      <SectionHeader title="ডাক্তার" actionLabel="সব দেখুন" onAction={() => router.push('/doctors')} />
      <ChipSelect<string>
        scroll
        value={specialty}
        onChange={setSpecialty}
        options={[
          { value: 'ALL', label: 'সব' },
          ...(specialties.data ?? []).filter((s) => s.providerCount > 0).slice(0, 8).map((s) => ({ value: s.slug, label: s.nameBn })),
        ]}
      />
      {search.isLoading ? (
        <SkeletonBlock className="h-40 rounded-3xl" />
      ) : doctors.length === 0 ? (
        <BanglaText variant="caption">এই বিভাগে এখনো ডাক্তার নেই।</BanglaText>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-4">
          {doctors.map((d) => (
            <View key={d.id} style={{ width: Math.min(360, width - 56) }}>
              <DoctorCard
                provider={d}
                onPress={() => router.push({ pathname: '/doctors/[providerId]', params: { providerId: d.id } })}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// HealthStore on home (only while the shop is on)
// ---------------------------------------------------------------------------

export function ShopHomeStrip() {
  const home = useShopHome();
  const cart = useAddToCart();
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - 40 - 32 - 3 * 10) / 4);
  const data = home.data;
  if (home.isLoading) return <SkeletonBlock className="h-56 rounded-3xl" />;
  if (!data || (data.categories.length === 0 && data.trending.length === 0)) return null;
  return (
    <>
      {data.categories.length > 0 ? (
        <View className="gap-3 rounded-3xl bg-primary-50 p-4">
          <BanglaText variant="heading" className="text-center">
            জনপ্রিয় ক্যাটাগরি
          </BanglaText>
          <View className="flex-row flex-wrap gap-[10px]">
            {data.categories.slice(0, 8).map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={c.name}
                onPress={() => router.push({ pathname: '/shop/products', params: { categoryId: c.id, title: c.name } })}
                style={{ width: tile }}
                className="items-center gap-1">
                <View style={{ width: tile, height: tile }} className="items-center justify-center overflow-hidden rounded-2xl bg-surface-card">
                  {c.imageThumbnailUrl ? (
                    <Image source={c.imageThumbnailUrl} style={{ width: tile, height: tile }} contentFit="cover" />
                  ) : (
                    <Package size={26} color={colors.primary} />
                  )}
                  {c.badge ? (
                    <View className="absolute bottom-0 left-0 right-0 bg-primary py-0.5">
                      <BanglaText className="text-center text-[10px] leading-[15px] text-white">{CATEGORY_BADGE_TEXT[c.badge]}</BanglaText>
                    </View>
                  ) : null}
                </View>
                <BanglaText variant="caption" numberOfLines={2} className="text-center text-ink">
                  {c.name}
                </BanglaText>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/shop')} className="min-h-11 items-center justify-center">
            <BanglaText variant="label" className="font-bangla-semibold text-primary">
              হেলথস্টোরে সব দেখুন
            </BanglaText>
          </Pressable>
        </View>
      ) : null}
      {data.trending.length > 0 ? (
        <View className="gap-3">
          <SectionHeader
            title="ট্রেন্ডিং পণ্য"
            actionLabel="সব দেখুন"
            onAction={() => router.push({ pathname: '/shop/products', params: { trending: '1', title: 'ট্রেন্ডিং পণ্য' } })}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-4">
            {data.trending.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                qtyInCart={cart.qtyOf(p.id)}
                adding={cart.busyId === p.id}
                onAdd={(qty) => cart.set(p.id, qty)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Why trust us
// ---------------------------------------------------------------------------

export function TrustRow() {
  const items: { icon: LucideIcon; text: string }[] = [
    { icon: ShieldCheck, text: 'BMDC যাচাই করা ডাক্তার' },
    { icon: Wallet, text: 'নিরাপদ পেমেন্ট' },
    { icon: LockKeyhole, text: 'তথ্য এনক্রিপ্ট করা' },
  ];
  return (
    <View className="flex-row gap-3">
      {items.map(({ icon: Icon, text }) => (
        <View key={text} className="flex-1 items-center gap-2 rounded-2xl bg-surface-card px-2 py-4" style={shadows.card}>
          <Icon size={26} color={colors.primary} />
          <BanglaText variant="caption" className="text-center text-ink">
            {text}
          </BanglaText>
        </View>
      ))}
    </View>
  );
}
