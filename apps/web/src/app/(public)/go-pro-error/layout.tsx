import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment Issue',
  description: 'There was an issue processing your payment. Please try again.',
};

export default function GoProErrorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
