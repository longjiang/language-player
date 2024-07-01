// @/auth.js
import * as SecureStore from 'expo-secure-store';

import { DIRECTUS_URL } from "@/src/api/directus";

export async function login(email, password) {
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
        return data;
    } else {
        throw new Error(data.errors[0].message);
    }
}

export async function getStoredToken() {
    return await SecureStore.getItemAsync('access_token');
}

export async function logout() {
    await SecureStore.deleteItemAsync('access_token');
}
