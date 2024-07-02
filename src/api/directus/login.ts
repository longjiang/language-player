// @/src/api/directus/login.ts
import { DIRECTUS_URL } from '.';

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
        return data.data.token;
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

export async function fetchUserInfo(token: string) {
    const response = await fetch(`${DIRECTUS_URL}/users/me`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const data = await response.json();

    if (response.ok) {
        return data.data;
    } else {
        throw new Error(data.errors ? data.errors[0].message : 'Failed to fetch user info');
    }
}
