# Supabase email templates

Ready-to-paste HTML for every email template configured in Supabase Auth,
exported from the live project (`tfugoojrqybaoukgpqza`) via the Management API.

> **Only the Confirm signup template is customized.** The other templates are
> the Supabase defaults. They're checked in here so you have a full record and a
> starting point to brand them — paste the HTML into
> **Authentication → Email Templates** and edit.

## Index

| File | Template | Subject | Status |
|---|---|---|---|
| [`confirm-signup.html`](./confirm-signup.html) | Confirm signup | `Confirm your email` | **Customized** |
| [`reset-password.html`](./reset-password.html) | Reset password | `Reset your password` | Default |
| [`magic-link.html`](./magic-link.html) | Magic link | `Your sign-in link` | Default |
| [`invite-user.html`](./invite-user.html) | Invite user | `You've been invited` | Default |
| [`change-email.html`](./change-email.html) | Change email address | `Confirm your new email address` | Default |
| [`reauthentication.html`](./reauthentication.html) | Reauthentication | `{{ .Token }} is your verification code` | Default |
| [`password-changed.html`](./password-changed.html) | Password changed | `Your password was changed` | Default |
| [`email-changed.html`](./email-changed.html) | Email changed | `Your email address was changed` | Default |
| [`phone-changed.html`](./phone-changed.html) | Phone changed | `Your phone number was changed` | Default |
| [`signin-method-linked.html`](./signin-method-linked.html) | Sign-in method linked | `A new sign-in method was linked to your account` | Default |
| [`signin-method-removed.html`](./signin-method-removed.html) | Sign-in method removed | `A sign-in method was removed from your account` | Default |
| [`verification-method-added.html`](./verification-method-added.html) | Verification method added | `A new verification method was added to your account` | Default |
| [`verification-method-removed.html`](./verification-method-removed.html) | Verification method removed | `A verification method was removed from your account` | Default |

`_auth-config-mailer.json` is the raw Management API dump of every `mailer_*`
setting (subjects, contents, OTP length/expiry, security-notification toggles).
It's the canonical export record — don't hand-edit it.

## Re-exporting

The templates are pulled from the live project. To re-export after editing any
template in the Supabase dashboard:

```bash
cd zerotohero-python-server
# requires SUPABASE_ACCESS_TOKEN (sbp_...) + SUPABASE_URL in .env
python3.10 tmp/export_email_templates.py
```

## Confirm signup

The Confirm signup template is the only customized one. It shows both the
one-click confirmation link and the 8-digit verification code.

### How to use

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
