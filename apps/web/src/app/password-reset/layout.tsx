import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password',
};

export default function PasswordResetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
