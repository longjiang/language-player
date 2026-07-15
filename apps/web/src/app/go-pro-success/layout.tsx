import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment Successful',
  description: 'Welcome to Language Player Pro! Your payment was successful.',
};

export default function GoProSuccessLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
