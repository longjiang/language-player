export function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format((cents || 0) / 100);
}

export function formatPercentFromBps(bps: number): string {
  return `${(Number(bps || 0) / 100).toFixed(2).replace(/\.00$/, '')}%`;
}
