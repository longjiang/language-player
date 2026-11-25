'use client';

import * as React from 'react';
import type { TimeZone } from '@vvo/tzdb';
import { Check, ChevronsUpDown, Globe, Loader2 } from 'lucide-react';
import { useT } from '@/hooks/use-t';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export interface TimezoneSelectProps {
  /** IANA zone name, e.g. `America/Vancouver`. */
  value: string;
  onChange: (timeZone: string) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Searchable IANA time-zone picker.
 *
 * A native `<select>` with ~400 zone names is unusable (you cannot search by
 * city, country, or offset). This renders a cmdk list so typing filters by
 * city, country name/code, IANA name and aliases, abbreviation, and UTC offset.
 *
 * The list expands **inline** rather than in a portalled popover: a portalled
 * input inside a Radix `Dialog` loses focus to the dialog's focus trap (a known
 * shadcn/Radix issue), and an inline panel keeps focus where the dialog expects
 * it. It therefore works in a modal form as well as on a page.
 *
 * Zone metadata comes from `@vvo/tzdb` (IANA names, countries, main cities,
 * current offsets). It is imported dynamically the first time the picker is
 * opened and cached for the session, so listing pages do not pay for it.
 *
 * Reusable: any admin form that needs a zone should use this rather than a
 * `<select>`; there is no coupon-specific logic here.
 */
export function TimezoneSelect({
  value,
  onChange,
  id,
  disabled,
  className,
}: TimezoneSelectProps) {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const [zones, setZones] = React.useState<TimeZone[] | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open || zones) return;
    let cancelled = false;
    loadTimeZones().then((loaded) => {
      if (!cancelled) setZones(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [open, zones]);

  // Close on an outside pointer press; Escape is handled below so it closes the
  // picker instead of the surrounding dialog.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const selectedLabel = displayName(value);
  const selectedOffset = zoneOffsetLabel(value);

  return (
    <div
      ref={rootRef}
      className={cn('relative', className)}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <Button
        id={id}
        type="button"
        variant="outline"
        size="sm"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="w-full justify-between px-3 font-normal"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{selectedLabel}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{selectedOffset}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
          <Command>
            <CommandInput placeholder={t('placeholder.search_timezone')} autoFocus />
            <CommandList className="max-h-64">
              {!zones ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('msg.loading')}
                </div>
              ) : (
                <>
                  <CommandEmpty>{t('msg.no_results')}</CommandEmpty>
                  {zones.map((zone) => {
                    const city = primaryCity(zone);
                    const selected = zone.name === value || displayName(zone.name) === value;
                    return (
                      <CommandItem
                        key={zone.name}
                        value={searchText(zone)}
                        onSelect={() => {
                          onChange(zone.name);
                          setOpen(false);
                        }}
                        className="gap-2"
                      >
                        <Check
                          className={cn(
                            'h-4 w-4 shrink-0',
                            selected ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            {city}, {zone.countryName}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {displayName(zone.name)}
                            {zone.alternativeName ? ` · ${zone.alternativeName}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatOffset(zone.currentTimeOffsetInMinutes)}
                        </span>
                      </CommandItem>
                    );
                  })}
                </>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────

let zoneCache: TimeZone[] | null = null;
let zonePromise: Promise<TimeZone[]> | null = null;

function loadTimeZones(): Promise<TimeZone[]> {
  if (zoneCache) return Promise.resolve(zoneCache);
  zonePromise ??= import('@vvo/tzdb').then(({ getTimeZones }) => {
    // Sorted by current UTC offset; includes Etc/UTC.
    zoneCache = getTimeZones({ includeUtc: true });
    return zoneCache;
  });
  return zonePromise;
}

// ── Formatting ────────────────────────────────────────────────────────

/** `-480` → `UTC-08:00`. */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  return `UTC${sign}${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

/** Current offset for an arbitrary IANA name, via the browser's tz data. */
function zoneOffsetLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date());
    const raw = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    return raw === 'GMT' ? 'UTC' : raw.replace('GMT', 'UTC');
  } catch {
    return 'UTC';
  }
}

function primaryCity(zone: TimeZone): string {
  if (zone.mainCities.length > 0) return zone.mainCities[0]!;
  const tail = zone.name.split('/').pop() ?? zone.name;
  return tail.replace(/_/g, ' ');
}

function displayName(name: string): string {
  return name === 'Etc/UTC' ? 'UTC' : name;
}

/** Everything cmdk filters on: city, country, IANA name/aliases, offset. */
function searchText(zone: TimeZone): string {
  return [
    zone.name,
    zone.countryName,
    zone.countryCode,
    ...zone.mainCities,
    ...zone.group,
    zone.alternativeName,
    zone.abbreviation,
    zone.currentAbbreviation,
    offsetVariants(zone.currentTimeOffsetInMinutes),
  ]
    .filter(Boolean)
    .join(' ');
}

/** Offset spellings so "UTC+5", "UTC+05:00", "GMT-8" and "-08:00" all match. */
function offsetVariants(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60);
  const remainder = absolute % 60;
  const padded = `${sign}${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  const compact = `${sign}${hours}${remainder ? `:${String(remainder).padStart(2, '0')}` : ''}`;
  return `UTC${padded} UTC${compact} GMT${compact} ${padded}`;
}
