import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Email Verified',
  description: 'Your Language Player email has been verified.',
};

export default function VerifiedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
