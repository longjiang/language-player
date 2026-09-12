/**
 * Which request paths reach `proxy.ts` as files served from `public/` rather
 * than as pages.
 *
 * Next runs the proxy BEFORE it serves anything out of `public/`, so a public
 * file has to be passed through explicitly. A path this predicate does not
 * recognise is not merely left alone: the end of `proxy.ts` reads the first two
 * segments of a pathname as an `[l1]/[l2]` pair and rewrites an unsupported one
 * to `/_not-found`. That is how B ➍'s mock app —
 * `/mock-apps/railway-12306/index.html` — came to render the web 404 page
 * inside its own frame (SPEC-095, ADR-0045): `mock-apps` is not an L1 and
 * `railway-12306` is not an L2.
 *
 * `public/` holds two shapes, so there are two tests:
 *
 * - **A directory.** Everything under it is a static file, whatever its
 *   extension — `/.well-known/apple-app-site-association` has none at all, so
 *   no extension test can recognise it.
 * - **A file extension.** Covers the files at the root of `public/`
 *   (`/travel.png`, `/favicon.ico`), which have no directory to be recognised
 *   by.
 *
 * `static-file-path.test.ts` walks `apps/web/public/` and fails when a file
 * there is not recognised here, so a new public directory or an unrecognised
 * file type cannot reintroduce the bug silently.
 */

/**
 * Directories under `public/` whose contents are served as-is.
 *
 * None of them can collide with a page: a page's first segment is an L1
 * (`SUPPORTED_L1S`), and none of these names is one.
 */
const PUBLIC_DIRECTORIES = ['/mock-apps', '/fonts', '/img', '/.well-known'] as const;

/** Extensions of files served from the root of `public/`. */
const STATIC_FILE_EXTENSION = /\.(ico|png|jpg|jpeg|svg|css|js)$/;

/** Is `pathname` a file served from `public/` rather than a page? */
export function isStaticFileRequest(pathname: string): boolean {
  if (STATIC_FILE_EXTENSION.test(pathname)) return true;
  return PUBLIC_DIRECTORIES.some(
    (dir) => pathname === dir || pathname.startsWith(`${dir}/`),
  );
}
