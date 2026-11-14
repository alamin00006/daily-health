import { FlashList } from '@shopify/flash-list';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarClock, MessagesSquare, Search, SearchX, Stethoscope, X } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DoctorCard } from '@/components/doctors/doctor-card';
import { QuickConsultBanner } from '@/components/doctors/quick-consult-banner';
import { CurrentProfileChip } from '@/components/profile/active-profile-chip';
import { BanglaText } from '@/components/ui/bangla-text';
import { IconButton } from '@/components/ui/screen-header';
import { EmptyState, ErrorState, SkeletonBlock } from '@/components/ui/state-views';
import { specialtyIcon } from '@/features/doctors/doctor-display';
import {
  useDebouncedValue,
  useProviderSearch,
  useSpecialties,
} from '@/features/doctors/use-doctors';
import type { ProviderSearchFilters } from '@/api/doctors-endpoints';
import type { ConsultationMode, ProviderType } from '@/shared-contracts/doctors.contract';
import { colors } from '@/theme/design-tokens';

const TYPES: { value: ProviderType; label: string }[] = [
  { value: 'DOCTOR', label: 'ডাক্তার' },
  { value: 'NUTRITIONIST', label: 'পুষ্টিবিদ' },
  { value: 'PHYSIO', label: 'ফিজিওথেরাপি' },
];

type QuickFilter = 'online' | 'female' | ConsultationMode;
const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: 'online', label: 'এখন অনলাইনে' },
  { value: 'female', label: 'নারী ডাক্তার' },
  { value: 'VIDEO', label: 'ভিডিও কল' },
  { value: 'IN_PERSON', label: 'চেম্বার' },
  { value: 'HOME_VISIT', label: 'হোম ভিজিট' },
];
const MODES = new Set<QuickFilter>(['VIDEO', 'IN_PERSON', 'HOME_VISIT']);

function Pill({ label, active, onPress, icon }: { label: string; active: boolean; onPress: () => void; icon?: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`min-h-[40px] flex-row items-center rounded-full border px-3.5 ${active ? 'border-primary bg-primary' : 'border-line bg-surface-card active:bg-primary-50'}`}>
      {icon}
      <BanglaText
        className={`text-[14px] leading-[22px] ${icon ? 'ml-1.5' : ''} ${active ? 'font-bangla-semibold text-white' : 'font-bangla-medium text-ink'}`}>
        {label}
      </BanglaText>
    </Pressable>
  );
}

/** Find a doctor: name or BMDC search, specialty, quick filters. Guests can browse. */
export default function DoctorsTab() {
  // Home's "কোন সমস্যায়" cards open this tab with ?specialty=<slug>; the diet screen with ?type=NUTRITIONIST.
  const params = useLocalSearchParams<{ specialty?: string; type?: string }>();
  const paramType = TYPES.find((t) => t.value === params.type)?.value;
  const [type, setType] = useState<ProviderType>(paramType ?? 'DOCTOR');
  const [text, setText] = useState('');
  const [specialty, setSpecialty] = useState<string | null>(params.specialty ?? null);
  const [specialtyParam, setSpecialtyParam] = useState(params.specialty);
  const [typeParam, setTypeParam] = useState(paramType);
  if (params.specialty !== specialtyParam) {
    setSpecialtyParam(params.specialty);
    if (params.specialty) {
      setType('DOCTOR');
      setSpecialty(params.specialty);
    }
  }
  if (paramType !== typeParam) {
    setTypeParam(paramType);
    if (paramType) {
      setType(paramType);
      setSpecialty(null);
    }
  }
  const [quick, setQuick] = useState<QuickFilter | null>(null);
  const q = useDebouncedValue(text.trim());
  const specialties = useSpecialties(type);

  const filters = useMemo<ProviderSearchFilters>(
    () => ({
      type,
      q: q.length >= 2 ? q : undefined,
      specialty: specialty ?? undefined,
      onlineNow: quick === 'online' || undefined,
      gender: quick === 'female' ? 'FEMALE' : undefined,
      mode: quick && MODES.has(quick) ? (quick as ConsultationMode) : undefined,
    }),
    [type, q, specialty, quick]
  );
  const search = useProviderSearch(filters);
  const providers = search.data?.pages.flatMap((page) => page.data) ?? [];
  const [refreshing, setRefreshing] = useState(false);

  const header = (
    <View className="gap-4 pb-4">
      <View className="flex-row items-center rounded-2xl border border-line bg-surface-card px-4">
        <Search size={20} color={colors.inkMuted} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="নাম বা BMDC নম্বর দিয়ে খুঁজুন"
          placeholderTextColor={colors.inkSubtle}
          returnKeyType="search"
          className="ml-2.5 min-h-[50px] flex-1 font-bangla text-[16px] text-ink"
        />
        {text ? (
          <Pressable accessibilityLabel="মুছুন" hitSlop={10} onPress={() => setText('')}>
            <X size={18} color={colors.inkMuted} />
          </Pressable>
        ) : null}
      </View>

      <QuickConsultBanner />

      <View className="flex-row rounded-2xl bg-primary-100 p-1">
        {TYPES.map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: type === item.value }}
            onPress={() => {
              setType(item.value);
              setSpecialty(null);
              if (item.value !== 'DOCTOR' && quick === 'female') setQuick(null);
            }}
            className={`min-h-[42px] flex-1 items-center justify-center rounded-xl ${type === item.value ? 'bg-surface-card' : ''}`}>
            <BanglaText
              className={`text-[14px] leading-[22px] ${type === item.value ? 'font-bangla-semibold text-primary' : 'font-bangla-medium text-ink-muted'}`}>
              {item.label}
            </BanglaText>
          </Pressable>
        ))}
      </View>

      {specialties.data && specialties.data.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5" className="-mx-5" contentContainerStyle={{ paddingHorizontal: 20 }}>
          {specialties.data.map((item) => {
            const Icon = specialtyIcon(item.iconName);
            const active = specialty === item.slug;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSpecialty(active ? null : item.slug)}
                className={`w-[92px] items-center gap-1.5 rounded-2xl border px-2 py-3 ${active ? 'border-primary bg-primary-50' : 'border-line bg-surface-card'}`}>
                <View className={`h-11 w-11 items-center justify-center rounded-xl ${active ? 'bg-primary' : 'bg-primary-100'}`}>
                  <Icon size={22} color={active ? colors.white : colors.primary} />
                </View>
                <BanglaText numberOfLines={2} className="text-center text-[12px] leading-[17px] font-bangla-medium text-ink">
                  {item.nameBn}
                </BanglaText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" className="-mx-5" contentContainerStyle={{ paddingHorizontal: 20 }}>
        {QUICK_FILTERS.filter((f) => type === 'DOCTOR' || f.value !== 'female').map((item) => (
          <Pill
            key={item.value}
            label={item.label}
            active={quick === item.value}
            icon={item.value === 'online' ? <View className={`h-2 w-2 rounded-full ${quick === 'online' ? 'bg-white' : 'bg-success'}`} /> : undefined}
            onPress={() => setQuick(quick === item.value ? null : item.value)}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-2">
        <View className="flex-1">
          <BanglaText variant="title">ডাক্তার দেখান</BanglaText>
          <BanglaText variant="caption">চেম্বারে সিরিয়াল, ভিডিও বা চ্যাটে পরামর্শ</BanglaText>
        </View>
        <IconButton icon={MessagesSquare} label="আমার পরামর্শ" onPress={() => router.push('/consultations')} />
        <IconButton icon={CalendarClock} label="আমার অ্যাপয়েন্টমেন্ট" onPress={() => router.push('/appointments')} />
      </View>
      <View className="px-5 pb-1">
        <CurrentProfileChip />
      </View>
      <FlashList
        data={providers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 }}
        ListHeaderComponent={header}
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <DoctorCard
            provider={item}
            onPress={() => router.push({ pathname: '/doctors/[providerId]', params: { providerId: item.id } })}
          />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            colors={[colors.primary]}
            tintColor={colors.primary}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await search.refetch();
              } finally {
                setRefreshing(false);
              }
            }}
          />
        }
        ListEmptyComponent={
          search.isLoading ? (
            <View className="gap-3">
              <SkeletonBlock className="h-36" />
              <SkeletonBlock className="h-36" />
              <SkeletonBlock className="h-36" />
            </View>
          ) : search.isError ? (
            <ErrorState error={search.error} onRetry={() => void search.refetch()} />
          ) : (
            <EmptyState
              icon={q || specialty || quick ? SearchX : Stethoscope}
              title="কাউকে পাওয়া যায়নি"
              message="অন্য নামে খুঁজুন বা ফিল্টার সরিয়ে দেখুন।"
              actionLabel={q || specialty || quick ? 'ফিল্টার সরান' : undefined}
              onAction={() => {
                setText('');
                setSpecialty(null);
                setQuick(null);
              }}
            />
          )
        }
        ListFooterComponent={
          search.isFetchingNextPage ? <ActivityIndicator className="py-4" color={colors.primary} /> : null
        }
      />
    </SafeAreaView>
  );
}
