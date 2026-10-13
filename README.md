# Offline-First Maternal Health Referral Assistant (HT-02 MVP)

A lightweight web app that helps a community health worker (CHW) record a maternal health visit, see rule-based warning flags with reasons, and produce a printable referral summary. It keeps working with **no internet** and can be installed on an Android phone as a PWA.

**Live demo:** _add your GitHub Pages link here (see "Deploy" below)_

> **Demo only.** Uses fictional data. The warning rules are placeholders and are **not clinical guidance** until verified (see "Limitations").

## OpenHack'26 submission details
- **Team name:** _[fill in registered team name]_
- **Team members and contributions:** _[Name: what they built]_, _[Name: what they built]_
- **Problem statement:** HT-02, Offline-First Maternal Health Referral Assistant
- **Solution in one line:** a CHW records a visit offline, rules flag danger signs with reasons, and a printable referral summary plus a facility directory support the referral.

## Features
- **Dashboard:** a welcoming mother-and-baby hero and photo gallery, clear three-step referral path, patient/review counts, and Online/Offline indicator.
- **Advanced offline workflow:** unfinished visit forms autosave on the device; search/filter saved visits; export individual visit records or all visits as CSV. Offline guidance makes no model requests.
- **Sample data button:** loads three fictional visits so the dashboard can be demoed quickly.
- **New visit form:** patient ID, age, weeks pregnant, visit date, CHW ID, symptoms, notes. Saved locally on the device.
- **Rule-based warnings:** deterministic rules, each with a reason, an action and a guidance version. Urgent flags show escalation instructions immediately.
- **Referral summary:** recorded details, triggered warnings, missing information, professional review status, print / save one visit as PDF or download it as CSV.
- **Facility directory:** search and emergency-capable filter, tap-to-call.
- **Two explicit modes:** **Offline guidance · No AI** (default) uses only local rules; **Online AI** reveals the optional Groq chat. Changing modes never changes how local referral warnings are calculated.
- **Optional online AI chat:** asks Groq about pregnancy, mother and child health, newborn care, or basic first aid only. A server-side topic check refuses unrelated latest questions before sending anything to Groq. Translated topic starters, retry, and a request timeout are provided. The current chat conversation is sent when a question is submitted; local visit records are never sent automatically.
- **Offline behavior:** local visit recording, rule-based warnings and the facility directory remain available without internet. Chat is disabled offline and never replaces local warning guidance.
- **English, Urdu and Sindhi:** switch languages on the device; Urdu and Sindhi use a right-to-left layout.
- **Rural-friendly interface:** large touch controls, readable type, and a calm glass-inspired visual design.
- **Offline-first:** all data is stored in the browser (`localStorage`); a service worker caches the app shell so it opens without internet after the first successful load.

## Tech
HTML, CSS and JavaScript frontend with a small FastAPI backend for the optional online chat.

```text
.
├── main.py
├── requirements.txt
├── .env.example
├── model/
│   ├── README.md
│   └── assistant_instructions.txt
└── src/
    ├── index.html
    ├── app.js
    ├── i18n.js
    ├── rules.js
    └── style.css
```

| File | Purpose |
| --- | --- |
| `main.py` | FastAPI server and server-side Groq proxy |
| `requirements.txt` | Python runtime dependencies |
| `src/` | Browser app, local rules, translations, facilities and PWA assets |
| `model/` | Online assistant safety instructions; no model weights are downloaded |

## Run locally
Create a virtual environment and install the pinned-range dependencies:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe main.py
```

The app opens at `http://localhost:8000`. The service worker only registers on `https://` or `localhost`; load the app once while connected so its shell is available offline. The first load cannot happen offline unless the project files are already on the device.

To enable online chat, revoke any key previously pasted into a chat or committed anywhere, create a **new** Groq key, and store it only in a local `.env` file:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
# In Notepad set GROQ_API_KEY=your-new-key, save the file, then close the running server.
.\.venv\Scripts\python.exe main.py
```

Install updated dependencies with `.\.venv\Scripts\python.exe -m pip install -r requirements.txt` if this is an existing setup. The server reads `.env` at startup; restart it after changing the key. `.env` is ignored by Git. Never paste keys into source code, browser files, screenshots, or chat. Optional `GROQ_MODEL`, `HOST` and `PORT` environment variables select the model and bind address. If no key is configured, Online AI mode explains that chat is unavailable; Offline guidance still works without calling the model.

The default Groq model is `llama-3.3-70b-versatile` (production Llama 3.3 70B). The server status and chat page show the active model. If Groq rejects the key, model, or account quota, the chat displays a specific next step instead of a generic failure.

## Deploy (GitHub Pages) and install on Android
Deploy `main.py` to a host that supports Python/FastAPI and HTTPS, with `GROQ_API_KEY` set as a server-side secret. GitHub Pages can host the static/offline app but cannot run this API; deploy the FastAPI app for the combined Online AI and Offline guidance modes. On Android, open the HTTPS app URL in Chrome and load it once while connected, then use **Install app** / **Add to Home screen**. It will keep local guidance available offline.

## Design decisions
- Warning rules are deterministic code, not generative AI, so results are explainable, testable and available offline.
- Emergency warnings appear instantly and never wait on any network or model call. The separate AI chat is optional, online-only and not used to decide referrals.
- Minimal personal data: no names or national ID numbers are collected.

## Limitations (honest scope)
- Rules in `rules.js` are **unverified placeholders** (`DEMO-UNVERIFIED-0`). They must be checked against WHO / Pakistan-Sindh health authority guidance before any real use.
- Sindhi and Urdu text is bundled in the app, but health terminology and translations must be reviewed by native speakers and qualified local clinicians before real use.
- `localStorage` is **not encrypted**. Real patient data would need encryption, access control, consent and a retention policy.
- CSV exports and browser-generated PDFs are unencrypted and contain sensitive visit information. Store them only on trusted devices. To create a PDF, choose **Save as PDF** in the browser print dialog.
- Dashboard photos are locally cached decorative Unsplash images (not medical guidance): [Kelly Sikkema](https://unsplash.com/photos/mother-carrying-baby-Z4GKcFAGck4), [Jonathan Borba](https://unsplash.com/photos/smiling-woman-carrying-baby-RWgE9_lKj_Y), and [Raul Angel](https://unsplash.com/photos/woman-carrying-smiling-baby-mcKqoZh0DkI), used under the [Unsplash License](https://unsplash.com/license).
- Sample facilities are fictional.
- Visit records are not synced to a backend: the `synced` flag is a placeholder. The API only proxies explicitly submitted chat messages and applies a basic per-IP request limit; deploy behind authentication and usage quotas before public use.
- AI replies can be inaccurate and are not validated clinical guidance. If care has been delayed, contact a qualified clinician as soon as possible; severe or worsening symptoms need emergency care now. Do not share names, contact details or identifying patient information in chat.

## Challenges we faced
- Connectivity: the app had to work with zero internet, so all data lives on the device and the app shell is cached by a service worker.
- Safety: we did not want to invent medical thresholds, so rules are deterministic, versioned and clearly marked unverified until checked against WHO / Sindh guidance.
- Tooling: our first prototype used React + Vite; we rebuilt it in plain HTML, CSS and JS so it runs with no install or build step.
- Connectivity: referral guidance is local and deterministic; optional AI chat uses a small same-origin server proxy and is unavailable offline.

## AI and open-source disclosure
- **AI tools:** Claude (Anthropic) was used to plan the architecture and to generate the initial HTML, CSS and JavaScript. _[Team: edit this to describe what you reviewed, changed or wrote yourselves.]_
- **AI models or AI APIs inside the app:** optional Groq chat is available through the FastAPI server when configured. Deterministic warnings and referral summaries remain local; submitting a question sends the current chat conversation to Groq.
- **Open-source libraries:** FastAPI, Uvicorn and the Groq Python SDK on the server; browser code uses built-in browser features.
- **External APIs:** Groq receives only chat messages explicitly submitted by the user; the optional "Directions" link opens Google Maps only when a facility has coordinates.
- **Secrets:** do not put API keys in browser files or commit them. Keep the Groq key in the ignored server-side `.env` file or environment. Revoke any key shared in a chat or other public location.

## Roadmap
Authenticated visit sync, professional review, native-speaker/clinical review of all translations, and optional local AI for installations that need chat without internet. The current Groq chat needs internet; local deterministic guidance remains the offline fallback. Add deployment-level authentication and per-user quotas before exposing the chat server publicly.
