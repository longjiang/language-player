import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login',
  description:
    'Sign in to Language Player to continue learning languages through authentic videos.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
