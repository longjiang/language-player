import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Confirm Email',
  description: 'Confirm your Language Player email address.',
};

export default function ConfirmEmailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
