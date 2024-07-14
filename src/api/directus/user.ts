// @/src/api/directus/user.ts
import { DIRECTUS_URL } from '.';
import * as SecureStore from 'expo-secure-store';

export type User = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  last_access_on: string;
  role: number;
  status: string;
};

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
        throw new Error(data.error.message);
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
    const response = await fetch(`${DIRECTUS_URL}/users/me?_=${new Date().getTime()}`, {
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


export async function registerUser(firstName: string, lastName: string, email: string, password: string) {
  const registerResponse = await fetch(`${DIRECTUS_URL}/users`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: email,
          password: password,
          role: 3 // Assuming role 3 is the "user" role
      })
  });

  const registerData = await registerResponse.json();

  if (!registerResponse.ok) {
      throw new Error(registerData.errors ? registerData.errors[0].message : 'Failed to register user');
  }

  // Secure store the password
  await SecureStore.setItemAsync('user_password', password);

  return registerData;
}