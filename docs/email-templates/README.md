# Confirm signup email template

Ready-to-paste HTML for Supabase's **Confirm signup** email template. It shows
both the one-click confirmation link and the 8-digit verification code.

## How to use

1. Open the Supabase dashboard → **Authentication → Email Templates → Confirm signup**.
2. Paste the contents of [`confirm-signup.html`](./confirm-signup.html) into the
   **HTML content** field.
3. Make sure **Authentication → URL Configuration** has:
   - **Site URL** set to your app origin (e.g. `https://languageplayer.io`)
   - `/auth/confirm` in **Redirect URLs** only if you switch the button to the
     custom `{{ .SiteURL }}/auth/confirm?token_hash=...` link

The template uses these Supabase variables:

| Variable | Purpose |
|---|---|
| `{{ .ConfirmationURL }}` | One-click confirmation link (works for Classic and the new web app) |
| `{{ .SiteURL }}` | App origin; the default confirmation redirect lands here with the session fragment |
| `{{ .TokenHash }}` | Hashed token, only needed if you switch to the custom `/auth/confirm` link |
| `{{ .Token }}` | 8-digit code shown as a fallback |

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

- The button uses the default `{{ .ConfirmationURL }}`: GoTrue verifies the
  token, then redirects to the Site URL with the session in the URL fragment.
  Classic (`plugins/main.js`) cleans the fragment and shows
  `/login?verified=1`; the new web app's root-layout handler exchanges it and
  lands on the "You're all set!" page.
- The custom `{{ .SiteURL }}/auth/confirm?token_hash=...` link only works when
  the Site URL is owned by the new web app — Classic has no `/auth/confirm`
  route and would 404.
- If your email provider rewrites or prefetches links, users can still use the
  code on the verification screen.
