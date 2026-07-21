# Logging In

Sign in to your account, reset a forgotten password, and sign out when you're done.

## How to Log In

1. Go to the **[login page](/login)** by clicking the user icon in the top-right corner and selecting **{$action.log_in}**
2. Enter your **{$placeholder.email}** and **{$placeholder.password}**
3. Click **{$action.log_in}**

If your credentials are correct, you'll be redirected to the language selection page (or back to the page you were on before logging in).

If you enter the wrong email or password, an error message appears — double-check both fields and try again.

## Don't Have an Account?

Click **{$action.sign_up}** below the login form to create a new account. See [Registration](/docs/account/registration) for the full sign-up walkthrough.

## Forgot Your Password?

If you can't remember your password:

1. On the login page, click **{$action.forgot_password}**
2. Enter your email address and click **{$action.send_reset_link}**
3. Check your inbox for a password reset email
4. Follow the link in the email to set a new password

For security, the page always shows a success message after you submit — even if the email isn't registered. This prevents anyone from checking whether a particular email has an account.

> **Note:** The password reset link comes from Directus, our identity provider. If you don't see the email within a few minutes, check your spam folder.

## How to Log Out

Click the user icon in the top-right corner (it shows your initial), then click **{$action.log_out}** at the bottom of the menu. You'll be signed out and redirected to the home page.

Logging out clears your local session, but your saved words, watch history, and settings are preserved — they'll be restored next time you sign in.

## Switching Accounts

To switch to a different account, log out first, then log in with the other email address. There's no account switcher — each browser session uses one account at a time.

## Tips

- Your login session persists across browser restarts — you won't need to log in every time you visit
- If you're on a shared device, always log out when you're done
- The forgot password flow works even if you registered with the same email — it sends a reset link regardless
- You can manage your account details from your **[{$title.profile}](/docs/account/profile)**
