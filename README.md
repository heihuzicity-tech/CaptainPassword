# 船长密码箱

CaptainPassword is a local-first desktop password vault built with Tauri, React, and Rust.

## Names

- Chinese product name: `船长密码箱`
- English product name: `CaptainPassword`
- Repository name: `CaptainPassword`
- Package and crate name: `captain-password`
- Bundle identifier: `ai.heihuzi.captainpassword`

The Tauri `productName` is intentionally ASCII so GitHub Release assets keep stable filenames across macOS, Windows, and Linux. The visible window title remains `船长密码箱`.

## Development

```bash
npm ci
npm run tauri dev
```

Frontend-only build:

```bash
npm run build
```

Rust backend check:

```bash
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

## CI And Releases

GitHub Actions are split into two workflows:

- `.github/workflows/ci.yml` checks the frontend and Rust backend on Linux, macOS, and Windows.
- `.github/workflows/release.yml` builds draft GitHub Releases from tags like `v0.1.0`.

The first release should be created as a draft and inspected before publishing.
