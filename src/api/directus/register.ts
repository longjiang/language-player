// @/src/api/directus/register.ts
import { DIRECTUS_URL } from '.';

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

  return registerData;
}
