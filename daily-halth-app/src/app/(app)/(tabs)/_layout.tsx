import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Tabs } from 'expo-router';
import { HeartPulse, House, Pill, type LucideIcon } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BanglaText } from '@/components/ui/bangla-text';
import { colors, shadows } from '@/theme/design-tokens';

const TAB_ICONS: Record<string, LucideIcon> = {
  home: House,
  health: HeartPulse,
  medicine: Pill,
};

/**
 * Bottom bar (CLAUDE.md §7: হোম, প্রোফাইল, ডাক্তার, ওষুধ, কমিউনিটি). ডাক্তার and
 * কমিউনিটি join when their modules are built; a tab that leads nowhere is worse
 * than no tab.
 */
function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[shadows.raised, { paddingBottom: Math.max(insets.bottom, 10) }]}
      className="flex-row border-t border-line/60 bg-surface-card px-3 pt-2">
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = descriptors[route.key]?.options.title ?? route.name;
        const Icon = TAB_ICONS[route.name] ?? House;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            className="min-h-[52px] flex-1 items-center justify-center gap-1">
            <View
              // Inline style: NativeWind drops rounded-full when this class string toggles.
              style={{
                borderRadius: 16,
                backgroundColor: focused ? colors.primary100 : 'transparent',
              }}
              className="h-8 w-14 items-center justify-center">
              <Icon
                size={22}
                color={focused ? colors.primary : colors.inkSubtle}
                strokeWidth={focused ? 2.3 : 1.9}
              />
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
      <Tabs.Screen name="medicine" options={{ title: 'ওষুধ' }} />
    </Tabs>
  );
}
