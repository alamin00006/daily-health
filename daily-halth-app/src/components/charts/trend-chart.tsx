import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { toBanglaDigits } from '@/lib/bangla-digits';
import { colors } from '@/theme/design-tokens';

export interface TrendSeries {
  /** Oldest first. */
  values: number[];
  color: string;
}

interface TrendChartProps {
  series: TrendSeries[];
  height?: number;
  /** Shaded "healthy" band, e.g. 90–130 for systolic. */
  normalBand?: { min: number; max: number };
}

const PAD = { top: 12, right: 12, bottom: 18, left: 34 };

/** Lightweight line chart for a vital's last readings (react-native-svg, no chart library). */
export function TrendChart({ series, height = 170, normalBand }: TrendChartProps) {
  const [width, setWidth] = useState(0);
  const all = series.flatMap((s) => s.values);
  const count = Math.max(...series.map((s) => s.values.length), 0);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  if (all.length < 2 || width === 0) {
    return <View style={{ height }} onLayout={onLayout} />;
  }

  const bandValues = normalBand ? [normalBand.min, normalBand.max] : [];
  const rawMin = Math.min(...all, ...bandValues);
  const rawMax = Math.max(...all, ...bandValues);
  const span = rawMax - rawMin || 1;
  const min = rawMin - span * 0.1;
  const max = rawMax + span * 0.1;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (count === 1 ? plotW / 2 : (index / (count - 1)) * plotW);
  const y = (value: number) => PAD.top + plotH - ((value - min) / (max - min)) * plotH;

  // Round labels to a readable step (150, 110, 70 rather than 151, 111, 71).
  const roundTo = span >= 40 ? 10 : span >= 10 ? 5 : span >= 2 ? 1 : 0.1;
  const nice = (value: number) => Math.round(value / roundTo) * roundTo;
  const ticks = [
    ...new Set([nice(max - span * 0.05), nice((max + min) / 2), nice(min + span * 0.05)]),
  ].map((value) => Number(value.toFixed(roundTo < 1 ? 1 : 0)));

  return (
    <View style={{ height }} onLayout={onLayout} accessibilityLabel="মাপের ধারা">
      <Svg width={width} height={height}>
        {normalBand ? (
          <Path
            d={`M${PAD.left} ${y(normalBand.max)} H${width - PAD.right} V${y(normalBand.min)} H${PAD.left} Z`}
            fill={colors.primary50}
          />
        ) : null}
        {ticks.map((tick) => (
          <SvgLabelLine key={tick} y={y(tick)} width={width} label={toBanglaDigits(tick)} />
        ))}
        {series.map((s, seriesIndex) => {
          const offset = count - s.values.length;
          const d = s.values
            .map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index + offset)} ${y(value)}`)
            .join(' ');
          return (
            <Path
              key={seriesIndex}
              d={d}
              stroke={s.color}
              strokeWidth={2.5}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {series.map((s, seriesIndex) => {
          const offset = count - s.values.length;
          const last = s.values.length - 1;
          return (
            <Circle
              key={`dot-${seriesIndex}`}
              cx={x(last + offset)}
              cy={y(s.values[last]!)}
              r={4.5}
              fill={colors.white}
              stroke={s.color}
              strokeWidth={2.5}
            />
          );
        })}
      </Svg>
    </View>
  );
}

function SvgLabelLine({ y, width, label }: { y: number; width: number; label: string }) {
  return (
    <>
      <Line
        x1={PAD.left}
        x2={width - PAD.right}
        y1={y}
        y2={y}
        stroke={colors.line}
        strokeDasharray="4 4"
      />
      <SvgText x={PAD.left - 6} y={y + 4} fontSize={11} fill={colors.inkSubtle} textAnchor="end">
        {label}
      </SvgText>
    </>
  );
}
