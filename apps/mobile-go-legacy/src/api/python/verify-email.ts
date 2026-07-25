// @/auth.js
import { PYTHON_SERVER } from '.';

export async function sendVerificationEmail(email: string) {
    const response = await fetch(`${PYTHON_SERVER}/verification_email`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send verification email');
    }
}

export async function verifyEmailCode(email: string, code: string) {
    const response = await fetch(`${PYTHON_SERVER}/verification_email/verify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, code }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to verify code');
    }

    return await response.json();
}
