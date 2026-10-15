# ⚡ XTRON X1 (xtron-AI)

A private, full-stack AI chat web application powered by a local Ollama model (`xtron-x1`), featuring a premium dark interface, WhatsApp/Telegram-style side-by-side chat layout, real-time token streaming, Markdown rendering, syntax-highlighted code blocks with copy buttons, and persistent conversation history.

---

## 🚀 Features

- **Local & Private:** Connects directly to local Ollama (`http://127.0.0.1:11434`). No external API keys or paid services required.
- **Side-by-Side Chat UI:** User messages in lime/emerald bubbles on the right; assistant responses in clean dark cards on the left.
- **Streaming Responses:** Smooth real-time token streaming from the backend.
- **Markdown & Code Highlighting:** Automatic markdown formatting with syntax highlighting (JavaScript, Python, HTML, CSS, etc.) and one-click code copying.
- **Multi-Conversation History:** Persistent sidebar history saved in `localStorage` with a "New Chat" button.
- **Mobile Responsive:** Clean mobile drawer navigation and touch-friendly layout.
- **Status Indicator:** Live health monitoring displaying Ollama connection status.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Backend:** Node.js, Express
- **AI Engine:** Local [Ollama](https://ollama.com/) with custom `xtron-x1` model

---

## 📦 Getting Started

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- [Ollama](https://ollama.com/) installed and running locally

### 2. Setup Ollama Model

Create the `xtron-x1` model from the included `Modelfile`:

```bash
ollama create xtron-x1 -f Modelfile
```

Ensure Ollama is running:
```bash
ollama serve
```

### 3. Install & Start Application

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Open your browser and navigate to **`http://localhost:3000`**.

---

## 📁 Project Structure

```
xtron-AI/
├── Modelfile          # Ollama model definition
├── package.json       # Node.js project manifest & dependencies
├── server.js          # Express server with Ollama streaming proxy
├── .gitignore         # Ignores node_modules and logs
├── README.md          # Project documentation
└── public/
    ├── index.html     # Semantic HTML interface
    ├── style.css      # Dark UI design system & chat bubble layout
    └── app.js         # Streaming client, markdown parser & state manager
```

---

## 🛡️ License

MIT License. Free to use and customize.
