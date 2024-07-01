// @/src/api/directus/user.ts
import * as SecureStore from 'expo-secure-store';

import { DIRECTUS_URL } from '.'

export type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  last_access_on: string;
  role: number;
  status: string;
};

export async function fetchAndStoreUserInfo() {
  const token = await SecureStore.getItemAsync('access_token');
  if (!token) throw new Error('No access token found');

  const response = await fetch(`${DIRECTUS_URL}/users/me`, {
      headers: {
          'Authorization': `Bearer ${token}`
      }
  });

  const data = await response.json();

  if (response.ok) {
      await SecureStore.setItemAsync('user_info', JSON.stringify(data.data));
  } else {
      throw new Error(data.errors ? data.errors[0].message : 'Failed to fetch user info');
  }
}

export async function getStoredUserInfo(): Promise<User | null> {
  const userInfo = await SecureStore.getItemAsync('user_info');
  return userInfo ? JSON.parse(userInfo) : null;
}

export async function logout() {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('user_info');
}