import { PYTHON_API_URL } from '@/lib/api-url';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type {
  AdminPrivilegeResult,
  AdminSubscription,
  AdminUserSummary,
  DeleteUserResult,
  SubscriptionInput,
  UserDetail,
} from '@/types/admin';

/**
 * A failed admin API call. `code` is the machine-readable reason a route
 * returns next to `error` (the four user-deletion guards), so the UI can show
 * a translated message instead of the English fallback. Existing callers that
 * only read `.message` keep working.
 */
export class AdminApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

async function readError(res: Response): Promise<AdminApiError> {
  try {
    const data = await res.json();
    return new AdminApiError(
      data?.error || data?.message || `HTTP ${res.status}`,
      res.status,
      typeof data?.code === 'string' ? data.code : undefined,
    );
  } catch {
    return new AdminApiError(`HTTP ${res.status}`, res.status);
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw await readError(res);
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

export async function setUserAdmin(
  userId: string,
  isAdmin: boolean,
): Promise<AdminPrivilegeResult> {
  const res = await authenticatedFetch(
    `${PYTHON_API_URL}/admin/users/${encodeURIComponent(userId)}/admin`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin }),
    },
  );
  return parseJson<AdminPrivilegeResult>(res);
}

/**
 * Permanently delete a user account (SPEC-060 § Danger zone). The four guards
 * (self, other admins, active auto-renewing subscription, affiliate history)
 * come back as `AdminApiError.code`.
 */
export async function deleteUser(userId: string): Promise<DeleteUserResult> {
  const res = await authenticatedFetch(
    `${PYTHON_API_URL}/admin/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  return parseJson<DeleteUserResult>(res);
}
