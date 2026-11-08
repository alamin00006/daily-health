import { AlarmClock, Check, Pill, Undo2, X } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { BanglaText } from '@/components/ui/bangla-text';
import { StatusPill } from '@/components/ui/status-pill';
import { DOSE_STATE_META, doseText, mealTimingText } from '@/features/medicine/medicine-display';
import { banglaClock } from '@/lib/bangla-format';
import type { DoseSlotResponse, RecordDoseRequest } from '@/shared-contracts/medicine.contract';
import { colors, shadows } from '@/theme/design-tokens';

interface DoseRowProps {
  dose: DoseSlotResponse;
  /** OWNER / CAREGIVER; viewers only see the state. */
  canAct: boolean;
  onAction: (status: RecordDoseRequest['status']) => void;
  busy?: boolean;
}

function SmallAction({
  label,
  icon: Icon,
  onPress,
  variant,
  disabled,
}: {
  label: string;
  icon: typeof Check;
  onPress: () => void;
  variant: 'primary' | 'plain';
  disabled?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-touch flex-row items-center gap-1.5 rounded-xl px-3.5 ${
        primary
          ? 'bg-primary active:bg-primary-700'
          : 'border border-line bg-surface-card active:bg-primary-50'
      } ${disabled ? 'opacity-50' : ''}`}>
      <Icon size={16} color={primary ? colors.white : colors.inkMuted} strokeWidth={2.2} />
      <BanglaText
        variant="label"
        className={`font-bangla-semibold ${primary ? 'text-white' : 'text-ink-muted'}`}>
        {label}
      </BanglaText>
    </Pressable>
  );
}

/** One dose of the day: time, medicine, amount, state, and what can be done now. */
export function DoseRow({ dose, canAct, onAction, busy = false }: DoseRowProps) {
  const meta = DOSE_STATE_META[dose.state];
  const meal = mealTimingText(dose.mealTiming, dose.mealOffsetMin);
  const open = dose.state === 'DUE' || dose.state === 'UPCOMING' || dose.state === 'SNOOZED';
  const done = dose.state === 'TAKEN' || dose.state === 'SKIPPED';
  const highlight = dose.state === 'DUE';

  return (
    <View
      style={highlight ? shadows.card : undefined}
      className={`gap-3 rounded-3xl border p-4 ${
        highlight ? 'border-warning/30 bg-surface-card' : 'border-line/70 bg-surface-card'
      } ${dose.state === 'TAKEN' ? 'opacity-90' : ''}`}>
      <View className="flex-row items-start gap-3">
        <View
          className={`h-11 w-11 items-center justify-center rounded-2xl ${
            dose.state === 'TAKEN'
              ? 'bg-success-soft'
              : highlight
                ? 'bg-warning-soft'
                : 'bg-primary-50'
          }`}>
          {dose.state === 'TAKEN' ? (
            <Check size={22} color={colors.success} strokeWidth={2.5} />
          ) : (
            <Pill size={21} color={highlight ? colors.warning : colors.primary} strokeWidth={2} />
          )}
        </View>
        <View className="flex-1 gap-0.5">
          <BanglaText variant="body-strong" numberOfLines={1}>
            {dose.displayName}
          </BanglaText>
          <BanglaText variant="caption">
            {banglaClock(dose.time)} · {doseText(dose.dose, dose.doseUnit)}
            {meal ? ` · ${meal}` : ''}
          </BanglaText>
        </View>
        <StatusPill label={meta.label} tone={meta.tone} />
      </View>

      {canAct && open ? (
        <View className="flex-row flex-wrap gap-2">
          <SmallAction
            label="সেবন করেছি"
            icon={Check}
            variant="primary"
            disabled={busy}
            onPress={() => onAction('TAKEN')}
          />
          <SmallAction
            label="১০ মিনিট পরে"
            icon={AlarmClock}
            variant="plain"
            disabled={busy}
            onPress={() => onAction('SNOOZED')}
          />
          <SmallAction
            label="বাদ"
            icon={X}
            variant="plain"
            disabled={busy}
            onPress={() => onAction('SKIPPED')}
          />
        </View>
      ) : null}
      {canAct && done ? (
        <View className="flex-row">
          <SmallAction
            label="ফিরিয়ে নিন"
            icon={Undo2}
            variant="plain"
            disabled={busy}
            onPress={() => onAction('PENDING')}
          />
        </View>
      ) : null}
    </View>
  );
}
