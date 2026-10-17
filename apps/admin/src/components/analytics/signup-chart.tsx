'use client';

import { useT } from '@/hooks/use-t';
import {
  areaPath,
  formatChartDay,
  formatChartDayLong,
  niceScale,
  pickLabelIndices,
  smoothPath,
} from '@/lib/chart';
import type { SignupDay } from '@/types/analytics';
import { useId, useMemo, useState } from 'react';

const WIDTH = 960;
const HEIGHT = 320;
const PADDING = { top: 16, right: 20, bottom: 40, left: 56 };
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
const MAX_X_LABELS = 7;

interface SignupChartProps {
  days: SignupDay[];
}

/**
 * Hand-rolled SVG area chart (no chart dependency, semantic tokens only).
 * Hover/pointer movement selects the nearest day and shows its exact count.
 */
export function SignupChart({ days }: SignupChartProps) {
  const t = useT();
  const rawId = useId();
  const gradientId = `signup-gradient-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [active, setActive] = useState<number | null>(null);

  const scale = useMemo(
    () => niceScale(Math.max(0, ...days.map((day) => day.count)), 4),
    [days],
  );

  const points = useMemo(() => {
    const count = days.length;
    return days.map((day, index) => ({
      ...day,
      x:
        count <= 1
          ? PADDING.left + PLOT_WIDTH / 2
          : PADDING.left + (index / (count - 1)) * PLOT_WIDTH,
      y:
        PADDING.top +
        PLOT_HEIGHT -
        (scale.max > 0 ? (day.count / scale.max) * PLOT_HEIGHT : 0),
    }));
  }, [days, scale.max]);

  const labelIndices = useMemo(
    () => pickLabelIndices(days.length, MAX_X_LABELS),
    [days.length],
  );

  if (points.length === 0) return null;

  const baselineY = PADDING.top + PLOT_HEIGHT;
  const line = smoothPath(points);
  const area = areaPath(points, baselineY);
  const activeIndex =
    active !== null && active >= 0 && active < points.length ? active : null;
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const tooltipLeft = activePoint
    ? Math.min(88, Math.max(12, (activePoint.x / WIDTH) * 100))
    : 0;

  function handlePointer(event: React.PointerEvent<SVGRectElement>) {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (x - PADDING.left) / PLOT_WIDTH;
    const index = Math.round(ratio * Math.max(0, days.length - 1));
    setActive(Math.min(days.length - 1, Math.max(0, index)));
  }

  return (
    <div className="relative" onPointerLeave={() => setActive(null)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={t('title.signup_analytics')}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.3 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.02 }}
            />
          </linearGradient>
        </defs>

        {scale.ticks.map((tick) => {
          const y = baselineY - (tick / scale.max) * PLOT_HEIGHT;
          return (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeWidth={1}
                strokeDasharray={tick === 0 ? undefined : '4 4'}
              />
              <text
                x={PADDING.left - 10}
                y={y + 4}
                textAnchor="end"
                fontSize={12}
                className="fill-muted-foreground"
              >
                {tick}
              </text>
            </g>
          );
        })}

        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          className="stroke-primary"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {activePoint && (
          <>
            <line
              x1={activePoint.x}
              x2={activePoint.x}
              y1={PADDING.top}
              y2={baselineY}
              className="stroke-muted-foreground"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r={4.5}
              className="fill-primary stroke-card"
              strokeWidth={2}
            />
          </>
        )}

        {labelIndices.map((index) => {
          const point = points[index]!;
          return (
            <text
              key={point.date}
              x={point.x}
              y={baselineY + 24}
              textAnchor="middle"
              fontSize={12}
              className="fill-muted-foreground"
            >
              {formatChartDay(point.date)}
            </text>
          );
        })}

        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          fill="transparent"
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
        />
      </svg>

      {activePoint && (
        <div
          className="pointer-events-none absolute top-2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: `${tooltipLeft}%` }}
        >
          <div className="font-medium">{formatChartDayLong(activePoint.date)}</div>
          <div className="mt-0.5 text-muted-foreground">
            {t('label.new_signups')}: {activePoint.count}
          </div>
        </div>
      )}
    </div>
  );
}
