import { apiClient } from './client';
import type { User } from '@langplayer/shared';

export function useAuth() {
  return {
    /** Log in with email + password. Returns user + JWT. */
    login: (email: string, password: string) =>
      apiClient.post<{ user: User; token: string }>('/auth/login', { email, password }),

    /** Register a new account. */
    register: (email: string, password: string, name?: string) =>
      apiClient.post<{ user: User; token: string }>('/auth/register', { email, password, name }),

    /** Refresh the JWT. */
    refreshToken: () => apiClient.post<{ token: string }>('/auth/refresh'),

    /** Log out (invalidate token server-side). */
    logout: () => apiClient.post<void>('/auth/logout'),

    /** Get the current user profile. */
    me: () => apiClient.get<User>('/auth/me'),

    /** Update user preferences. */
    updatePreferences: (prefs: Partial<User['preferences']>) =>
      apiClient.put<User>('/auth/preferences', prefs),
  };
}
