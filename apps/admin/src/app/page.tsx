import { redirect } from 'next/navigation';

/**
 * The console's home is the user search dashboard, which moved to `/users`
 * when SPEC-099 added the Users / Content menu. Keep `/` as a redirect so old
 * links (and the login `callbackUrl`) keep working.
 */
export default function HomePage() {
  redirect('/users');
}
