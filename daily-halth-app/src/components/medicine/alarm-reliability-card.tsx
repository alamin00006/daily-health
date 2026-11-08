import * as Device from 'expo-device';
import { AlarmClockOff, BatteryWarning, BellOff, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, Linking, Pressable, View } from 'react-native';

import { ActionButton } from '@/components/ui/action-button';
import { BanglaText } from '@/components/ui/bangla-text';
import { IconBadge } from '@/components/ui/icon-badge';
import {
  ensureNotificationPermission,
  hasNotificationPermission,
} from '@/features/notifications/notification-setup';
import { readJson, writeJson } from '@/lib/local-key-value-store';
import { colors } from '@/theme/design-tokens';
import {
  canScheduleExactAlarms,
  openExactAlarmSettings,
} from '@modules/exact-alarm-permission/src';

const BATTERY_TIP_DISMISSED = 'battery-tip-dismissed';
/** Brands that delay or kill alarms to save battery (CLAUDE.md §8). */
const AGGRESSIVE_BRANDS = [
  'xiaomi',
  'redmi',
  'poco',
  'oppo',
  'realme',
  'vivo',
  'iqoo',
  'oneplus',
  'huawei',
  'honor',
  'tecno',
  'infinix',
  'itel',
  'samsung',
];

const BRAND_STEPS: Record<string, string> = {
  xiaomi:
    'সেটিংস → অ্যাপস → দৈনিক স্বাস্থ্য → ব্যাটারি সেভার → "No restrictions", আর "Autostart" চালু করুন।',
  oppo: 'সেটিংস → ব্যাটারি → দৈনিক স্বাস্থ্য → "Allow background activity" চালু করুন।',
  vivo: 'সেটিংস → ব্যাটারি → Background power consumption → দৈনিক স্বাস্থ্য চালু করুন।',
  samsung: 'সেটিংস → অ্যাপস → দৈনিক স্বাস্থ্য → ব্যাটারি → "Unrestricted" বেছে নিন।',
};

function brandKey(): string | null {
  const brand = (Device.manufacturer ?? Device.brand ?? '').toLowerCase();
  const match = AGGRESSIVE_BRANDS.find((b) => brand.includes(b));
  if (!match) return null;
  if (['redmi', 'poco'].includes(match)) return 'xiaomi';
  if (['realme', 'oneplus'].includes(match)) return 'oppo';
  if (match === 'iqoo') return 'vivo';
  return match;
}

/**
 * Three things that silently stop or delay dose alarms: notification
 * permission, Android 14+'s "Alarms & reminders" switch (off by default, so
 * alarms come minutes late), and battery savers on Xiaomi/Oppo/Vivo phones.
 * Shown on the medicine screen until fixed or dismissed.
 */
export function AlarmReliabilityCard() {
  const [permission, setPermission] = useState<boolean | null>(null);
  const [exactAlarms, setExactAlarms] = useState(true);
  const [tipDismissed, setTipDismissed] = useState(true);
  const brand = brandKey();

  useEffect(() => {
    const check = () => {
      void hasNotificationPermission().then(setPermission);
      setExactAlarms(canScheduleExactAlarms());
    };
    check();
    void readJson<boolean>(BATTERY_TIP_DISMISSED).then((v) => setTipDismissed(v === true));
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);

  if (permission === false) {
    return (
      <View className="gap-3 rounded-3xl border border-danger/20 bg-danger-soft p-4">
        <View className="flex-row items-center gap-3">
          <IconBadge icon={BellOff} tone="danger" size="sm" />
          <View className="flex-1">
            <BanglaText variant="body-strong">অ্যালার্ম বাজবে না</BanglaText>
            <BanglaText variant="caption" className="text-ink">
              ওষুধের সময় মনে করাতে নোটিফিকেশনের অনুমতি দরকার।
            </BanglaText>
          </View>
        </View>
        <ActionButton
          label="অনুমতি দিন"
          size="sm"
          onPress={() =>
            void ensureNotificationPermission().then((granted) => {
              setPermission(granted);
              if (!granted) void Linking.openSettings();
            })
          }
        />
      </View>
    );
  }

  if (permission && !exactAlarms) {
    return (
      <View className="gap-3 rounded-3xl border border-warning/25 bg-warning-soft p-4">
        <View className="flex-row items-center gap-3">
          <IconBadge icon={AlarmClockOff} size="sm" />
          <View className="flex-1">
            <BanglaText variant="body-strong">অ্যালার্ম দেরিতে বাজতে পারে</BanglaText>
            <BanglaText variant="caption" className="text-ink">
              ঠিক সময়ে বাজাতে &ldquo;অ্যালার্ম ও রিমাইন্ডার&rdquo; অনুমতি চালু করুন।
            </BanglaText>
          </View>
        </View>
        <ActionButton label="চালু করুন" size="sm" onPress={openExactAlarmSettings} />
      </View>
    );
  }

  if (!brand || tipDismissed) return null;
  return (
    <View className="gap-3 rounded-3xl border border-warning/25 bg-warning-soft p-4">
      <View className="flex-row items-start gap-3">
        <IconBadge icon={BatteryWarning} size="sm" />
        <View className="flex-1 gap-1">
          <BanglaText variant="body-strong">অ্যালার্ম যেন দেরি না করে</BanglaText>
          <BanglaText variant="caption" className="text-ink">
            আপনার ফোন ব্যাটারি বাঁচাতে অ্যালার্ম দেরিতে দিতে পারে।{' '}
            {BRAND_STEPS[brand] ?? 'সেটিংসে গিয়ে দৈনিক স্বাস্থ্যের ব্যাটারি সীমা তুলে দিন।'}
          </BanglaText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="এই পরামর্শ আর দেখাবেন না"
          hitSlop={12}
          onPress={() => {
            setTipDismissed(true);
            void writeJson(BATTERY_TIP_DISMISSED, true);
          }}>
          <X size={18} color={colors.inkMuted} />
        </Pressable>
      </View>
      <ActionButton
        label="অ্যাপের সেটিংস খুলুন"
        variant="outline"
        size="sm"
        onPress={() => void Linking.openSettings()}
      />
    </View>
  );
}
