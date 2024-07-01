// @/src/auth/login.ts
import * as SecureStore from 'expo-secure-store';

import { DIRECTUS_URL } from '.'
import { fetchAndStoreUserInfo } from './user';

export async function login(email: string, password: string) {
    const response = await fetch(`${DIRECTUS_URL}/auth/authenticate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email: email,
            password: password
        })
    });

    const data = await response.json();

    if (response.ok) {
        await SecureStore.setItemAsync('access_token', data.data.token);
        await fetchAndStoreUserInfo();
        return data;
    } else {
        throw new Error(data.errors[0].message);
    }
}
