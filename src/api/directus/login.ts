// @/src/auth/login.ts
import * as SecureStore from 'expo-secure-store';

import { DIRECTUS_URL } from '.'; // Ensure you have the correct import for your config file
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
        const token = data.data.token;
        await SecureStore.setItemAsync('authToken', token);
        await fetchAndStoreUserInfo();
        return token;
    } else {
        throw new Error(data.errors[0].message);
    }
}

export async function checkToken(token: string) {
    const response = await fetch(`${DIRECTUS_URL}/users/me`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    return response.ok;
}
