// @/src/auth/login.ts
import { DIRECTUS_URL } from '.'

export async function registerUser(firstName, lastName, email, password) {
  const response = await fetch(`${DIRECTUS_URL}/users`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email: email,
          password: password,
          role: "user" // Assuming there's a role called "user"
      })
  });

  const data = await response.json();

  if (!response.ok) {
      throw new Error(data.errors ? data.errors[0].message : 'Failed to register user');
  }

  return data.data;
}