# Confirm signup email template

Ready-to-paste HTML for Supabase's **Confirm signup** email template. It shows
both the one-click confirmation link and the 6-digit verification code.

## How to use

1. Open the Supabase dashboard → **Authentication → Email Templates → Confirm signup**.
2. Paste the contents of [`confirm-signup.html`](./confirm-signup.html) into the
   **HTML content** field.
3. Make sure **Authentication → URL Configuration** has:
   - **Site URL** set to your app origin (e.g. `https://languageplayer.io`)
   - `/auth/confirm` in **Redirect URLs** if you use the default
     `{{ .ConfirmationURL }}` flow

The template uses these Supabase variables:

| Variable | Purpose |
|---|---|
| `{{ .SiteURL }}` | App origin for the confirmation link |
| `{{ .TokenHash }}` | Hashed token for the `/auth/confirm` custom link |
| `{{ .Token }}` | 6-digit code shown as a fallback |

## Logo

The template points at the hosted circle logo:

```
https://language-player.netlify.app/_next/image?url=%2Fimg%2Flogo.png&w=128&q=80
```

If a client has trouble loading the optimized URL, you can swap it for the
static asset instead:

```
https://language-player.netlify.app/img/logo.png
```

## Notes

- The custom link goes to `/auth/confirm?token_hash=...`, which the web app
  exchanges for a session and uses to log the user in directly.
- If your email provider rewrites or prefetches links, users can still use the
  code on the verification screen.
