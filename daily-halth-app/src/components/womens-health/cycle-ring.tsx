import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { daysBetween } from '@/features/womens-health/cycle-dates';
import type { CycleOverviewResponse } from '@/shared-contracts/womens-health.contract';

const ROSE = '#c2475e';
const ROSE_SOFT = '#fbe4e8';
const FERTILE = '#e7a1b0';
const OVULATION = '#8f2a3f';

interface CycleRingProps {
  overview: CycleOverviewResponse;
  size?: number;
  children?: ReactNode;
}

/**
 * The cycle as a ring: one lap = the average cycle. Period days in rose, the
 * fertile window lighter, ovulation as a dot, and today as a white marker.
 */
export function CycleRing({ overview, size = 232, children }: CycleRingProps) {
  const stroke = 18;
  const r = (size - stroke) / 2 - 4;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const n = overview.avgCycleDays;
  const last = overview.lastPeriod;

  // Days are 1-based positions within the cycle.
  const arc = (fromDay: number, toDay: number, color: string, key: string) => {
    const from = Math.max(1, fromDay);
    const to = Math.min(n, toDay);
    if (to < from) return null;
    const len = ((to - from + 1) / n) * circ;
    return (
      <Circle
        key={key}
        cx={c}
        cy={c}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${Math.max(len - 3, 1)} ${circ}`}
        rotation={((from - 1) / n) * 360}
        origin={`${c}, ${c}`}
      />
    );
  };

  const point = (day: number) => {
    const angle = ((day - 0.5) / n) * 2 * Math.PI;
    return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle) };
  };

  const periodDays = last?.periodDays ?? overview.avgPeriodDays;
  const fertileFrom = last && overview.fertileStart ? daysBetween(last.startDate, overview.fertileStart) + 1 : null;
  const fertileTo = last && overview.fertileEnd ? daysBetween(last.startDate, overview.fertileEnd) + 1 : null;
  const ovulationDay = last && overview.ovulationDate ? daysBetween(last.startDate, overview.ovulationDate) + 1 : null;
  const today = overview.cycleDay ? point(Math.min(overview.cycleDay, n)) : null;
  const ovulation = ovulationDay && ovulationDay >= 1 && ovulationDay <= n ? point(ovulationDay) : null;

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation={-90} origin={`${c}, ${c}`}>
          <Circle cx={c} cy={c} r={r} stroke={ROSE_SOFT} strokeWidth={stroke} fill="none" />
          {last ? arc(1, periodDays, ROSE, 'period') : null}
          {fertileFrom && fertileTo ? arc(fertileFrom, fertileTo, FERTILE, 'fertile') : null}
          {ovulation ? <Circle cx={ovulation.x} cy={ovulation.y} r={5} fill={OVULATION} /> : null}
          {today ? (
            <Circle cx={today.x} cy={today.y} r={stroke / 2 + 3} fill="#ffffff" stroke={ROSE} strokeWidth={4} />
          ) : null}
        </G>
      </Svg>
      {children}
    </View>
  );
}
