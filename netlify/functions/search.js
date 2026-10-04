/**
 * Netlify Serverless Function: search.js
 * Route: /.netlify/functions/search (rewritten from /api/search in netlify.toml)
 * Hackathon: SerpApi India Hackathon 2026 (Knowledge & Public Interest)
 * 
 * Non-Negotiable Security & Privacy Rules:
 * 1. Process.env ONLY: SERPAPI_KEY is never exposed to the client, logs, or error responses.
 * 2. Never inspects or receives student records; only receives sanitized search {intent, query}.
 * 3. Never forwards arbitrary client parameters or URLs to SerpApi.
 * 4. Shapes and returns only clean, minimal JSON ({ title, source, snippet, link, extra }).
 * 5. In-memory caching with 1-hour TTL (best-effort, as serverless lambdas can restart).
 * 6. In-memory IP rate limiting (20 req / 10 min) and Origin header validation.
 * 7. DEMO_MODE support: returns mock data from /chatbot/demo-data.json without consuming credits.
 * 8. Engines verified in official docs: google_jobs, youtube, google_news, google_scholar_author, google.
 */

const fs = require("fs");
const path = require("path");

// --- In-Memory Caches & Rate Limiters ---
// NOTE: In serverless environments, in-memory state is best-effort per container instance.
// Instances can be recycled by the cloud provider at any time.
const responseCache = new Map(); // key: "intent:normalized_query" -> { data, expiresAt, demo }
const ipRateLimitMap = new Map(); // key: "ip" -> { count, resetTime }

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 Hour TTL
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 Minutes Window
const MAX_REQUESTS_PER_WINDOW = 20; // 20 requests per IP per window

// Allowed intents list
const ALLOWED_INTENTS = ["jobs", "courses", "news", "research", "fallback"];

// Default allowed origins for development & production
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8888",
  "http://localhost:8080",
  "http://127.0.0.1:8888",
  "http://127.0.0.1:8080"
];

/**
 * Loads mock responses for DEMO_MODE from /chatbot/demo-data.json
 */
function loadDemoData() {
  const candidatePaths = [
    path.join(__dirname, "../../chatbot/demo-data.json"),
    path.join(__dirname, "../chatbot/demo-data.json"),
    path.join(process.cwd(), "chatbot/demo-data.json"),
    path.resolve("chatbot/demo-data.json")
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, "utf8");
        const clean = raw.replace(/^\uFEFF/, "");
        return JSON.parse(clean);
      } catch (e) {
        // Fallback to next candidate
      }
    }
  }
  return null;
}

/**
 * Sanitizes URLs: allows only http:// or https://
 */
function sanitizeLink(link) {
  if (typeof link === "string" && /^https?:\/\//i.test(link.trim())) {
    return link.trim();
  }
  return "https://www.google.com";
}

/**
 * Resolves CORS headers according to ALLOWED_ORIGINS env var
 */
function resolveCorsHeaders(requestHeaders) {
  const envOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);

  const allowedList = envOrigins.length > 0 ? envOrigins : DEFAULT_ALLOWED_ORIGINS;
  const origin = requestHeaders.origin || requestHeaders.Origin || "";

  let allowOrigin = allowedList[0];
  if (origin && allowedList.includes(origin)) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
}

/**
 * Validates Origin/Referer against allowed origins list
 */
function isOriginAllowed(requestHeaders) {
  const envOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);

  const allowedList = envOrigins.length > 0 ? envOrigins : DEFAULT_ALLOWED_ORIGINS;
  const origin = requestHeaders.origin || requestHeaders.Origin;
  const referer = requestHeaders.referer || requestHeaders.Referer;

  // In local development or direct testing (e.g. curl), origin/referer may be absent
  if (!origin && !referer) {
    return true;
  }

  if (origin) {
    return allowedList.includes(origin);
  }

  if (referer) {
    return allowedList.some(allowed => referer.startsWith(allowed));
  }

  return true;
}

/**
 * Best-effort in-memory rate limiting per client IP
 */
function checkRateLimit(requestHeaders) {
  const forwardedFor = requestHeaders["x-forwarded-for"] || requestHeaders["client-ip"] || "unknown-client";
  const clientIp = forwardedFor.split(",")[0].trim();

  const now = Date.now();
  let record = ipRateLimitMap.get(clientIp);

  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    ipRateLimitMap.set(clientIp, record);
    return { allowed: true };
  }

  record.count += 1;
  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000) };
  }

  return { allowed: true };
}

// =============================================================================
// RESULT SHAPERS (Verified against official SerpApi documentation schemas)
// Shape into strict schema: { title, source, snippet, link, extra } (Max 5 items)
// =============================================================================

/**
 * 1. google_jobs shaper
 * Upstream array: data.jobs_results
 */
function shapeJobResults(rawJobs) {
  if (!Array.isArray(rawJobs)) return [];

  return rawJobs.slice(0, 5).map(item => {
    let targetLink = "";
    if (Array.isArray(item.apply_options) && item.apply_options.length > 0 && item.apply_options[0].link) {
      targetLink = item.apply_options[0].link;
    } else if (item.share_link) {
      targetLink = item.share_link;
    } else if (Array.isArray(item.related_links) && item.related_links[0] && item.related_links[0].link) {
      targetLink = item.related_links[0].link;
    }

    const sourceCompany = item.company_name || "Company Verified";
    const viaSource = item.via ? ` (${item.via})` : "";
    const source = `${sourceCompany}${viaSource}`;

    const extraParts = [];
    if (item.location) extraParts.push(item.location);
    if (item.detected_extensions && item.detected_extensions.schedule_type) {
      extraParts.push(item.detected_extensions.schedule_type);
    } else if (Array.isArray(item.extensions) && item.extensions[0]) {
      extraParts.push(item.extensions[0]);
    }
    const extra = extraParts.join(" • ") || "India";

    const rawSnippet = item.description || "Active student internship opportunity listed on Google Jobs.";
    const cleanSnippet = rawSnippet.replace(/\s+/g, " ").trim().slice(0, 220);

    return {
      title: String(item.title || "Job / Internship Listing").trim().slice(0, 150),
      source: source.slice(0, 100),
      snippet: cleanSnippet,
      link: sanitizeLink(targetLink),
      extra: extra.slice(0, 100)
    };
  });
}

/**
 * 2. youtube shaper (courses & tutorials)
 * Upstream array: data.video_results
 */
function shapeYoutubeResults(rawVideos) {
  if (!Array.isArray(rawVideos)) return [];

  return rawVideos.slice(0, 5).map(item => {
    const channelName = item.channel && item.channel.name ? item.channel.name : "YouTube";
    const extraParts = [];
    if (item.length) extraParts.push(`Duration: ${item.length}`);
    if (item.published_date) extraParts.push(item.published_date);

    const rawSnippet = item.description || item.title || "Curated educational video tutorial.";
    const cleanSnippet = rawSnippet.replace(/\s+/g, " ").trim().slice(0, 220);

    return {
      title: String(item.title || "Course / Tutorial").trim().slice(0, 150),
      source: `${channelName} (YouTube)`.slice(0, 100),
      snippet: cleanSnippet,
      link: sanitizeLink(item.link),
      extra: extraParts.join(" • ") || "Free Course"
    };
  });
}

/**
 * 3. google_news shaper (scholarships & exam alerts)
 * Upstream array: data.news_results
 */
function shapeNewsResults(rawNews) {
  if (!Array.isArray(rawNews)) return [];

  return rawNews.slice(0, 5).map(item => {
    let sourceName = "News Source";
    if (item.source) {
      sourceName = typeof item.source === "object" && item.source.name ? item.source.name : String(item.source);
    }
    const extra = item.date ? String(item.date).slice(0, 60) : "Latest News";
    const rawSnippet = item.snippet || "Recent scholarship or academic notification.";
    const cleanSnippet = rawSnippet.replace(/\s+/g, " ").trim().slice(0, 220);

    return {
      title: String(item.title || "Academic / Scholarship Update").trim().slice(0, 150),
      source: sourceName.slice(0, 100),
      snippet: cleanSnippet,
      link: sanitizeLink(item.link),
      extra: extra
    };
  });
}

/**
 * 4. google_scholar_author shaper (mentor's research)
 * Upstream array: data.articles
 */
function shapeScholarAuthorResults(rawArticles, query) {
  if (!Array.isArray(rawArticles)) return [];

  let articles = rawArticles;
  // If user searched for specific keywords within mentor's papers, match titles/publications
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !["mentor", "research", "paper", "papers", "publication", "publications", "scholar"].includes(w));

  if (keywords.length > 0) {
    const filtered = rawArticles.filter(art => {
      const text = `${art.title || ""} ${art.publication || ""}`.toLowerCase();
      return keywords.some(k => text.includes(k));
    });
    if (filtered.length > 0) {
      articles = filtered;
    }
  }

  return articles.slice(0, 5).map(item => {
    const extraParts = [];
    if (item.year) extraParts.push(`Year: ${item.year}`);
    if (item.cited_by && item.cited_by.value) extraParts.push(`Citations: ${item.cited_by.value}`);

    const source = item.publication || (item.authors ? item.authors : "Google Scholar");
    const rawSnippet = item.authors ? `Authors: ${item.authors}` : "Peer-reviewed academic research publication.";
    const cleanSnippet = rawSnippet.replace(/\s+/g, " ").trim().slice(0, 220);

    return {
      title: String(item.title || "Research Publication").trim().slice(0, 150),
      source: String(source).slice(0, 100),
      snippet: cleanSnippet,
      link: sanitizeLink(item.link || "https://scholar.google.com/citations?user=2bMjtGkAAAAJ"),
      extra: extraParts.join(" • ") || "Google Scholar"
    };
  });
}

/**
 * 5. google shaper (organic web fallback)
 * Upstream array: data.organic_results
 */
function shapeGoogleResults(rawOrganic) {
  if (!Array.isArray(rawOrganic)) return [];

  return rawOrganic.slice(0, 5).map(item => {
    const sourceName = item.displayed_link || (item.source ? String(item.source) : "Web Result");
    const rawSnippet = item.snippet || "Public search result.";
    const cleanSnippet = rawSnippet.replace(/\s+/g, " ").trim().slice(0, 220);

    return {
      title: String(item.title || "Search Result").trim().slice(0, 150),
      source: String(sourceName).slice(0, 100),
      snippet: cleanSnippet,
      link: sanitizeLink(item.link),
      extra: item.date ? String(item.date).slice(0, 60) : "Web Result"
    };
  });
}

/**
 * Builds safe internal SerpApi parameters per intent
 */
function buildSerpApiParams(intent, sanitizedQuery, apiKey) {
  switch (intent) {
    case "jobs": {
      const cityMatch = sanitizedQuery.match(/\b(mumbai|pune|delhi|bangalore|bengaluru|hyderabad|chennai|kolkata|noida|gurugram)\b/i);
      const location = cityMatch ? `${cityMatch[1]}, India` : "India";
      return {
        engine: "google_jobs",
        q: sanitizedQuery,
        location: location,
        gl: "in",
        hl: "en",
        api_key: apiKey
      };
    }
    case "courses": {
      return {
        engine: "youtube",
        search_query: sanitizedQuery,
        gl: "in",
        hl: "en",
        api_key: apiKey
      };
    }
    case "news": {
      return {
        engine: "google_news",
        q: sanitizedQuery,
        gl: "in",
        hl: "en",
        api_key: apiKey
      };
    }
    case "research": {
      return {
        engine: "google_scholar_author",
        author_id: "2bMjtGkAAAAJ",
        hl: "en",
        num: "15",
        api_key: apiKey
      };
    }
    case "fallback":
    default: {
      return {
        engine: "google",
        q: sanitizedQuery,
        gl: "in",
        hl: "en",
        num: "5",
        api_key: apiKey
      };
    }
  }
}

/**
 * Main Netlify Function Handler
 */
exports.handler = async function (event, context) {
  const headers = resolveCorsHeaders(event.headers || {});

  // Handle CORS Preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers
    };
  }

  // Enforce POST method only
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...headers, "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Method Not Allowed. Use POST." })
    };
  }

  // 1. Origin / Referer Abuse Protection
  if (!isOriginAllowed(event.headers || {})) {
    return {
      statusCode: 403,
      headers: { ...headers, "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Forbidden origin." })
    };
  }

  // 2. IP Rate Limiting (20 requests per 10 minutes)
  const rateLimitResult = checkRateLimit(event.headers || {});
  if (!rateLimitResult.allowed) {
    return {
      statusCode: 429,
      headers: {
        ...headers,
        "Cache-Control": "no-store",
        "Retry-After": String(rateLimitResult.retryAfterSeconds || 60)
      },
      body: JSON.stringify({ error: "Too many requests. Please try again later." })
    };
  }

  // 3. Body Parsing and Strict Input Validation
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers: { ...headers, "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Invalid JSON request body." })
    };
  }

  const { intent, query } = payload;

  // Validate Intent against Allow-List
  if (!intent || !ALLOWED_INTENTS.includes(intent)) {
    return {
      statusCode: 400,
      headers: { ...headers, "Cache-Control": "no-store" },
      body: JSON.stringify({
        error: `Invalid intent. Allowed: ${ALLOWED_INTENTS.join(", ")}`
      })
    };
  }

  // Validate Query: String, 2-200 chars, strip control characters
  if (typeof query !== "string") {
    return {
      statusCode: 400,
      headers: { ...headers, "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Query must be a string." })
    };
  }

  const sanitizedQuery = query.replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (sanitizedQuery.length < 2 || sanitizedQuery.length > 200) {
    return {
      statusCode: 400,
      headers: { ...headers, "Cache-Control": "no-store" },
      body: JSON.stringify({
        error: "Query must be between 2 and 200 characters in length."
      })
    };
  }

  // 4. In-Memory Cache Lookup (Normalized Key)
  const normalizedKey = `${intent}:${sanitizedQuery.toLowerCase().replace(/\s+/g, " ")}`;
  const now = Date.now();
  const cachedEntry = responseCache.get(normalizedKey);

  if (cachedEntry && now < cachedEntry.expiresAt) {
    console.log(JSON.stringify({ intent, cache: "hit", status: 200 }));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        results: cachedEntry.data,
        intent,
        cached: true,
        demo: cachedEntry.demo || false
      })
    };
  }

  // 5. DEMO_MODE Check (Conserves Free Tier Searches)
  const isDemoMode = process.env.DEMO_MODE === "true";
  if (isDemoMode) {
    const demoData = loadDemoData();
    const demoResults = (demoData && demoData[intent]) ? demoData[intent].slice(0, 5) : [];

    responseCache.set(normalizedKey, {
      data: demoResults,
      expiresAt: now + CACHE_TTL_MS,
      demo: true
    });

    console.log(JSON.stringify({ intent, cache: "miss", demo: true, status: 200 }));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        results: demoResults,
        intent,
        cached: false,
        demo: true
      })
    };
  }

  // 6. Live SerpApi Execution
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.error("SERPAPI_KEY configuration is missing on server.");
    return {
      statusCode: 500,
      headers: { ...headers, "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Search service is temporarily unconfigured." })
    };
  }

  const serpParams = buildSerpApiParams(intent, sanitizedQuery, apiKey);
  const endpoint = "https://serpapi.com/search.json?" + new URLSearchParams(serpParams).toString();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const upstreamRes = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    clearTimeout(timeoutId);

    if (!upstreamRes.ok) {
      console.error(JSON.stringify({ intent, upstreamStatus: upstreamRes.status }));
      return {
        statusCode: 502,
        headers: { ...headers, "Cache-Control": "no-store" },
        body: JSON.stringify({ error: "Upstream search service returned an error." })
      };
    }

    const data = await upstreamRes.json();

    if (data.error) {
      console.error(JSON.stringify({ intent, upstreamError: "SerpApi reported error" }));
      return {
        statusCode: 502,
        headers: { ...headers, "Cache-Control": "no-store" },
        body: JSON.stringify({ error: "Search query could not be completed." })
      };
    }

    // Shape results by engine type
    let shaped = [];
    switch (intent) {
      case "jobs":
        shaped = shapeJobResults(data.jobs_results || []);
        break;
      case "courses":
        shaped = shapeYoutubeResults(data.video_results || []);
        break;
      case "news":
        shaped = shapeNewsResults(data.news_results || []);
        break;
      case "research":
        shaped = shapeScholarAuthorResults(data.articles || [], sanitizedQuery);
        break;
      case "fallback":
      default:
        shaped = shapeGoogleResults(data.organic_results || []);
        break;
    }

    // Store shaped results in memory cache
    responseCache.set(normalizedKey, {
      data: shaped,
      expiresAt: now + CACHE_TTL_MS,
      demo: false
    });

    console.log(JSON.stringify({ intent, cache: "miss", count: shaped.length, status: 200 }));
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        results: shaped,
        intent,
        cached: false,
        demo: false
      })
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return {
        statusCode: 504,
        headers: { ...headers, "Cache-Control": "no-store" },
        body: JSON.stringify({ error: "Search request timed out after 8 seconds." })
      };
    }

    console.error(JSON.stringify({ intent, error: "Network or processing failure" }));
    return {
      statusCode: 500,
      headers: { ...headers, "Cache-Control": "no-store" },
      body: JSON.stringify({ error: "Internal search processing failed." })
    };
  }
};
