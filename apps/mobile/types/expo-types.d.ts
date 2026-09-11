/**
 * Expo's ambient types — CSS/asset module declarations, `process.env` typings, etc.
 *
 * These normally arrive via `expo-env.d.ts`, which the Expo CLI generates the
 * first time you run the dev server and which `.gitignore` deliberately keeps
 * out of the repo. That combination made this project check in two different
 * ways: `npm run check` passed locally (the generated file was there) and failed
 * on a clean checkout, because CI had no `declare module '*.css'` and so
 * `src/constants/theme.ts`'s side-effect import of `src/global.css` was a type
 * error (TS2882 "Cannot find module or type declarations for side-effect
 * import"). The mobile job on `main` was red because of it.
 *
 * Referencing the package here makes the type-check deterministic: it no longer
 * depends on a file that only exists after somebody has started the dev server.
 * TypeScript deduplicates the reference, so the generated `expo-env.d.ts` can
 * still exist alongside this file without conflicting.
 */
/// <reference types="expo/types" />
