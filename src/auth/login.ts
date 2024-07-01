// @/src/auth/login.ts
import * as SecureStore from 'expo-secure-store';

const DIRECTUS_URL = "https://directusvps.zerotohero.ca/zerotohero";

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
        await storeUserInfo();
        return data;
    } else {
        throw new Error(data.errors[0].message);
    }
}

export async function storeUserInfo() {
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

export async function getStoredUserInfo() {
    const userInfo = await SecureStore.getItemAsync('user_info');
    return userInfo ? JSON.parse(userInfo) : null;
}

export async function logout() {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('user_info');
}
