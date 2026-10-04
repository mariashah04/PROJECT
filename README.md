# Digital Mentor Diary - Student Growth Assistant

**SerpApi India Hackathon 2026** | **Track:** Knowledge & Public Interest

**Live demo:** https://digitalmentordairy.netlify.app/
**Demo login:** username `demo` / password `YOUR_DEMO_PASSWORD`
(single throwaway demo account, no real student data is stored anywhere in this project)

---

## 1. What this project is

**Digital Mentor Diary** is a student-mentor records portal for engineering colleges: student profile, semester results, personal documents, monthly attendance downloads, mentor details and a contact page.

Traditional mentor diaries only look backwards. They record grades and attendance, but give students no forward-looking help with internships, scholarships, learning roadmaps or faculty research.

**Student Growth Assistant** is a chatbot added to the dashboard that answers those questions with **live search data from SerpApi**. Without SerpApi the chatbot cannot answer, so search data is the core of the feature.

| Student asks about                    | SerpApi engine          | Why this engine                                                                                             |
| ------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Internships, jobs, placements         | `google_jobs`           | Job boards are fragmented; Google Jobs aggregates openings across platforms with location filters for India |
| Free courses, tutorials, roadmaps     | `youtube`               | Most free learning material is on YouTube; no OAuth needed                                                  |
| Scholarships, exam notices, deadlines | `google_news`           | Official announcements appear in news before static college pages update                                    |
| Mentor's research                     | `google_scholar_author` | Shows the mentor's recent publications so students can explore research and project topics                  |
| Anything else                         | `google`                | General answers from organic search results                                                                 |

---

## 2. What existed before vs. what is new for the hackathon

The hackathon rules ask participants to identify the work done for the event.

**Existing before the hackathon:** the base web application (HTML/CSS/JavaScript front end with profile, documents, attendance and contact pages), built as my CSM401 Mini Project (AY 2024-25). It originally used a third-party Elfsight chatbot widget. The idea and the repository are mine; teammates helped with the original project documentation.

**New for the hackathon (all built by me):**

- The complete **Student Growth Assistant** chatbot (`chatbot/`), replacing the third-party widget
- The **Netlify Function** backend (`netlify/functions/search.js`) that calls SerpApi securely
- **Demo login** with server-side credential check and signed session cookie (`login.js`, `logout.js`)
- **Route guard** for the dashboard using a Netlify Edge Function (`netlify/edge-functions/auth.js`)
- Security hardening, caching, demo mode, removal of personal data, layout fixes and this documentation

---

## 3. Architecture

```text
Browser (chatbot.js)
   |  1. detect intent (jobs / courses / news / research / general)
   |  2. POST /api/search { intent, query }
   v
Netlify Function  search.js
   |  - checks Origin against ALLOWED_ORIGINS, per-IP rate limit
   |  - validates intent (allow-list) and query (2-200 chars)
   |  - 1-hour in-memory cache, DEMO_MODE returns sample data (0 searches used)
   |  - builds SerpApi request itself using SERPAPI_KEY from environment only
   v
SerpApi  (google_jobs, youtube, google_news, google_scholar_author, google)
   |
   v
search.js reduces the response to {title, source, snippet, link} (max 5 items)
   |
   v
Browser renders cards with createElement/textContent (no innerHTML)
```

Login and page protection:

```text
index.html --POST /api/login--> login.js (timing-safe check, signed HttpOnly cookie)
/dashboard* --> Edge Function auth.js verifies the cookie signature, else redirects to login
```

---

## 4. Security and privacy

- **API key never reaches the browser.** `SERPAPI_KEY` is read only inside the Netlify Function.
- **The chatbot never touches student records.** It only sends the text typed in the chat box.
- **No raw SerpApi responses** are returned to the client; only a small, shaped list.
- **XSS protection:** all result text is inserted with `textContent`; only `http(s)` links are allowed.
- **Abuse protection:** origin check, rate limiting, input validation and an intent allow-list.
- **Login:** credentials are compared with a timing-safe check on the server, failures return a generic message after a short delay, and the session is an HMAC-signed `HttpOnly` cookie (2-hour expiry).
- **No secrets in the repository.** `.env` is git-ignored; `.env.example` contains names only.

---

## 5. Run it locally

**Prerequisites:** Node.js 18+ and the Netlify CLI (`npm install -g netlify-cli`).

```bash
git clone https://github.com/mariashah04/PROJECT.git
cd PROJECT
```

Create your environment file (`copy .env.example .env` on Windows, `cp .env.example .env` on macOS/Linux) and fill it in:

| Variable          | Purpose                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `SERPAPI_KEY`     | Your SerpApi key (free plan: 250 searches/month). Not needed in demo mode    |
| `DEMO_MODE`       | `true` returns sample data and uses **zero** searches; `false` calls SerpApi |
| `ALLOWED_ORIGINS` | Comma-separated allowed origins, e.g. `http://localhost:8888`                |
| `DEMO_USER`       | Demo login username                                                          |
| `DEMO_PASS`       | Demo login password (choose your own)                                        |
| `SESSION_SECRET`  | Long random string used to sign the session cookie                           |

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the app:

```bash
netlify dev
```

Open http://localhost:8888, log in with your `DEMO_USER` / `DEMO_PASS`, then open the orange chat button on the dashboard and try the four quick chips or type a question such as "internships for computer engineering freshers in Mumbai".

---

## 6. Deploy to Netlify

1. Connect the GitHub repository to a Netlify site and set the production branch to `master`.
2. Under **Site configuration -> Environment variables**, add the six variables above (mark `SERPAPI_KEY`, `DEMO_PASS` and `SESSION_SECRET` as secret).
3. Set `ALLOWED_ORIGINS` to your site address and redeploy.

`netlify.toml` already configures the `/api/search`, `/api/login` and `/api/logout` routes and the dashboard guard.

---

## 7. Limitations (honest notes)

- **Demo login only.** This repository contains a single demo account; it is not a full multi-user system. Sign-up is disabled. The profile, document and attendance pages are a front-end prototype and do not store data.
- **The original MySQL backend described in the course paper is not part of this repository.**
- **In-memory cache and rate limiting are best-effort** because serverless instances restart; a shared store (for example Redis) would be needed for production.
- **Free SerpApi plan:** 250 searches per month, which is why demo mode and caching exist.

---

## 8. AI tools used

- **Google Antigravity** - generated and edited code for the chatbot and the Netlify Function.
- **Claude (Anthropic)** - planning, prompt writing, code review, debugging and documentation help.

I reviewed, tested and ran all code myself.
