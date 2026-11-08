import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { CalendarDays, Clock3, X, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';

import { ActionButton } from './action-button';
import { BanglaText } from './bangla-text';

import { banglaClock, formatDate } from '@/lib/bangla-format';
import { colors, iconSize } from '@/theme/design-tokens';

/** "2026-11-08" ↔ a Date at local noon (no time-zone edge on the day). */
function dateFromString(value: string | null): Date {
  if (!value) return new Date();
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
}
function stringFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function dateFromTime(value: string | null): Date {
  const date = new Date();
  const [h, m] = (value ?? '08:00').split(':').map(Number) as [number, number];
  date.setHours(h, m, 0, 0);
  return date;
}
function timeFromDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface FieldShellProps {
  label: string;
  icon: LucideIcon;
  text: string | null;
  placeholder: string;
  onPress: () => void;
  onClear?: () => void;
  errorText?: string;
}

function FieldShell({
  label,
  icon: Icon,
  text,
  placeholder,
  onPress,
  onClear,
  errorText,
}: FieldShellProps) {
  return (
    <View className="gap-2">
      <BanglaText variant="label">{label}</BanglaText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${text ?? placeholder}`}
        onPress={onPress}
        className={`min-h-[52px] flex-row items-center gap-3 rounded-2xl border-[1.5px] bg-surface-card px-4 active:bg-primary-50 ${
          errorText ? 'border-danger' : 'border-line'
        }`}>
        <Icon
          size={iconSize.md}
          color={text ? colors.primary : colors.inkSubtle}
          strokeWidth={1.8}
        />
        <BanglaText className={`flex-1 ${text ? 'text-ink' : 'text-ink-subtle'}`}>
          {text ?? placeholder}
        </BanglaText>
        {text && onClear ? (
          <Pressable accessibilityLabel={`${label} মুছুন`} onPress={onClear} hitSlop={10}>
            <X size={18} color={colors.inkSubtle} />
          </Pressable>
        ) : null}
      </Pressable>
      {errorText ? (
        <BanglaText variant="caption" className="text-danger">
          {errorText}
        </BanglaText>
      ) : null}
    </View>
  );
}

/** iOS shows the picker in a sheet with a "done" button; Android uses its native dialog. */
function IosPickerSheet({
  visible,
  value,
  mode,
  minimumDate,
  maximumDate,
  onDone,
  onCancel,
}: {
  visible: boolean;
  value: Date;
  mode: 'date' | 'time';
  minimumDate?: Date;
  maximumDate?: Date;
  onDone: (date: Date) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/30" onPress={onCancel} />
      <View className="gap-3 rounded-t-3xl bg-surface-card px-5 pb-8 pt-4">
        <DateTimePicker
          value={draft}
          mode={mode}
          display="spinner"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={(_event, date) => date && setDraft(date)}
        />
        <ActionButton label="ঠিক আছে" onPress={() => onDone(draft)} />
      </View>
    </Modal>
  );
}

interface DateFieldProps {
  label: string;
  /** "YYYY-MM-DD" */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Show an ✕ to clear an optional date. */
  clearable?: boolean;
  errorText?: string;
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = 'তারিখ বেছে নিন',
  minimumDate,
  maximumDate,
  clearable = false,
  errorText,
}: DateFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dateFromString(value),
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) onChange(stringFromDate(date));
        },
      });
    } else {
      setIosOpen(true);
    }
  };
  return (
    <>
      <FieldShell
        label={label}
        icon={CalendarDays}
        text={value ? formatDate(value) : null}
        placeholder={placeholder}
        onPress={open}
        onClear={clearable ? () => onChange(null) : undefined}
        errorText={errorText}
      />
      {Platform.OS === 'ios' ? (
        <IosPickerSheet
          visible={iosOpen}
          value={dateFromString(value)}
          mode="date"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onCancel={() => setIosOpen(false)}
          onDone={(date) => {
            setIosOpen(false);
            onChange(stringFromDate(date));
          }}
        />
      ) : null}
    </>
  );
}

interface TimeFieldProps {
  label: string;
  /** "HH:MM" (Asia/Dhaka wall clock). */
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  errorText?: string;
}

export function TimeField({
  label,
  value,
  onChange,
  placeholder = 'সময় বেছে নিন',
  errorText,
}: TimeFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: dateFromTime(value),
        mode: 'time',
        is24Hour: false,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === 'set' && date) onChange(timeFromDate(date));
        },
      });
    } else {
      setIosOpen(true);
    }
  };
  return (
    <>
      <FieldShell
        label={label}
        icon={Clock3}
        text={value ? banglaClock(value) : null}
        placeholder={placeholder}
        onPress={open}
        errorText={errorText}
      />
      {Platform.OS === 'ios' ? (
        <IosPickerSheet
          visible={iosOpen}
          value={dateFromTime(value)}
          mode="time"
          onCancel={() => setIosOpen(false)}
          onDone={(date) => {
            setIosOpen(false);
            onChange(timeFromDate(date));
          }}
        />
      ) : null}
    </>
  );
}

/** Opens the native time picker directly (used by the dose time list). */
export function pickTime(current: string | null, onPicked: (time: string) => void): void {
  if (Platform.OS === 'android') {
    DateTimePickerAndroid.open({
      value: dateFromTime(current),
      mode: 'time',
      is24Hour: false,
      onChange: (event: DateTimePickerEvent, date?: Date) => {
        if (event.type === 'set' && date) onPicked(timeFromDate(date));
      },
    });
  }
}
