# Digital Mentor Diary - Student Growth Assistant

> **SerpApi India Hackathon 2026**  
> **Track:** Knowledge & Public Interest  
> **Submission Type:** Smart AI/Search Add-on to an existing educational records application  
> **Disclosure:** Built with assistance from Google Antigravity; all code reviewed and tested by me.

---

## 1. Project Overview

**Digital Mentor Diary** is a comprehensive student-mentor web records application designed for technical colleges. The platform allows students to manage their personal profiles, upload and verify semester marksheets, track monthly attendance records, and communicate with assigned faculty mentors.

### The Problem
Traditional college mentor diaries are static repositories. While they record past student grades and attendance, they offer zero forward-looking guidance on internships, scholarships, skill roadmaps, or faculty research opportunities.

### The Solution: "Student Growth Assistant" Chatbot
The **Student Growth Assistant** replaces generic third-party widgets with a purposeful search-powered assistant. Grounded entirely in **live public interest search data from SerpApi**, the assistant delivers real-time career and academic intelligence directly into the student dashboard:
- **Internships & Placement Openings:** Live listings from across India via `google_jobs`.
- **Free Learning Roadmaps:** High-quality coding tutorials and roadmaps via `youtube`.
- **Scholarships & Exam Notices:** Time-sensitive government and university alerts via `google_news`.
- **Mentor Research Publications:** Verified faculty publications via `google_scholar_author`.
- **Academic Fallback:** Live organic web results via `google`.

---

## 2. Architecture & Data Flow

```text
+-------------------------------------------------------------------------------+
|                             CLIENT / BROWSER                                  |
|                                                                               |
|  [Student Dashboard]                                                          |
|         |                                                                     |
|         v                                                                     |
|  [chatbot.js]  <-- User inputs query (e.g. "React internship in Pune")        |
|         |                                                                     |
|         |-- 1. Intent Detection (Regex / Keywords: jobs, courses, news, etc.) |
|         |-- 2. Anti-spam Check (Debounce 3s, ignore duplicates, check online) |
|         |-- 3. UI State (Show typing indicator, disable send button)          |
|         v                                                                     |
|  POST /api/search { intent: "jobs", query: "React internship in Pune" }       |
+---------------------------------------+---------------------------------------+
                                        | (Rewritten via netlify.toml)
                                        v
+-------------------------------------------------------------------------------+
|                     NETLIFY SERVERLESS FUNCTION                               |
|                     (/netlify/functions/search.js)                            |
|                                                                               |
|  [Validation & Protection]                                                    |
|         |-- Origin & Referer Verification against ALLOWED_ORIGINS             |
|         |-- In-Memory Per-IP Rate Limiting (20 req / 10 min window)           |
|         |-- Input Sanitization (String, 2-200 chars, strip control chars)     |
|         |-- Allow-list Intent Validation                                      |
|         v                                                                     |
|  [In-Memory Cache Check]                                                      |
|         |-- Key: "intent:normalized_query" (1-Hour TTL)                       |
|         |-- Cache Hit? -> Return cached JSON immediately                      |
|         v                                                                     |
|  [DEMO_MODE === "true"?]                                                      |
|         |-- Yes: Return curated mock data from /chatbot/demo-data.json        |
|         |        (Consumes ZERO SerpApi searches)                             |
|         v                                                                     |
|  [Live Upstream Call]                                                         |
|         |-- Build engine-specific query (SERPAPI_KEY from process.env ONLY)   |
|         |-- 8-Second AbortController Timeout                                  |
|         v                                                                     |
+---------------------------------------+---------------------------------------+
                                        | HTTPS GET
                                        v
                         +-----------------------------+
                         |      SerpApi Engine         |
                         |  (google_jobs, youtube,     |
                         |   google_news, scholar,     |
                         |   google search)            |
                         +--------------+--------------+
                                        |
                                        | Raw JSON
                                        v
+-------------------------------------------------------------------------------+
|  [Result Shaper in search.js]                                                 |
|         |-- Selects up to 5 items                                             |
|         |-- Shapes to strict schema: { title, source, snippet, link, extra }  |
|         |-- Validates safe links (https:// or http:// only)                   |
|         |-- Saves to in-memory cache                                          |
|         v                                                                     |
|  HTTP 200 JSON Response: { results: [...], intent, cached, demo }             |
+---------------------------------------+---------------------------------------+
                                        |
                                        v
+-------------------------------------------------------------------------------+
|                             CLIENT RENDERING                                  |
|                                                                               |
|  [chatbot.js]                                                                 |
|         |-- Safe DOM construction via createElement & textContent             |
|         |-- ZERO innerHTML on API or user data                                |
|         |-- Renders responsive interactive result cards with "Open" links     |
|         |-- Auto-scrolls to bottom, re-enables send button                    |
+-------------------------------------------------------------------------------+
```

---

## 3. Why Each SerpApi Engine is Essential

Judges evaluate meaningful SerpApi usage. This bot does not use search as a gimmick; every engine is purpose-selected for student needs:

| Intent | Engine Name | Why This Engine is Essential |
| :--- | :--- | :--- |
| **Internships & Jobs** | `google_jobs` | Job boards (LinkedIn, Indeed, Naukri, Monster) are fragmented and require accounts. Google Jobs indexes all platforms simultaneously, detects compensation and schedule types, and resolves geo-locations across Indian tech hubs (Mumbai, Bengaluru, Pune, Delhi). |
| **Free Courses** | `youtube` | High-quality developer learning materials and full-length roadmaps are primarily published on YouTube. SerpApi's YouTube engine retrieves video duration, channel authority (e.g., freeCodeCamp), and view counts without requiring complex OAuth tokens. |
| **Scholarships & Exams** | `google_news` | Government scholarships (NSP, AICTE, MahaDBT) and competitive exam schedules (GATE, CAT) have strict application windows. News indexing surfaces real-time official announcements and circulars days before static college sites update. |
| **Mentor's Research** | `google_scholar_author` | Connects undergraduate students directly to faculty research. By querying author ID `2bMjtGkAAAAJ`, students can see recent peer-reviewed publications, citation impact, and active domains to explore joint research or final-year projects. |
| **Fallback Web Search** | `google` | Handles conceptual and general computer science queries using Google's authoritative organic search rankings. |

---

## 4. Security & Privacy Guarantees

1. **Student Data Isolation:**
   - The chatbot code **NEVER reads, accesses, or transmits** student profile records, marks, PRN numbers, attendance files, or database credentials.
   - It operates purely on user search text entered into the chat box.
2. **Zero API Key Leakage:**
   - `SERPAPI_KEY` exists **strictly in `process.env` on the serverless backend**.
   - It is never exposed in front-end JavaScript, network payloads, error logs, or client-side responses.
3. **Cross-Site Scripting (XSS) Prevention:**
   - All dynamic DOM nodes are created with `document.createElement()` and `element.textContent`.
   - **Zero `innerHTML`** is used for dynamic data.
   - External links are strictly sanitized to allow only `https://` or `http://` protocols.
4. **Origin & Abuse Protection:**
   - Verifies incoming `Origin` and `Referer` headers against `ALLOWED_ORIGINS`.
   - In-memory per-IP rate limiting (20 requests per 10 minutes) mitigates request flooding.
   - Server-side validation restricts queries to 2–200 characters and strips ASCII control characters.

---

## 5. Local Setup & Testing

### Prerequisites
- Node.js (v18+)
- Netlify CLI (`npm install -g netlify-cli` or via `npx netlify-cli`)

### Setup Instructions

1. **Clone the repository and navigate into the project:**
   ```bash
   git clone https://github.com/mariashah04/PROJECT.git
   cd PROJECT
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```ini
   # For zero-cost local testing with curated data:
   DEMO_MODE=true
   ALLOWED_ORIGINS=http://localhost:8888,http://localhost:8080

   # For live SerpApi testing:
   # SERPAPI_KEY=your_actual_serpapi_key_here
   # DEMO_MODE=false
   ```

3. **Start local development server:**
   ```bash
   npx netlify dev
   ```
   *The application will launch at `http://localhost:8888`.*

4. **Test the chatbot:**
   - Open `http://localhost:8888/dashboard.html`
   - Click the orange chat bubble in the bottom right corner.
   - Click any of the 4 quick chips or type a search query.

---

## 6. Netlify Production Deployment

1. Push your repository to GitHub.
2. Connect your repository to [Netlify](https://app.netlify.com).
3. In Netlify Site Settings -> **Environment variables**, add:
   - `SERPAPI_KEY` = Your SerpApi private key
   - `DEMO_MODE` = `false` (or `true` during rehearsal/demo judging)
   - `ALLOWED_ORIGINS` = `https://your-site.netlify.app`
4. Deploy site. The `netlify.toml` automatically configures the `/api/search` proxy and function routing.

---

## 7. Limitations & Honest Engineering Notes

- **Serverless In-Memory Cache:** In-memory caching (`Map`) and IP rate limiting are best-effort per serverless container instance. When Netlify spins down idle instances or provisions new ones, the cache resets. For production multi-region deployments, an external Redis store (e.g. Upstash) would provide centralized persistence.
- **SerpApi Free Tier Budgeting:** Free accounts have 250 searches/month. The project includes `DEMO_MODE=true` specifically so hackathon judges and evaluators can interactively test the complete UI and data pipeline without exhausting the monthly quota.
