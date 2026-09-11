export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch('/api/v1' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await r.json();
  if (!r.ok) throw Error(body.error?.message ?? 'Request failed');
  return body;
}
export const number = (v: string | number | null | undefined) =>
  v === null || v === undefined
    ? '—'
    : typeof v === 'string' && /^-?\d+$/.test(v)
      ? BigInt(v).toLocaleString()
      : Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });
export const signed = (v: string | null) =>
  v === null ? '—' : `${BigInt(v) > 0n ? '+' : ''}${number(v)}`;
export const time = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not yet available';
