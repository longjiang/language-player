/**
 * kuromoji ships no type declarations; the app never imports the package
 * directly (it uses a custom loader). Only the SPEC-058 Node eval adapter
 * uses the stock builder, so a test-scoped ambient declaration is enough.
 */
declare module 'kuromoji';
