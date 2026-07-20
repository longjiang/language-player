import { Metadata } from 'next';
import { execSync } from 'child_process';
import { AboutContent } from './about-content';
import pkg from '../../../package.json';

export const metadata: Metadata = {
  title: 'About — Language Player',
  description: 'Version and build information for Language Player.',
};

interface BuildInfo {
  version: string;
  commitHash: string;
  branch: string;
  buildDate: string;
  environment: string;
}

/** Collect build-time metadata: version, git info, environment. */
function getBuildInfo(): BuildInfo {
  // Read version from imported package.json
  const version = (pkg as { version?: string }).version ?? '0.0.0';
  let commitHash = 'unknown';
  let branch = 'unknown';

  // Build timestamp (frozen at build time)
  const buildDate = new Date().toISOString();

  // Read git info
  try {
    commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    // Fall back to env vars (Netlify, Vercel, etc.)
    commitHash = process.env.COMMIT_REF?.slice(0, 7)
      ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7)
      ?? commitHash;
    branch = process.env.BRANCH
      ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF
      ?? branch;
  }

  const environment = process.env.NODE_ENV === 'production'
    ? (process.env.CONTEXT ?? 'production')
    : 'development';

  return { version, commitHash, branch, buildDate, environment };
}

export default function AboutPage() {
  const info = getBuildInfo();

  return <AboutContent buildInfo={info} />;
}
