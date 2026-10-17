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
import type { AnalyticsMetric, AnalyticsPoint } from '@/types/analytics';
import { useId, useMemo, useState } from 'react';

const WIDTH = 960;
const HEIGHT = 320;
const PADDING = { top: 16, right: 20, bottom: 40, left: 72 };
const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;
const MAX_X_LABELS = 7;

interface MetricChartProps {
  days: AnalyticsPoint[];
  metric: AnalyticsMetric;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en').format(value);
}

/** Compact y-axis money: `$0`, `$380`, `$1.5k`, `$200k`, `$1.2m`. */
function compactUsd(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  }
  if (value >= 1000) {
    const thousands = value / 1000;
    return `$${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `$${Math.round(value)}`;
}

/**
 * Hand-rolled SVG area chart for either daily signups or estimated revenue.
 * No chart dependency; colors come from semantic tokens and the curve uses
 * monotone cubic interpolation so a non-negative series cannot dip below zero.
 */
export function MetricChart({ days, metric }: MetricChartProps) {
  const t = useT();
  const rawId = useId();
  const gradientId = `metric-gradient-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [active, setActive] = useState<number | null>(null);

  const label = metric === 'revenue' ? t('label.revenue') : t('label.new_signups');
  const formatValue = metric === 'revenue' ? formatUsd : formatCount;
  const formatAxis = metric === 'revenue' ? compactUsd : formatCount;

  const scale = useMemo(() => niceScale(Math.max(0, ...days.map((day) => day.value)), 4), [days]);

  const points = useMemo(() => {
    const count = days.length;
    return days.map((day, index) => ({
      ...day,
      x:
        count <= 1
          ? PADDING.left + PLOT_WIDTH / 2
          : PADDING.left + (index / (count - 1)) * PLOT_WIDTH,
      y: PADDING.top + PLOT_HEIGHT - (scale.max > 0 ? (day.value / scale.max) * PLOT_HEIGHT : 0),
    }));
  }, [days, scale.max]);

  const labelIndices = useMemo(() => pickLabelIndices(days.length, MAX_X_LABELS), [days.length]);

  if (points.length === 0) return null;

  const baselineY = PADDING.top + PLOT_HEIGHT;
  const line = smoothPath(points);
  const area = areaPath(points, baselineY);
  const activeIndex = active !== null && active >= 0 && active < points.length ? active : null;
  const activePoint = activeIndex === null ? null : points[activeIndex];
  const tooltipLeft = activePoint ? Math.min(88, Math.max(12, (activePoint.x / WIDTH) * 100)) : 0;

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
    <div className="-mx-1 overflow-x-auto px-1">
      <div className="relative min-w-[640px]" onPointerLeave={() => setActive(null)}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full"
          role="img"
          aria-label={label}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.3 }} />
              <stop offset="100%" style={{ stopColor: 'hsl(var(--primary))', stopOpacity: 0.02 }} />
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
                  fontSize={14}
                  className="fill-muted-foreground"
                >
                  {formatAxis(tick)}
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
                fontSize={14}
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
              {label}: {formatValue(activePoint.value)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
