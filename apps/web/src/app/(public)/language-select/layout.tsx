import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Choose Your Language',
  description:
    'Pick your native language and the language you want to learn from 60+ options.',
};

export default function LanguageSelectLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
