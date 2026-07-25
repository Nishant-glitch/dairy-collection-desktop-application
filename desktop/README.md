# DCS Pro — Desktop App (Windows + Mac)

A thin Electron wrapper around the live web app at **https://dcpro.online**.
It just opens the site in its own window (Option A), so:

- Every Vercel deploy is reflected instantly — no need to reship an installer.
- Firebase login and data work exactly like in the browser.
- Small installer, low maintenance.

## How the installers are built

Built automatically by GitHub Actions (`.github/workflows/build-desktop.yml`):

- **Run manually:** GitHub → Actions → *Build Desktop Apps* → *Run workflow*.
- **Or push a version tag** (`v1.0.0`) to also attach the installers to a
  GitHub Release with permanent download links.

The matrix builds both at once:

| Runner          | Output                        | Artifact name       |
| --------------- | ----------------------------- | ------------------- |
| `windows-latest`| `.exe` (NSIS installer)       | `DCS-Pro-Windows`   |
| `macos-latest`  | `.dmg`                        | `DCS-Pro-Mac`       |

Download them from the workflow run's **Artifacts** section (or the Release).

## Install instructions (share these with users)

The installers are **not code-signed** (signing certificates cost money), so
each OS shows a one-time "unknown developer" warning. This is expected and safe.

### Windows (`.exe`)
1. Double-click `DCS Pro Setup x.x.x.exe`.
2. If **Windows SmartScreen** says *"Windows protected your PC"*:
   - Click **More info** → **Run anyway**.
3. Finish the installer. A **DCS Pro** desktop + Start-menu shortcut is created.

### Mac (`.dmg`)
1. Open the `.dmg` and drag **DCS Pro** into **Applications**.
2. First launch: macOS may say *"DCS Pro can't be opened because it is from an
   unidentified developer."*
   - **Right-click** the app → **Open** → **Open** in the dialog, **or**
   - System Settings → **Privacy & Security** → **Open Anyway**.
3. After the first time it opens normally.

> Proper code-signing / notarization (Windows cert, Apple Developer $99/yr) can
> be added later to remove these warnings — not required for the app to work.

## Local dev (optional)
```
cd desktop
npm install
npm start        # opens the window pointing at https://dcpro.online
npm run dist     # build an installer for your current OS
```
