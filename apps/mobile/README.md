# LensMate mobile app

Expo Router phone companion for iOS, Android, and web. The core app surface is device status, photo capture and ask,
spoken assistant, private memory, and diagnostics. The virtual glasses route is a development tool. Native projects are
generated through Expo; do not hand-edit generated `ios/` or `android/` directories.

## Local development

From the repository root:

```sh
pnpm install
pnpm -F @lensmate/mobile start
```

The root `.env.development` file may contain local settings. Only `EXPO_PUBLIC_*` values are copied into the public Expo configuration; never put secrets in public variables. The root `.env.production` file is for owner-controlled production operations and must not be committed. There are no checked-in environment templates.

Web development is available with `pnpm -F @lensmate/mobile web`. The app also has its own strict typecheck and Jest suite:

```sh
pnpm -F @lensmate/mobile typecheck
pnpm -F @lensmate/mobile test
```

## Structure

- `app/`: Expo Router route files
- `src/`: feature logic, session models, reusable UI, and tests
- `assets/`: Expo native icon and web favicon inputs
- `public/`: web app manifest, PWA icons, and service worker

The web icons are used by the manifest, runtime head tags, and service-worker shell; the app icons are referenced by `app.config.ts`.

The product contract is in [`docs/product/PRODUCT.md`](../../docs/product/PRODUCT.md).
