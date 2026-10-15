const express = require("express");
const http = require("http");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = "127.0.0.1";
const OLLAMA_PORT = 11434;
const MODEL_NAME = "xtron-x1";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ── Health check for Ollama ──────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  const probe = http.request(
    { hostname: OLLAMA_HOST, port: OLLAMA_PORT, path: "/", method: "GET", timeout: 4000 },
    (ollamaRes) => {
      let body = "";
      ollamaRes.on("data", (c) => (body += c));
      ollamaRes.on("end", () => res.json({ ok: true, ollama: body.trim() }));
    }
  );
  probe.on("error", () =>
    res.status(503).json({ ok: false, error: "Ollama is not reachable at 127.0.0.1:11434. Make sure it is running." })
  );
  probe.on("timeout", () => {
    probe.destroy();
    res.status(503).json({ ok: false, error: "Ollama connection timed out." });
  });
  probe.end();
});

// ── Streaming chat proxy ─────────────────────────────────────────────
app.post("/api/chat", (req, res) => {
  const messages = req.body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required." });
  }

  const payload = JSON.stringify({ model: MODEL_NAME, messages, stream: true });

  const ollamaReq = http.request(
    {
      hostname: OLLAMA_HOST,
      port: OLLAMA_PORT,
      path: "/api/chat",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      timeout: 120000,
    },
    (ollamaRes) => {
      if (ollamaRes.statusCode !== 200) {
        let errBody = "";
        ollamaRes.on("data", (c) => (errBody += c));
        ollamaRes.on("end", () => {
          try {
            const parsed = JSON.parse(errBody);
            res.status(ollamaRes.statusCode).json({ error: parsed.error || errBody });
          } catch {
            res.status(ollamaRes.statusCode).json({ error: errBody });
          }
        });
        return;
      }

      // Stream the response back to the client
      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      ollamaRes.pipe(res);
    }
  );

  ollamaReq.on("error", (err) => {
    if (!res.headersSent) {
      res.status(503).json({
        error: `Cannot reach Ollama: ${err.message}. Ensure Ollama is running on 127.0.0.1:11434.`,
      });
    }
  });

  ollamaReq.on("timeout", () => {
    ollamaReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: "Ollama request timed out after 120 seconds." });
    }
  });

  ollamaReq.write(payload);
  ollamaReq.end();
});

// ── SPA fallback ─────────────────────────────────────────────────────
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  ⚡  XTRON X1 is live → http://localhost:${PORT}\n`);
});
