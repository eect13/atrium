# Atrium

Personal command center. Times and quotes are Asia/Manila. Data stays in the browser (`atrium.v1`).

**Version 1.1.0**

## Use

- Command bar: type to search the desk — `BDO`, `ayala`, `note: buy rice`, `Lunch Friday 1pm` (`⌘K` on Mac, `Ctrl+K` elsewhere)
- Dashboard: locked by default. Unlock to drag cards or cycle width. Reset restores the factory layout
- Calendar: Month / Week / Day / Agenda. Floating calendar is **adaptive** (month + day schedule when roomy, compact when tight) with a remembered Auto / Month / Compact toggle
- Finance: Markets first (official PSEi 30, Yahoo screener with PE/cap filters, sparks, research PDF) and Books (cash, bank, wallet, card). Add any ticker from the plus button. Stock tape in Options: Auto (phisix + Yahoo) or Yahoo-only
- Quotes: optional module. Topic chips, live search, Exact author toggle. Live public lines, shuffled on Random — desk copies only if the feed is empty
- Notes: Windows Sticky Notes baseline — colored pads, **title + body**, new/delete/color, list + board, pin to float — plus format (B/I/U/S/bullets), pictures, pencil with undo, autohide tools
- News: tagged briefing with search. Sources start off; whatever you leave on is restored next open
- Sidebar: collapse, then Options, then an optional tagline. Toggle modules in Options
- Profile: name and city start blank — pin a place in Options for weather
- Floating desk: pin notes and widgets over any screen. Drag the title bar to move; hover edges/corners to resize (no persistent grip icons). Short tooltips on fine pointers only

## Install / deploy (native)

Tauri 2 wrap of the Vite app (same pattern as Finance Manager).

### Windows (NSIS)

```bat
deploy.bat
```

Needs Node 22+, Rust, WebView2. Output: `deploy/windows/*-setup.exe`.

Preferred layout on Eric’s PC:

- Source: `C:\Users\Eric\Desktop\Vibe Apps\Atrium\Source`
- Installers: `C:\Users\Eric\Desktop\Vibe Apps\Atrium\Installers\Windows`

### Android (arm64 APK)

```bat
apk.bat
```

Needs Microsoft JDK 17, Android SDK (`%LOCALAPPDATA%\Android\Sdk`), NDK, Rust `aarch64-linux-android`. Output: `deploy/android/atrium-v1.1.0-arm64-release.apk`.

### Dev

```bash
npm install
npm run dev          # Vite PWA on :8080
npm run desktop      # Tauri dev window
npm run typecheck
npm test
```

Heavy modules (Finance / News / Quotes) load on demand for a faster first paint.

Created with Grok.
