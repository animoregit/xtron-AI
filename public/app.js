/* ================================================================
   XTRON X1 — Client Application
   ================================================================ */
(() => {
  "use strict";

  // ── DOM refs ────────────────────────────────────────────────────
  const $ = (s) => document.querySelector(s);
  const sidebar        = $("#sidebar");
  const overlay        = $("#sidebar-overlay");
  const btnOpen        = $("#btn-open-sidebar");
  const btnClose       = $("#btn-close-sidebar");
  const btnNew         = $("#btn-new-chat");
  const chatHistory    = $("#chat-history");
  const messagesEl     = $("#messages");
  const welcomeEl      = $("#welcome");
  const chatForm       = $("#chat-form");
  const userInput      = $("#user-input");
  const btnSend        = $("#btn-send");
  const topbarTitle    = $("#topbar-title");
  const topbarStatus   = $("#topbar-status");

  // ── State ───────────────────────────────────────────────────────
  let conversations = [];   // [{ id, title, messages: [{role, content}] }]
  let activeId = null;
  let isStreaming = false;

  // ── Init ────────────────────────────────────────────────────────
  loadState();
  if (conversations.length === 0) newChat();
  else { activeId = conversations[0].id; renderHistory(); showConversation(); }
  checkOllama();

  // ── Sidebar toggling ───────────────────────────────────────────
  btnOpen.addEventListener("click", openSidebar);
  btnClose.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);

  function openSidebar()  { sidebar.classList.add("open"); overlay.classList.add("visible"); }
  function closeSidebar() { sidebar.classList.remove("open"); overlay.classList.remove("visible"); }

  // ── New chat ───────────────────────────────────────────────────
  btnNew.addEventListener("click", () => { newChat(); closeSidebar(); });

  function newChat() {
    const conv = { id: crypto.randomUUID(), title: "New Chat", messages: [] };
    conversations.unshift(conv);
    activeId = conv.id;
    saveState();
    renderHistory();
    showConversation();
  }

  // ── Render sidebar history ─────────────────────────────────────
  function renderHistory() {
    chatHistory.innerHTML = "";
    for (const c of conversations) {
      const el = document.createElement("div");
      el.className = "chat-history-item" + (c.id === activeId ? " active" : "");
      el.innerHTML = `<span class="hist-icon">💬</span><span class="hist-label"></span>`;
      el.querySelector(".hist-label").textContent = c.title;
      el.addEventListener("click", () => {
        activeId = c.id;
        renderHistory();
        showConversation();
        closeSidebar();
      });
      chatHistory.appendChild(el);
    }
  }

  // ── Show active conversation ───────────────────────────────────
  function showConversation() {
    const conv = active();
    if (!conv) return;
    topbarTitle.textContent = conv.title;
    messagesEl.innerHTML = "";

    if (conv.messages.length === 0) {
      messagesEl.classList.remove("has-messages");
      welcomeEl.classList.remove("hidden");
    } else {
      welcomeEl.classList.add("hidden");
      messagesEl.classList.add("has-messages");
      for (const m of conv.messages) appendRenderedMessage(m.role, m.content);
    }
    scrollBottom();
  }

  // ── Active helper ──────────────────────────────────────────────
  function active() { return conversations.find((c) => c.id === activeId); }

  // ── Chips ──────────────────────────────────────────────────────
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      userInput.value = chip.dataset.prompt;
      userInput.dispatchEvent(new Event("input"));
      userInput.focus();
    });
  });

  // ── Text area auto-resize ──────────────────────────────────────
  userInput.addEventListener("input", () => {
    btnSend.disabled = !userInput.value.trim() || isStreaming;
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 180) + "px";
  });

  // ── Submit (Enter / button) ────────────────────────────────────
  chatForm.addEventListener("submit", (e) => { e.preventDefault(); send(); });
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });

  // ── Send message ───────────────────────────────────────────────
  async function send() {
    const text = userInput.value.trim();
    if (!text || isStreaming) return;

    const conv = active();
    conv.messages.push({ role: "user", content: text });

    // Auto-title from first user message
    if (conv.messages.filter((m) => m.role === "user").length === 1) {
      conv.title = text.slice(0, 60) + (text.length > 60 ? "…" : "");
      topbarTitle.textContent = conv.title;
      renderHistory();
    }

    welcomeEl.classList.add("hidden");
    messagesEl.classList.add("has-messages");
    appendRenderedMessage("user", text);

    userInput.value = "";
    userInput.style.height = "auto";
    btnSend.disabled = true;
    scrollBottom();
    saveState();

    await fetchResponse(conv);
  }

  // ── Stream from backend ────────────────────────────────────────
  async function fetchResponse(conv) {
    isStreaming = true;
    const { msgContent, loader } = appendAssistantPlaceholder();
    let fullText = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conv.messages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      loader.remove();

      let lineBuffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (obj.message && obj.message.content) {
              fullText += obj.message.content;
              renderMarkdown(msgContent, fullText);
              scrollBottom();
            }
          } catch { /* partial JSON line */ }
        }
      }

      if (lineBuffer.trim()) {
        try {
          const obj = JSON.parse(lineBuffer);
          if (obj.message && obj.message.content) {
            fullText += obj.message.content;
            renderMarkdown(msgContent, fullText);
            scrollBottom();
          }
        } catch { /* ignore */ }
      }

      conv.messages.push({ role: "assistant", content: fullText });
      saveState();
    } catch (err) {
      loader.remove();
      const banner = document.createElement("div");
      banner.className = "error-banner";
      banner.textContent = err.message;
      msgContent.appendChild(banner);
    } finally {
      isStreaming = false;
      btnSend.disabled = !userInput.value.trim();
    }
  }

  // ── DOM builders ───────────────────────────────────────────────
  function appendRenderedMessage(role, content) {
    const wrap = document.createElement("div");
    wrap.className = `msg ${role}`;

    const row = document.createElement("div");
    row.className = "msg-row";

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = role === "user" ? "Y" : "X";

    const body = document.createElement("div");
    body.className = "msg-body";

    const label = document.createElement("div");
    label.className = "msg-label";
    label.textContent = role === "user" ? "You" : "XTRON X1";

    const contentEl = document.createElement("div");
    contentEl.className = "msg-content";
    renderMarkdown(contentEl, content);

    body.appendChild(label);
    body.appendChild(contentEl);
    row.appendChild(avatar);
    row.appendChild(body);
    wrap.appendChild(row);
    messagesEl.appendChild(wrap);
    return contentEl;
  }

  function appendAssistantPlaceholder() {
    const wrap = document.createElement("div");
    wrap.className = "msg assistant";

    const row = document.createElement("div");
    row.className = "msg-row";

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = "X";

    const body = document.createElement("div");
    body.className = "msg-body";

    const label = document.createElement("div");
    label.className = "msg-label";
    label.textContent = "XTRON X1";

    const msgContent = document.createElement("div");
    msgContent.className = "msg-content";

    const loader = document.createElement("div");
    loader.className = "loading-dots";
    loader.innerHTML = "<span></span><span></span><span></span>";
    msgContent.appendChild(loader);

    body.appendChild(label);
    body.appendChild(msgContent);
    row.appendChild(avatar);
    row.appendChild(body);
    wrap.appendChild(row);
    messagesEl.appendChild(wrap);
    scrollBottom();
    return { msgContent, loader };
  }

  // ── Markdown renderer (safe, no innerHTML from user text) ──────
  function renderMarkdown(container, raw) {
    container.innerHTML = "";
    const html = markdownToHTML(raw);
    container.innerHTML = html;

    // Wire up copy buttons
    container.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const code = btn.closest(".code-block-wrapper").querySelector("code").textContent;
        navigator.clipboard.writeText(code).then(() => {
          btn.classList.add("copied");
          btn.querySelector(".copy-label").textContent = "Copied!";
          setTimeout(() => {
            btn.classList.remove("copied");
            btn.querySelector(".copy-label").textContent = "Copy";
          }, 2000);
        });
      });
    });
  }

  /* ── Minimal Markdown → HTML ──────────────────────────────────
     Handles: code blocks, inline code, bold, italic, links,
     headings, blockquotes, lists (ul/ol), hr, tables, paragraphs.
     All user text is escaped first for safety. */

  function markdownToHTML(src) {
    // Separate code blocks first to avoid escaping code content
    const blocks = [];
    let safe = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const idx = blocks.length;
      blocks.push({ lang: lang || "", code });
      return `%%CODEBLOCK_${idx}%%`;
    });

    // Escape HTML in the non-code parts
    safe = escapeHTML(safe);

    // Restore code blocks (with syntax highlighting)
    safe = safe.replace(/%%CODEBLOCK_(\d+)%%/g, (_, i) => {
      const b = blocks[+i];
      const highlighted = highlightSyntax(escapeHTML(b.code), b.lang);
      const langLabel = b.lang ? b.lang : "code";
      return (
        `<div class="code-block-wrapper">` +
          `<div class="code-block-header">` +
            `<span class="code-lang">${escapeHTML(langLabel)}</span>` +
            `<button class="copy-btn"><span class="copy-label">Copy</span></button>` +
          `</div>` +
          `<pre><code>${highlighted}</code></pre>` +
        `</div>`
      );
    });

    // Inline code (after block code so backtick-fences don't interfere)
    safe = safe.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Tables (simple pipe tables)
    safe = safe.replace(
      /(?:^|\n)(\|.+\|)\n(\|[\s\-:|]+\|)\n((?:\|.+\|\n?)+)/g,
      (_, header, _sep, bodyRows) => {
        const ths = header.split("|").filter(Boolean).map((h) => `<th>${h.trim()}</th>`).join("");
        const rows = bodyRows.trim().split("\n").map((row) => {
          const tds = row.split("|").filter(Boolean).map((c) => `<td>${c.trim()}</td>`).join("");
          return `<tr>${tds}</tr>`;
        }).join("");
        return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
      }
    );

    // Headings
    safe = safe.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
    safe = safe.replace(/^### (.+)$/gm,  "<h3>$1</h3>");
    safe = safe.replace(/^## (.+)$/gm,   "<h2>$1</h2>");
    safe = safe.replace(/^# (.+)$/gm,    "<h1>$1</h1>");

    // Horizontal rules
    safe = safe.replace(/^(?:---|\*\*\*|___)$/gm, "<hr>");

    // Bold / Italic
    safe = safe.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    safe = safe.replace(/\*\*(.+?)\*\*/g,    "<strong>$1</strong>");
    safe = safe.replace(/\*(.+?)\*/g,        "<em>$1</em>");

    // Links [text](url)
    safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Blockquotes
    safe = safe.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

    // Unordered lists
    safe = safe.replace(/(?:^|\n)((?:[\-*] .+\n?)+)/g, (_, block) => {
      const items = block.trim().split("\n").map((l) => `<li>${l.replace(/^[\-*] /, "")}</li>`).join("");
      return `<ul>${items}</ul>`;
    });

    // Ordered lists
    safe = safe.replace(/(?:^|\n)((?:\d+\. .+\n?)+)/g, (_, block) => {
      const items = block.trim().split("\n").map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("");
      return `<ol>${items}</ol>`;
    });

    // Paragraphs: wrap remaining text lines
    safe = safe
      .split("\n\n")
      .map((block) => {
        const trimmed = block.trim();
        if (!trimmed) return "";
        if (/^<(?:h[1-6]|ul|ol|blockquote|table|div|hr|pre)/.test(trimmed)) return trimmed;
        return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
      })
      .join("\n");

    return safe;
  }

  function escapeHTML(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ── Syntax Highlighter (lightweight, token-based) ────────────
     Covers: keywords, strings, comments, numbers, functions,
     built-ins, operators, punctuation, class names, HTML tags+attrs. */

  function highlightSyntax(code, lang) {
    const l = lang.toLowerCase();
    if (["html", "xml", "svg"].includes(l))   return highlightHTML(code);
    if (["css", "scss", "less"].includes(l))   return highlightCSS(code);
    return highlightGeneric(code, l);
  }

  function highlightGeneric(code, lang) {
    // Order matters: comments first, then strings, then the rest
    const rules = [
      // Line comments
      [/(\/\/.*)/g,                                          '<span class="tok-comment">$1</span>'],
      // Block comments
      [/(\/\*[\s\S]*?\*\/)/g,                               '<span class="tok-comment">$1</span>'],
      // Hash comments (Python, Ruby, Shell)
      [/(#.*)/g,                                             '<span class="tok-comment">$1</span>'],
      // Strings (double-quoted, single-quoted, template literals)
      [/(&quot;(?:[^&]|&(?!quot;))*?&quot;)/g,               '<span class="tok-string">$1</span>'],
      [/(&#39;(?:[^&]|&(?!#39;))*?&#39;)/g,                  '<span class="tok-string">$1</span>'],
      [/(`[^`]*`)/g,                                         '<span class="tok-string">$1</span>'],
      // Numbers
      [/\b(\d+\.?\d*)\b/g,                                  '<span class="tok-number">$1</span>'],
      // Keywords (JS/TS/Python/Rust/Go/Java/C++)
      [/\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|import|export|from|default|async|await|yield|try|catch|finally|throw|new|typeof|instanceof|void|delete|in|of|def|self|elif|pass|raise|with|as|lambda|print|True|False|None|fn|pub|mod|use|struct|impl|enum|match|loop|mut|ref|move|trait|type|where|interface|package|func|defer|go|chan|select|range|map|public|private|protected|static|final|abstract|synchronized|volatile|transient|native|throws|implements|super|this)\b/g,
        '<span class="tok-keyword">$1</span>'],
      // Built-ins
      [/\b(console|document|window|Math|JSON|Object|Array|String|Number|Boolean|Promise|Set|Map|RegExp|Error|Date|parseInt|parseFloat|setTimeout|setInterval|fetch|require|module|exports|process|global|undefined|null|NaN|Infinity|len|range|str|int|float|list|dict|tuple|set|bool|print|input|open|super|iter|next|zip|enumerate|sorted|filter|reduce|any|all|isinstance|issubclass|getattr|setattr|hasattr|callable|property|staticmethod|classmethod|println|fmt|vec|Box|Option|Result|Some|Ok|Err)\b/g,
        '<span class="tok-builtin">$1</span>'],
      // Function calls
      [/\b([a-zA-Z_]\w*)\s*(?=\()/g,                        '<span class="tok-function">$1</span>'],
      // Operators
      [/([+\-*/%=&lt;&gt;!&amp;|^~?:]+)/g,                  '<span class="tok-operator">$1</span>'],
      // Punctuation
      [/([{}[\]();,.])/g,                                    '<span class="tok-punct">$1</span>'],
    ];

    let result = code;
    for (const [regex, replacement] of rules) {
      result = result.replace(regex, replacement);
    }
    return result;
  }

  function highlightHTML(code) {
    return code
      .replace(/(&lt;\/?)([\w-]+)/g, '$1<span class="tok-tag">$2</span>')
      .replace(/([\w-]+)(=)/g, '<span class="tok-attr">$1</span>$2')
      .replace(/(&quot;[^&]*?&quot;)/g, '<span class="tok-value">$1</span>')
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>');
  }

  function highlightCSS(code) {
    return code
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>')
      .replace(/(#[\da-fA-F]{3,8})\b/g, '<span class="tok-number">$1</span>')
      .replace(/(\d+\.?\d*(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?)\b/g, '<span class="tok-number">$1</span>')
      .replace(/([\w-]+)\s*(?=:)/g, '<span class="tok-property">$1</span>')
      .replace(/(@[\w-]+)/g, '<span class="tok-keyword">$1</span>')
      .replace(/([.#][\w-]+)/g, '<span class="tok-function">$1</span>');
  }

  // ── Utilities ──────────────────────────────────────────────────
  function scrollBottom() {
    requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
  }

  async function checkOllama() {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.ok) {
        topbarStatus.textContent = "● Online";
        topbarStatus.className = "topbar-status online";
      } else {
        topbarStatus.textContent = "● Offline";
        topbarStatus.className = "topbar-status offline";
      }
    } catch {
      topbarStatus.textContent = "● Offline";
      topbarStatus.className = "topbar-status offline";
    }
  }

  // ── Persistence (localStorage) ─────────────────────────────────
  const STORAGE_KEY = "xtron_x1_state";

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations)); } catch { /* quota */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) conversations = JSON.parse(raw);
    } catch { conversations = []; }
  }
})();
