import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Tabs } from 'expo-router';
import { HeartPulse, House, MessagesSquare, Pill, Stethoscope, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BanglaText } from '@/components/ui/bangla-text';
import { GUEST_TABS, openLogin, useIsGuest } from '@/features/auth/guest-access';
import { colors, shadows } from '@/theme/design-tokens';

const TAB_ICONS: Record<string, LucideIcon> = {
  home: House,
  health: HeartPulse,
  doctors: Stethoscope,
  medicine: Pill,
  community: MessagesSquare,
};

/** The raised round button in the middle of the bar. */
const CENTER_TAB = 'doctors';

/** Bottom bar (CLAUDE.md §7): হোম, প্রোফাইল, (ডাক্তার, raised in the middle), ওষুধ, কমিউনিটি. */
function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const isGuest = useIsGuest();
  return (
    <View
      style={[shadows.raised, { paddingBottom: Math.max(insets.bottom, 10) }]}
      className="flex-row items-end border-t border-line/60 bg-surface-card px-2 pt-2">
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = descriptors[route.key]?.options.title ?? route.name;
        const Icon = TAB_ICONS[route.name] ?? House;
        const onPress = () => {
          // Guests see home and doctors; the rest needs an account.
          if (isGuest && !GUEST_TABS.has(route.name)) {
            openLogin();
            return;
          }
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (route.name === CENTER_TAB) {
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={onPress}
              className="flex-1 items-center gap-1">
              <View
                style={[shadows.button, { marginTop: -30 }]}
                className="h-[64px] w-[64px] items-center justify-center rounded-full border-4 border-surface-card bg-primary active:bg-primary-700">
                <Icon size={28} color={colors.white} strokeWidth={2.2} />
              </View>
              <BanglaText
                className={`text-[12px] leading-[17px] ${focused ? 'font-bangla-semibold text-primary' : 'font-bangla-medium text-ink-subtle'}`}>
                {label}
              </BanglaText>
            </Pressable>
          );
        }

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            className="min-h-[52px] flex-1 items-center justify-center gap-1">
            <View style={{ height: 32, width: 52, alignItems: 'center', justifyContent: 'center' }}>
              {/* The pill keeps one colour and only fades: on Android (Fabric) a view whose
                  backgroundColor changes after mount loses its border radius. */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 16,
                  backgroundColor: colors.primary100,
                  opacity: focused ? 1 : 0,
                }}
              />
              <Icon size={22} color={focused ? colors.primary : colors.inkSubtle} strokeWidth={focused ? 2.3 : 1.9} />
            </View>
            <BanglaText
              className={`text-[12px] leading-[17px] ${focused ? 'font-bangla-semibold text-primary' : 'font-bangla-medium text-ink-subtle'}`}>
              {label}
            </BanglaText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.surface } }}>
      <Tabs.Screen name="home" options={{ title: 'হোম' }} />
      <Tabs.Screen name="health" options={{ title: 'প্রোফাইল' }} />
      <Tabs.Screen name="doctors" options={{ title: 'ডাক্তার' }} />
      <Tabs.Screen name="medicine" options={{ title: 'ওষুধ' }} />
      <Tabs.Screen name="community" options={{ title: 'কমিউনিটি' }} />
    </Tabs>
  );
}
