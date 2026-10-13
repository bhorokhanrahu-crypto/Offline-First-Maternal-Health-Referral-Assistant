# Offline-First Maternal Health Referral Assistant (HT-02 MVP)

A lightweight web app that helps a community health worker (CHW) record a maternal health visit, see rule-based warning flags with reasons, and produce a printable referral summary. It keeps working with **no internet** and can be installed on an Android phone as a PWA.

**Live demo:**)_https://github.com/bhorokhanrahu-crypto/Offline-First-Maternal-Health-Referral-Assistant

> **Demo only.** Uses fictional data. The warning rules are placeholders and are **not clinical guidance** until verified (see "Limitations").

## OpenHack'26 submission details
- **Team name:** _[The Power Pair]_
- **Team members and contributions:** _[Name: what they built]_, _[Name: what they built]_
- **Problem statement:** HT-02, Offline-First Maternal Health Referral Assistant
- **Solution in one line:** a CHW records a visit offline, rules flag danger signs with reasons, and a printable referral summary plus a facility directory support the referral.

## Features
- **Dashboard:** demo patients, pending reviews, urgent flags, records awaiting sync, Online/Offline indicator.
- **Sample data button:** loads three fictional visits so the dashboard can be demoed quickly.
- **New visit form:** patient ID, age, weeks pregnant, visit date, CHW ID, symptoms, notes. Saved locally on the device.
- **Rule-based warnings:** deterministic rules, each with a reason, an action and a guidance version. Urgent flags show escalation instructions immediately.
- **Referral summary:** recorded details, triggered warnings, missing information, professional review status, print / save as PDF.
- **Facility directory:** search and emergency-capable filter, tap-to-call.
- **Offline-first:** all data is stored in the browser (`localStorage`); a service worker caches the app so it opens without internet.

## Tech
Plain HTML, CSS and JavaScript. No build step, no dependencies.

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `style.css` | Styling and print layout |
| `app.js` | Screens, storage, navigation |
| `rules.js` | Warning rules (edit here) |
| `facilities.js` | Sample facility data (edit here) |
| `sw.js`, `manifest.json` | Offline caching and installable PWA |

## Run locally
Open `index.html` in a browser, or use the VS Code "Live Server" extension.
(The service worker only registers on `https://` or `localhost`.)

## Deploy (GitHub Pages) and install on Android
1. Repo **Settings > Pages**, set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`, then Save.
2. Open `https://github.com/bhorokhanrahu-crypto/Offline-First-Maternal-Health-Referral-Assistant in Chrome on the phone and let it load once.
3. Chrome menu > **Install app** / **Add to Home screen**. It now opens and works offline.

## Design decisions
- Warning rules are deterministic code, not AI, so results are explainable and testable.
- Emergency warnings appear instantly and never wait on any network or model call.
- Minimal personal data: no names or national ID numbers are collected.

## Limitations (honest scope)
- Rules in `rules.js` are **unverified placeholders** (`DEMO-UNVERIFIED-0`). They must be checked against WHO / Pakistan-Sindh health authority guidance before any real use.
- `localStorage` is **not encrypted**. Real patient data would need encryption, access control, consent and a retention policy.
- Sample facilities are fictional.
- This MVP has no backend yet: the `synced` flag on each visit is a placeholder for a sync queue.

## Challenges we faced
- Connectivity: the app had to work with zero internet, so all data lives on the device and the app shell is cached by a service worker.
- Safety: we did not want to invent medical thresholds, so rules are deterministic, versioned and clearly marked unverified until checked against WHO / Sindh guidance.
- Tooling: our first prototype used React + Vite; we rebuilt it in plain HTML, CSS and JS so it runs with no install or build step.
- Time: with a 24-hour window we limited scope to a working offline MVP and left the backend sync and local LLM for later.

## AI and open-source disclosure
- **AI tools:** Claude (Anthropic) was used to plan the architecture and to generate the initial HTML, CSS and JavaScript. _[Team: edit this to describe what you reviewed, changed or wrote yourselves.]_
- **AI models or AI APIs inside the app:** none. The warning rules are plain code, not AI.
- **Open-source libraries:** none at runtime. The app uses only built-in browser features (localStorage, Service Worker, Web App Manifest, window.print).
- **External APIs:** none. The optional "Directions" link opens Google Maps in the browser only when a facility has coordinates.
- **Secrets:** no API keys, passwords or tokens are used or committed.

## Roadmap
FastAPI + PostgreSQL sync, authentication, and an optional local LLM (Ollama) to draft referral text, always subordinate to the rules engine.
