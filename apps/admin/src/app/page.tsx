import { redirect } from 'next/navigation';

/**
 * The console's home is the Analytics dashboard (`/analytics`). Keep `/` as a
 * redirect so old links (and the login `callbackUrl`) keep working.
 */
export default function HomePage() {
  redirect('/analytics');
}
