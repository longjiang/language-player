import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type {
  AdminSubscription,
  AdminUserSummary,
  SubscriptionInput,
  UserDetail,
} from '@/types/admin';

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || data?.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

export async function searchUsers(query: string, limit = 20): Promise<AdminUserSummary[]> {
  const url = `${PYTHON_API_URL}/admin/users/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await authenticatedFetch(url);
  const data = await parseJson<{ users: AdminUserSummary[] }>(res);
  return data.users ?? [];
}

export async function fetchUserDetail(userId: string): Promise<UserDetail> {
  const res = await authenticatedFetch(`${PYTHON_API_URL}/admin/users/${encodeURIComponent(userId)}`);
  return parseJson<UserDetail>(res);
}

export async function grantSubscription(
  userId: string,
  input: SubscriptionInput,
): Promise<AdminSubscription> {
  const res = await authenticatedFetch(
    `${PYTHON_API_URL}/admin/users/${encodeURIComponent(userId)}/subscriptions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return parseJson<AdminSubscription>(res);
}

export async function changeSubscription(
  subscriptionId: number,
  input: Partial<SubscriptionInput>,
): Promise<AdminSubscription> {
  const res = await authenticatedFetch(
    `${PYTHON_API_URL}/admin/subscriptions/${subscriptionId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return parseJson<AdminSubscription>(res);
}

export async function removeSubscription(
  subscriptionId: number,
): Promise<{ success: boolean }> {
  const res = await authenticatedFetch(
    `${PYTHON_API_URL}/admin/subscriptions/${subscriptionId}`,
    { method: 'DELETE' },
  );
  return parseJson<{ success: boolean }>(res);
}
