export function fmt(
  n: number | null | undefined,
  opts: { decimals?: number; prefix?: string; suffix?: string; sign?: boolean } = {},
): string {
  if (n == null || Number.isNaN(n)) return '—';
  const { decimals = 2, prefix = '', suffix = '', sign = false } = opts;
  const withSep = n.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const s = sign && n > 0 ? '+' : '';
  return `${prefix}${s}${withSep}${suffix}`;
}

export function pct(
  n: number | null | undefined,
  opts: { decimals?: number; sign?: boolean } = {},
): string {
  const { decimals = 2, sign = true } = opts;
  if (n == null || Number.isNaN(n)) return '—';
  return `${sign && n > 0 ? '+' : ''}${n.toFixed(decimals)}%`;
}

export function timeAgo(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))} min`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}j`;
}

export function daysAgo(dateStr: string): string {
  const diff = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff <= 0) return "aujourd'hui";
  if (diff === 1) return 'hier';
  if (diff < 7) return `il y a ${diff}j`;
  if (diff < 30) return `il y a ${Math.round(diff / 7)} sem.`;
  if (diff < 365) return `il y a ${Math.round(diff / 30)} mois`;
  return `il y a ${Math.round(diff / 365)} an${diff >= 730 ? 's' : ''}`;
}

export function frDate(
  dateStr: string | Date,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' },
): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', opts);
}

export function cleanTicker(t: string): string {
  return t.replace('.PA', '').replace('.DE', '').replace('.AS', '').replace('.B', '');
}
