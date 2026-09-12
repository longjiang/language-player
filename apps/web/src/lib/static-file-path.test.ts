import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { NextRequest } from 'next/server';
import { isStaticFileRequest } from './static-file-path';
import proxy from '@/proxy';

const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

/** Every file under `public/`, as the request path it is served at. */
function publicFilePaths(dir: string = PUBLIC_DIR): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return publicFilePaths(full);
    return `/${relative(PUBLIC_DIR, full).split(sep).join('/')}`;
  });
}

function proxyResponse(pathname: string) {
  return proxy(new NextRequest(`http://localhost:3000${pathname}`));
}

describe('isStaticFileRequest', () => {
  it('recognises the mock app HTML a task frame loads', () => {
    expect(isStaticFileRequest('/mock-apps/railway-12306/index.html')).toBe(true);
    expect(isStaticFileRequest('/mock-apps/hello-world/index.html')).toBe(true);
    expect(isStaticFileRequest('/mock-apps/runtime.v1.js')).toBe(true);
  });

  it('recognises a file in a public directory whatever its extension', () => {
    expect(isStaticFileRequest('/fonts/nunito-extrabold.woff')).toBe(true);
    expect(isStaticFileRequest('/.well-known/assetlinks.json')).toBe(true);
    // No extension at all — only the directory can identify this one.
    expect(isStaticFileRequest('/.well-known/apple-app-site-association')).toBe(true);
    expect(isStaticFileRequest('/img/logo.png')).toBe(true);
  });

  it('recognises a file at the root of public/ by its extension', () => {
    expect(isStaticFileRequest('/travel.png')).toBe(true);
    expect(isStaticFileRequest('/favicon.ico')).toBe(true);
  });

  it('recognises every file public/ actually holds', () => {
    expect(publicFilePaths().filter((p) => !isStaticFileRequest(p))).toEqual([]);
  });

  it('does not claim a page path, or a directory name used as a prefix', () => {
    expect(isStaticFileRequest('/en/zh/tasks')).toBe(false);
    expect(isStaticFileRequest('/en/zh/not-a-real-page')).toBe(false);
    expect(isStaticFileRequest('/mock-appsish/page')).toBe(false);
  });
});

describe('proxy static file handling', () => {
  it('passes the mock app HTML through instead of rewriting it to the 404 route', () => {
    // The reported bug: this iframe URL rendered the web 404 page inside B ➍.
    const res = proxyResponse('/mock-apps/railway-12306/index.html');
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('passes an extensionless .well-known file through', () => {
    const res = proxyResponse('/.well-known/apple-app-site-association');
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('still rewrites an invalid [l1]/[l2] pair to the 404 route', () => {
    // SPEC-063/SPEC-071 behaviour the pass-through must not have disabled.
    const res = proxyResponse('/foo/bar');
    expect(res.headers.get('x-middleware-rewrite')).toContain('/_not-found');
  });

  it('still lets a valid language pair through', () => {
    const res = proxyResponse('/en/zh/tasks');
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });
});
