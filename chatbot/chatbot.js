/**
 * Student Growth Assistant (SGA) - Chatbot Client
 * Hackathon: SerpApi India Hackathon 2026 (Knowledge & Public Interest)
 * 
 * Non-Negotiable Rules & Security Controls:
 * 1. NEVER reads, sends, or displays student data. Operates strictly on user chat input.
 * 2. API secret tokens are never stored or referenced client-side (isolated in Netlify function).
 * 3. Builds all DOM using document.createElement and textContent. Zero HTML parsing on dynamic data.
 * 4. Strictly validates all links: only allows http:// and https:// protocols.
 * 5. Handles loading (animated typing), empty ("could not find"), error (friendly), and offline states.
 * 6. Disables send button while pending; debounces identical messages within 3 seconds.
 * 7. Keyword/Regex client-side intent detection (jobs, courses, news, research, fallback).
 */

(function () {
  "use strict";

  // Prevent duplicate initializations
  if (document.getElementById("sga-widget-container")) {
    return;
  }

  // --- Configuration & Constants ---
  const CHIPS = [
    "Internships",
    "Free courses",
    "Scholarships",
    "My mentor's research"
  ];

  const API_ENDPOINT = "/api/search";
  const FALLBACK_ENDPOINT = "/.netlify/functions/search";

  let isChatOpen = false;
  let isSending = false;
  let lastMessageText = "";
  let lastMessageTime = 0;

  // --- DOM Elements References ---
  let widgetContainer = null;
  let launcherBtn = null;
  let chatWindow = null;
  let messagesContainer = null;
  let chatForm = null;
  let chatInput = null;
  let sendButton = null;
  let typingElement = null;

  // --- Utility: Safe SVG Icon Generator ---
  function createSvgElement(tag, attrs) {
    const elem = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const key in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, key)) {
        elem.setAttribute(key, attrs[key]);
      }
    }
    return elem;
  }

  function createChatIcon() {
    const svg = createSvgElement("svg", {
      viewBox: "0 0 24 24",
      width: "28",
      height: "28",
      fill: "currentColor"
    });
    const path = createSvgElement("path", {
      d: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
    });
    svg.appendChild(path);
    return svg;
  }

  function createSendIcon() {
    const svg = createSvgElement("svg", {
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      fill: "currentColor"
    });
    const path = createSvgElement("path", {
      d: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"
    });
    svg.appendChild(path);
    return svg;
  }

  /**
   * Sanitizes external URLs: strictly permits http:// and https://
   */
  function sanitizeUrl(rawUrl) {
    if (typeof rawUrl === "string" && /^https?:\/\//i.test(rawUrl.trim())) {
      return rawUrl.trim();
    }
    return "https://www.google.com";
  }

  // --- Client-Side Intent Detection (Regex / Keyword Based, No LLM) ---
  function detectIntent(text) {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    // Direct chip clicks
    if (lower === "internships") return "jobs";
    if (lower === "free courses") return "courses";
    if (lower === "scholarships") return "news";
    if (lower === "my mentor's research" || lower === "mentor research") return "research";

    // Intent 1: Jobs & Internships (google_jobs engine)
    if (/\b(internship|internships|job|jobs|placement|placements|hiring|fresher|freshers|vacancy|vacancies)\b/i.test(lower)) {
      return "jobs";
    }

    // Intent 2: Free Courses & Tutorials (youtube engine)
    if (/\b(course|courses|learn|tutorial|tutorials|certification|certifications|roadmap|roadmaps)\b/i.test(lower)) {
      return "courses";
    }

    // Intent 3: Scholarships & Exam Alerts (google_news engine)
    if (/\b(scholarship|scholarships|exam|exams|result|results|notification|notifications|admission|admissions|deadline|deadlines)\b/i.test(lower)) {
      return "news";
    }

    // Intent 4: Mentor's Research (google_scholar_author engine)
    if (/\b(mentor|mentors|research|paper|papers|publication|publications|scholar)\b/i.test(lower)) {
      return "research";
    }

    // Vague / Ambiguous Greetings
    if (/^(hi|hello|hey|help|info|start|good morning|good afternoon|good evening|\?)$/i.test(lower)) {
      return "unclear";
    }

    // Fallback: General Academic & Web Search (google organic engine)
    return "fallback";
  }

  // --- Build Chatbot UI Structure ---
  function initUI() {
    widgetContainer = document.createElement("div");
    widgetContainer.id = "sga-widget-container";
    widgetContainer.className = "sga-widget-root";

    launcherBtn = document.createElement("button");
    launcherBtn.id = "sga-launcher";
    launcherBtn.className = "sga-launcher";
    launcherBtn.setAttribute("type", "button");
    launcherBtn.setAttribute("aria-label", "Open Student Growth Assistant chat");
    launcherBtn.setAttribute("aria-expanded", "false");
    launcherBtn.appendChild(createChatIcon());

    chatWindow = document.createElement("div");
    chatWindow.id = "sga-window";
    chatWindow.className = "sga-window";
    chatWindow.setAttribute("role", "dialog");
    chatWindow.setAttribute("aria-label", "Student Growth Assistant chat");
    chatWindow.setAttribute("hidden", "true");

    // Header
    const header = document.createElement("div");
    header.className = "sga-header";

    const headerInfo = document.createElement("div");
    headerInfo.className = "sga-header-info";

    const title = document.createElement("h3");
    title.className = "sga-title";
    const statusDot = document.createElement("span");
    statusDot.className = "sga-status-dot";
    title.appendChild(statusDot);
    title.appendChild(document.createTextNode("Student Growth Assistant"));

    const subtitle = document.createElement("p");
    subtitle.className = "sga-subtitle";
    subtitle.textContent = "Live search data via SerpApi";

    headerInfo.appendChild(title);
    headerInfo.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.className = "sga-close-btn";
    closeBtn.setAttribute("type", "button");
    closeBtn.setAttribute("aria-label", "Close chat");
    closeBtn.textContent = "\u00D7";

    header.appendChild(headerInfo);
    header.appendChild(closeBtn);

    // Messages Area
    messagesContainer = document.createElement("div");
    messagesContainer.id = "sga-messages";
    messagesContainer.className = "sga-messages";
    messagesContainer.setAttribute("role", "log");
    messagesContainer.setAttribute("aria-live", "polite");

    // Input Area
    chatForm = document.createElement("form");
    chatForm.className = "sga-form";
    chatForm.setAttribute("autocomplete", "off");

    chatInput = document.createElement("input");
    chatInput.type = "text";
    chatInput.className = "sga-input";
    chatInput.setAttribute("placeholder", "Ask about internships, courses, scholarships...");
    chatInput.setAttribute("aria-label", "Type your question");
    chatInput.setAttribute("maxlength", "200");

    sendButton = document.createElement("button");
    sendButton.type = "submit";
    sendButton.className = "sga-send-btn";
    sendButton.setAttribute("aria-label", "Send message");
    sendButton.appendChild(createSendIcon());

    chatForm.appendChild(chatInput);
    chatForm.appendChild(sendButton);

    chatWindow.appendChild(header);
    chatWindow.appendChild(messagesContainer);
    chatWindow.appendChild(chatForm);

    widgetContainer.appendChild(launcherBtn);
    widgetContainer.appendChild(chatWindow);
    document.body.appendChild(widgetContainer);

    launcherBtn.addEventListener("click", toggleChat);
    closeBtn.addEventListener("click", closeChat);
    chatForm.addEventListener("submit", handleSubmit);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isChatOpen) {
        closeChat();
      }
    });

    renderWelcomeMessage();
  }

  function toggleChat() {
    if (isChatOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  function openChat() {
    isChatOpen = true;
    chatWindow.removeAttribute("hidden");
    launcherBtn.setAttribute("aria-expanded", "true");
    scrollToBottom();
    if (window.innerWidth > 480) {
      setTimeout(function () {
        chatInput.focus();
      }, 100);
    }
  }

  function closeChat() {
    isChatOpen = false;
    chatWindow.setAttribute("hidden", "true");
    launcherBtn.setAttribute("aria-expanded", "false");
    launcherBtn.focus();
  }

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // --- Safe DOM Rendering (Safe createElement & textContent Only) ---
  function appendUserMessage(text) {
    const row = document.createElement("div");
    row.className = "sga-msg-row sga-msg-row-user";

    const bubble = document.createElement("div");
    bubble.className = "sga-bubble sga-bubble-user";
    bubble.textContent = text;

    row.appendChild(bubble);
    messagesContainer.appendChild(row);
    scrollToBottom();
  }

  function appendBotMessage(text, options) {
    const row = document.createElement("div");
    row.className = "sga-msg-row sga-msg-row-bot";

    const bubble = document.createElement("div");
    bubble.className = "sga-bubble sga-bubble-bot";
    bubble.textContent = text;

    // Optional Result Cards Rendering (Max 5 cards)
    if (options && Array.isArray(options.cards) && options.cards.length > 0) {
      const cardsContainer = document.createElement("div");
      cardsContainer.className = "sga-cards-container";

      options.cards.slice(0, 5).forEach(function (card) {
        const cardElem = document.createElement("div");
        cardElem.className = "sga-card";

        const cardTitle = document.createElement("div");
        cardTitle.className = "sga-card-title";
        cardTitle.textContent = card.title || "Listing";

        const cardSource = document.createElement("div");
        cardSource.className = "sga-card-source";
        cardSource.textContent = card.source || "Verified Source";

        const cardSnippet = document.createElement("div");
        cardSnippet.className = "sga-card-snippet";
        cardSnippet.textContent = card.snippet || "";

        const cardFooter = document.createElement("div");
        cardFooter.className = "sga-card-footer";

        const cardExtra = document.createElement("span");
        cardExtra.className = "sga-card-extra";
        cardExtra.textContent = card.extra || "";

        const cardBtn = document.createElement("a");
        cardBtn.className = "sga-card-btn";
        cardBtn.setAttribute("href", sanitizeUrl(card.link));
        cardBtn.setAttribute("target", "_blank");
        cardBtn.setAttribute("rel", "noopener noreferrer");
        cardBtn.textContent = "Open";

        cardFooter.appendChild(cardExtra);
        cardFooter.appendChild(cardBtn);

        cardElem.appendChild(cardTitle);
        cardElem.appendChild(cardSource);
        cardElem.appendChild(cardSnippet);
        cardElem.appendChild(cardFooter);

        cardsContainer.appendChild(cardElem);
      });

      bubble.appendChild(cardsContainer);
    }

    // Optional Quick Reply Chips
    if (options && options.chips && options.chips.length > 0) {
      const chipsContainer = document.createElement("div");
      chipsContainer.className = "sga-chips";

      options.chips.forEach(function (chipText) {
        const chipBtn = document.createElement("button");
        chipBtn.type = "button";
        chipBtn.className = "sga-chip";
        chipBtn.textContent = chipText;
        chipBtn.addEventListener("click", function () {
          handleChipClick(chipText);
        });
        chipsContainer.appendChild(chipBtn);
      });

      bubble.appendChild(chipsContainer);
    }

    row.appendChild(bubble);
    messagesContainer.appendChild(row);
    scrollToBottom();
  }

  // --- Typing Indicator ---
  function showTypingIndicator() {
    if (typingElement) return;

    const row = document.createElement("div");
    row.className = "sga-msg-row sga-msg-row-bot sga-typing-row";

    typingElement = document.createElement("div");
    typingElement.className = "sga-typing";

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement("span");
      dot.className = "sga-dot";
      typingElement.appendChild(dot);
    }

    row.appendChild(typingElement);
    messagesContainer.appendChild(row);
    scrollToBottom();
  }

  function hideTypingIndicator() {
    if (typingElement && typingElement.parentNode) {
      typingElement.parentNode.remove();
      typingElement = null;
    }
  }

  // --- Initial Welcome Message ---
  function renderWelcomeMessage() {
    const greeting =
      "Hello! I am your Student Growth Assistant.\n\n" +
      "I answer your academic and career questions using live search data from SerpApi. " +
      "What would you like to explore today?";

    appendBotMessage(greeting, { chips: CHIPS });
  }

  // --- API Communication with Netlify Function ---
  async function performLiveSearch(intent, query) {
    const payload = JSON.stringify({ intent: intent, query: query });
    const endpointsToTry = [API_ENDPOINT, FALLBACK_ENDPOINT];

    let lastError = null;

    for (const url of endpointsToTry) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload
        });

        if (response.ok) {
          const data = await response.json();
          return data;
        }

        // If 404 on rewritten endpoint, attempt fallback
        if (response.status === 404 && url === API_ENDPOINT) {
          continue;
        }

        const errJson = await response.json().catch(function () { return {}; });
        throw new Error(errJson.error || "Search error");
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("Connection failed");
  }

  // --- Handling User Submissions ---
  function handleChipClick(chipText) {
    if (isSending) return;
    sendMessage(chipText);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (isSending) return;
    const text = chatInput.value.trim();
    if (!text) return;
    sendMessage(text);
  }

  async function sendMessage(text) {
    const now = Date.now();

    // UX Rule: Ignore empty or repeated identical messages sent within 3 seconds
    if (text === lastMessageText && now - lastMessageTime < 3000) {
      return;
    }

    lastMessageText = text;
    lastMessageTime = now;

    // Display user message bubble
    appendUserMessage(text);
    chatInput.value = "";

    // Offline State Check
    if (!navigator.onLine) {
      appendBotMessage(
        "You appear to be offline. Please verify your internet connection and try again.",
        { chips: CHIPS }
      );
      return;
    }

    // Step 5: Intent Detection
    const intent = detectIntent(text);

    // Unclear / Ambiguous Intent: Ask clarifying question and offer chips
    if (intent === "unclear") {
      appendBotMessage(
        "I can help you search live information on internships, free courses, scholarships, or your mentor's research. Please choose an option below or type a specific topic:",
        { chips: CHIPS }
      );
      return;
    }

    // Lock UI and show typing indicator
    isSending = true;
    sendButton.disabled = true;
    showTypingIndicator();

    try {
      // Connect to Netlify function
      const data = await performLiveSearch(intent, text);
      hideTypingIndicator();

      if (!data.results || data.results.length === 0) {
        // Empty Results State
        appendBotMessage(
          "I couldn't find any results for that query. Try using different keywords or select one of the topics below:",
          { chips: CHIPS }
        );
      } else {
        // Build introductory message tailored to intent
        let introText = "Here are the top results for your search:";
        if (intent === "jobs") {
          introText = "Here are live internship & job listings via Google Jobs:";
        } else if (intent === "courses") {
          introText = "Here are recommended learning tutorials via YouTube:";
        } else if (intent === "news") {
          introText = "Here are latest academic notices & scholarships via Google News:";
        } else if (intent === "research") {
          introText = "Here are verified publications by your mentor (Google Scholar Author ID: 2bMjtGkAAAAJ):";
        }

        // Render card results (max 5)
        appendBotMessage(introText, { cards: data.results });
      }
    } catch (err) {
      hideTypingIndicator();
      // Error State: Friendly user message, zero technical leakage
      appendBotMessage(
        "I ran into an issue retrieving search data. Please try again shortly or select a category below:",
        { chips: CHIPS }
      );
    } finally {
      // Unlock UI
      isSending = false;
      sendButton.disabled = false;
      chatInput.focus();
    }
  }

  // Initialize widget once DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initUI);
  } else {
    initUI();
  }
})();
