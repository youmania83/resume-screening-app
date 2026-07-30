// next.config.js (ESM)
import { fileURLToPath } from 'url';
import path from 'path';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: __dirname,
  },
  // NOTE: the `eslint` key was removed — Next 16 no longer supports it and emitted
  // an "Unrecognized key(s)" warning on every build. Lint runs via `npm run lint`.
  //
  // `typescript.ignoreBuildErrors` is deliberately NOT enabled: silently shipping
  // type errors is how the three unchecked-null email bugs reached production.
  // Run `npx tsc --noEmit` (or let the build fail) instead.
};

export default nextConfig;
