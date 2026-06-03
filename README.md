<div align="center">

<!-- ═══════════════════════════════ LOGO ═══════════════════════════════ -->

<img src="./docs/logo.svg" width="96" height="96" alt="Context Logo" />

<h1>Context API</h1>

<p><em>The AI-native intelligence layer behind Context — where your documents think.</em></p>

<img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=22&pause=1000&color=4F46E5&center=true&vCenter=true&width=700&lines=AI-Native+Document+Intelligence;RAG+Chat+%C2%B7+Semantic+Search+%C2%B7+Vector+Embeddings;Built+with+TypeScript+%2B+MongoDB+%2B+LangChain" alt="Typing SVG" />

<br/>

<!-- ══════════════════════════════ BADGES ══════════════════════════════ -->

<p>
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white"/>
  <img src="https://img.shields.io/badge/Express-5.x-000000?style=for-the-badge&logo=express&logoColor=white"/>
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white"/>
</p>

<p>
  <img src="https://img.shields.io/badge/LangChain-JS-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white"/>
  <img src="https://img.shields.io/badge/Ollama-Local_AI-000000?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Llama_3.1-8B_Instruct-0466C8?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/Cloudinary-File_Storage-3448C5?style=for-the-badge&logo=cloudinary&logoColor=white"/>
</p>

<p>
  <img src="https://img.shields.io/badge/Jest-172_Tests_Passing-C21325?style=for-the-badge&logo=jest&logoColor=white"/>
  <img src="https://img.shields.io/badge/JWT-Auth-FB015B?style=for-the-badge&logo=jsonwebtokens&logoColor=white"/>
  <img src="https://img.shields.io/badge/Token_Budget-50K_tokens%2Fday-4F46E5?style=for-the-badge"/>
</p>

<br/>

[![OpenAPI Docs](https://img.shields.io/badge/📖_Public_API_Spec-docs/ContextAPI.yaml-4F46E5?style=flat-square)](./docs/ContextAPI.yaml)
[![Postman Public](https://img.shields.io/badge/🧪_Public_Postman_Collection-Import_Ready-FF6C37?style=flat-square)](./docs/postman/Context%20API%20(Public).postman_collection.json)
[![Postman Internal](https://img.shields.io/badge/🔒_Internal_Postman_Collection-Import_Ready-7C3AED?style=flat-square)](./docs/postman/Context%20API%20(Internal).postman_collection.json)

<br/>

[![Context Cloud API](https://img.shields.io/badge/🔗_Paired_With-Context_Cloud_API-4F46E5?style=flat-square)](https://github.com/Ahmed-ElKashif/Context-api)
[![Context Web Frontend](https://img.shields.io/badge/🔗_Paired_With-Context_Web_Frontend-61DAFB?style=flat-square)](https://github.com/youssef1232004/context-mvp-front)
[![Context Mobile App](https://img.shields.io/badge/🔗_Paired_With-Context_Mobile_App-10B981?style=flat-square)](https://github.com/youssef1232004/context-mobile)
[![Context Desktop App](https://img.shields.io/badge/🔗_Paired_With-Context_Desktop_App-2563EB?style=flat-square)](https://github.com/Ahmed-ElKashif/Context-Desktop)

</div>

---

## 📋 Table of Contents

- [What is Context?](#-what-is-context)
- [The AI Pipeline](#-the-ai-pipeline)
- [Architecture](#-architecture)
- [Feature Map](#-feature-map)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [API Overview](#-api-overview)
- [API Documentation](#-api-documentation)
- [Testing](#-testing)
- [Brand & Colors](#-brand--colors)
- [Team & Workflow](#-team--workflow)

---

## 🌐 What is Context?

**Context** is an AI-native personal knowledge base. You upload your documents — PDFs, images, Word files, or plain text snippets — and Context handles the rest: analyzing, embedding, organizing, and answering questions about them.

```
You upload a PDF
     │
     ▼
Context extracts → summarizes → embeds → lets you chat with it
```

It's not just storage. It's a second brain with semantic memory.

> Built for the **ITI ITP R2 2026** Final Project by **Contexters** 🧠🚀

---

## 🤖 The AI Pipeline

Every document uploaded to Context is automatically processed through a multi-stage AI pipeline **asynchronously** — the HTTP response returns in milliseconds while intelligence is built in the background.

```
                         ┌─── Upload ───┐
                         │  (Cloudinary │
 User uploads file ─────▶│  + MongoDB)  │
                         └──────┬───────┘
                                │ fire-and-forget
                                ▼
         ┌──────────────────────────────────────────────┐
         │              AI Orchestrator                  │
         │   (llama3.1:8b via Ollama)                   │
         │                                              │
         │  ✦ Extracts title, summary, tags             │
         │  ✦ Classifies content type                   │
         └──────────────┬───────────────────────────────┘
                        │
             ┌──────────┴──────────┐
             ▼                     ▼
   ┌──────────────────┐  ┌──────────────────────┐
   │ CognitiveLoad    │  │  EmbeddingService     │
   │ (llama3.1:8b)    │  │  (nomic-embed-text,   │
   │                  │  │   768d)               │
   │ Scores: Light /  │  │                       │
   │ Medium / Heavy   │  │ Chunks → Atlas Vector │
   └──────────────────┘  │ Search (MongoDB)      │
                         └──────────────────────┘
```

**Once embedded, documents are queryable via:**

- **RAG Chat** — Ask questions, get grounded answers with citation context
- **Semantic Search** — Natural language search across your entire library
- **Document Comparison** — Local Llama 3.1 8B deep-diffs two documents
- **Synthesis** — Local Llama merges multiple document summaries into one narrative
- **Folder Proposals** — Local Llama clusters your library into a smart folder tree
- **Prettify** — Local Llama formats unstructured docs into structured JSON

---

## 🏛️ Architecture

Context follows a strict **Feature-Based, Service-Controller** architecture enforced across all team rotations:

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────────────────────┐
│                     Express Router                   │
│   protect (JWT) → checkTokenBudget → controller     │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │      Controller        │
            │   (HTTP layer only)    │
            │  parse → delegate      │
            └──────────┬─────────────┘
                       │
                       ▼
            ┌────────────────────────┐
            │        Service         │
            │  (pure business logic) │
            │  no req / no res       │
            └──────────┬─────────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
     ┌─────────────┐      ┌──────────────┐
     │   MongoDB   │      │  LangChain   │
     │  (Mongoose) │      │  / OpenAI    │
     └─────────────┘      │  / Groq      │
                          └──────────────┘
```

**Key enforced rules:**

- Controllers contain **zero** business logic — they parse and respond only
- Services contain **zero** `req` or `res` objects — fully platform-agnostic & testable
- All global types live in `src/core/types/` — no scattered `.d.ts` files

---

## 🗺️ Feature Map

<details>
<summary><b>🔐 Auth — <code>/api/auth</code></b></summary>

| Method | Route       | Description                    |
| ------ | ----------- | ------------------------------ |
| `POST` | `/register` | Register with email + password |
| `POST` | `/login`    | Login → returns signed JWT     |
| `GET`  | `/me`       | Get own profile (protected)    |

</details>

<details>
<summary><b>👤 Users — <code>/api/users</code></b></summary>

| Method | Route      | Description                    |
| ------ | ---------- | ------------------------------ |
| `GET`  | `/profile` | Fetch full profile             |
| `PUT`  | `/profile` | Update name, password, persona |
| `POST` | `/avatar`  | Upload avatar (Cloudinary)     |

</details>

<details>
<summary><b>📄 Documents — <code>/api/documents</code></b></summary>

| Method   | Route              | Description                                          |
| -------- | ------------------ | ---------------------------------------------------- |
| `POST`   | `/upload`          | Upload files OR text snippets → triggers AI pipeline |
| `GET`    | `/`                | Paginated list with sort/filter                      |
| `GET`    | `/:id`             | Get single document by ID                            |
| `DELETE` | `/:id`             | Delete document and its vector embeddings            |
| `GET`    | `/suggested-focus` | 🎯 Top-2 documents ranked by cognitiveLoad + recency + isUnread |
| `GET`    | `/:id/chat`        | Fetch RAG chat history                               |
| `POST`   | `/:id/chat`        | ⚡ Chat with document (RAG)                          |

> **Deduplication:** SHA-256 fingerprint check prevents re-uploading the same file.
> **Folder-aware uploads:** Pass `clientPaths` to recreate your original folder structure.
> **Suggested Focus:** Scoring formula — `Heavy=3 / Medium=2 / Light=1` load score + linear recency decay (1.0→0.0 over 30 days) + `+2` unread bonus. Only `Analyzed` documents are eligible.

</details>

<details>
<summary><b>📁 Folders — <code>/api/folders</code></b></summary>

| Method   | Route         | Description                                        |
| -------- | ------------- | -------------------------------------------------- |
| `GET`    | `/tree`       | Full folder tree                                   |
| `POST`   | `/`           | Create folder                                      |
| `PUT`    | `/:id`        | Rename / move folder                               |
| `DELETE` | `/:id`        | Delete folder                                      |
| `GET`    | `/:id/download` | Download folder contents as ZIP archive          |
| `POST`   | `/propose`    | ⚡ AI proposes a full-library semantic folder tree |

</details>

<details>
<summary><b>🧠 AI Core — <code>/api/ai</code></b></summary>

| Method | Route              | Description                                    |
| ------ | ------------------ | ---------------------------------------------- |
| `POST` | `/organize-folder` | ⚡ AI maps selected documents to folder paths  |
| `PUT`  | `/apply-folders`   | Commits AI proposal to DB (no AI call)         |
| `GET`  | `/search?q=...`    | ⚡ Semantic vector search across all documents |
| `POST` | `/synthesize`      | ⚡ Merge multiple documents into one summary   |

</details>

<details>
<summary><b>🔍 Comparison — <code>/api/comparison</code></b></summary>

| Method | Route      | Description                                                                        |
| ------ | ---------- | ---------------------------------------------------------------------------------- |
| `POST` | `/compare` | ⚡ Deep-compare two documents (runs entirely locally via Llama 3.1 8B)             |
| `GET`  | `/chat`    | Fetch dual-document RAG chat history                                              |
| `POST` | `/chat`    | ⚡ Chat grounded across both documents simultaneously                             |

Returns: `synthesis`, `similarityPercentage`, `similarities`, `differences`, `uniqueToA`, `uniqueToB`.

> **Note:** Comparison quality depends on the document having a digital text layer. Scanned/image-based PDFs will return minimal results as `pdf-parse` cannot extract image-only content.

</details>

<details>
<summary><b>✨ Prettify — <code>/api/prettify</code></b></summary>

| Method | Route          | Description                                                                 |
| ------ | -------------- | --------------------------------------------------------------------------- |
| `POST` | `/:documentId` | ⚡ Transform unformatted documents (Word, Excel, Text) into structured JSON |

> **Local Context Limits:** To prevent Llama 3.1 8B from running out of its 8,192 token context window, this Ollama version enforces stricter bounds: Excel (400 cells max), Word (8,000 chars max), and Snippets (5,000 chars max). Uses structured JSON output schemas via local inference.

</details>

<details>
<summary><b>🛡️ Admin — <code>/api/admin</code></b> <em>(admin role required — internal only)</em></summary>

| Method  | Route                | Description                                 |
| ------- | -------------------- | ------------------------------------------- |
| `GET`   | `/stats`             | KPI dashboard (delegates to analytics)      |
| `GET`   | `/users`             | Paginated + searchable + sortable user list |
| `PATCH` | `/users/:id/suspend` | Suspend / unsuspend a user                  |
| `GET`   | `/export/users`      | Download all users as CSV                   |
| `GET`   | `/ai-usage`          | Per-user AI token consumption report        |

</details>

<details>
<summary><b>📊 Analytics — <code>/api/analytics</code></b></summary>

| Method | Route            | Auth   | Description                               |
| ------ | ---------------- | ------ | ----------------------------------------- |
| `POST` | `/track`         | Public | Frontend sends pageviews & feature events |
| `GET`  | `/top-pages`     | User   | Top pages by traffic (last 30 days)       |
| `GET`  | `/feature-usage` | User   | Feature usage breakdown                   |
| `GET`  | `/errors`        | Admin  | Error summary (last 7 days)               |

> Analytics events auto-expire after 90 days via a TTL index.

</details>

<details>
<summary><b>💳 Payments — <code>/api/payments</code></b> <em>(internal only)</em></summary>

| Method | Route      | Description                    |
| ------ | ---------- | ------------------------------ |
| `POST` | `/request` | Initiate a payment request     |
| `GET`  | `/history` | Fetch user payment history     |

</details>

<details>
<summary><b>⚙️ Settings — <code>/api/settings</code></b></summary>

| Method | Route | Description                         |
| ------ | ----- | ----------------------------------- |
| `GET`  | `/`   | Fetch user application settings     |
| `PUT`  | `/`   | Update preferences (theme, persona) |

</details>

---

## 🛠️ Tech Stack

### Core Backend

| Technology           | Version | Purpose                          |
| -------------------- | ------- | -------------------------------- |
| Node.js              | ≥ 22.x  | Runtime                          |
| Express              | 5.x     | HTTP framework                   |
| TypeScript           | 5–6.x   | Type safety                      |
| MongoDB + Mongoose   | 9.x     | Primary database                 |
| JWT (jsonwebtoken)   | 9.x     | Auth tokens                      |
| bcryptjs             | 3.x     | Password hashing                 |
| Multer + Streamifier | 2.x     | In-memory file handling          |
| Cloudinary           | 2.x     | File storage & CDN               |
| morgan               | 1.x     | HTTP request logging             |
| nodemailer           | 8.x     | Transactional email (SMTP)       |
| archiver             | 8.x     | ZIP archive generation (folders) |
| mammoth              | 1.x     | Word (.docx) text extraction     |
| pdf-parse            | 2.x     | PDF digital text extraction      |
| xlsx                 | 0.18.x  | Excel file parsing               |
| zod                  | 3.x     | Runtime schema validation        |

### AI & LangChain

| Technology                      | Purpose                                        |
| ------------------------------- | ---------------------------------------------- |
| `langchain` + `@langchain/core` | Orchestration, chains & structured output      |
| `@langchain/ollama`             | Local Ollama models (Orchestration, embedding, synthesis, comparison) |
| `llama3.1:8b-instruct-q4_K_M`   | Workhorse text model (structured output + RAG) |
| `llava:7b-v1.6-mistral-q4_K_M`  | Local vision model for image-to-text           |
| `nomic-embed-text:latest`       | Local vector embeddings (768 dimensions)       |
| `@langchain/langgraph`          | LangGraph agent framework (OrchestratorService)|
| `@langchain/mongodb`            | MongoDB Atlas Vector Store integration          |
| `@langchain/textsplitters`      | Document chunking before embedding              |
| MongoDB Atlas Vector Search     | Semantic similarity search                      |

### Security & Middleware

| Technology              | Purpose                                                          |
| ----------------------- | ---------------------------------------------------------------- |
| compression             | HTTP payload compression (Gzip/Brotli) shrinks JSON by up to 80% |
| Helmet                  | HTTP security headers                                            |
| express-rate-limit      | Brute-force protection (global + auth-specific limiters)         |
| express-mongo-sanitize  | NoSQL injection guard on `req.body` & `req.params`               |
| HPP                     | HTTP parameter pollution guard                                   |
| cors                    | Cross-Origin Resource Sharing (origin-locked to frontend URL)    |
| cookie-parser           | Secure HTTP-Only Cookie extraction for JWT auth                  |
| Token Budget Middleware  | 50,000 token/day per-user AI spend cap with `Retry-After` header |

> **Note:** `express-mongo-sanitize` is applied as a custom wrapper that sanitizes `req.body` and `req.params` only. Express 4.19+ made `req.query` read-only, so direct `mongoSanitize()` middleware would crash the server — the wrapper bypasses this safely.

### 🛡️ Recent Security Audit Fixes

Context recently underwent a full security audit, resulting in hardened defenses across the entire API:
- **HttpOnly Cookies:** JWT authentication has been fully migrated from LocalStorage to secure, `HttpOnly`, `SameSite=Strict` cookies to prevent XSS token theft.
- **CSV Injection Prevention:** User data exports (`/api/admin/export/users`) now automatically neutralize Excel macro triggers (e.g. `=`, `+`, `-`, `@`).
- **SSRF Protection:** Cloudinary assets downloaded for ZIP exports are strictly validated against `https://res.cloudinary.com/` to prevent internal server probing.
- **Secure Password Resets:** Reset tokens are strictly hashed in the database and never queried in plain text. Global "Logout Everywhere" is enforced via `tokenVersion` increments upon reset.
- **Privilege Escalation Guards:** Explicit `adminId` authorization checks govern all critical payment and user suspension endpoints.

### Dev & Testing

| Technology        | Purpose               |
| ----------------- | --------------------- |
| Jest + ts-jest    | Unit testing (pure — no live DB or AI calls) |
| ESLint + Prettier | Code quality          |
| ts-node-dev       | Hot-reload dev server |

---

## 📁 Project Structure

```
context-api/
│
├── 📂 docs/
│   ├── ContextAPI.yaml                         ← Public OpenAPI 3.0 spec (BaaS-ready)
│   └── postman/
│       ├── Context API (Public).postman_collection.json   ← Public endpoints only
│       └── Context API (Internal).postman_collection.json ← All endpoints (dev use)
│
├── 📂 src/
│   ├── 📂 config/
│   │   ├── db.ts                       ← MongoDB connection
│   │   ├── cloudinary.ts               ← Cloudinary setup
│   │   └── models.registry.ts          ← LangChain model initialization
│   │
│   ├── 📂 core/
│   │   ├── 📂 errors/
│   │   │   └── AppError.ts             ← Typed operational error class
│   │   ├── 📂 middlewares/
│   │   │   ├── auth.middleware.ts       ← JWT protect guard
│   │   │   ├── requireAdmin.middleware.ts
│   │   │   ├── token-budget.middleware.ts  ← 50K token/day cap
│   │   │   ├── analytics.middleware.ts ← Auto-tracks all HTTP events
│   │   │   └── error.middleware.ts     ← Global error handler
│   │   └── 📂 types/
│   │       ├── express.d.ts            ← req.user (IUser) augmentation
│   │       └── langgraph.d.ts
│   │
│   ├── 📂 features/                    ← ALL domain logic lives here
│   │   ├── 📂 auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── auth.routes.ts
│   │   ├── 📂 users/
│   │   │   ├── user.model.ts
│   │   │   ├── user.controller.ts
│   │   │   ├── user.service.ts
│   │   │   └── user.routes.ts
│   │   ├── 📂 documents/
│   │   │   ├── document.model.ts
│   │   │   ├── document.service.ts
│   │   │   ├── document.routes.ts
│   │   │   ├── 📂 upload/
│   │   │   │   └── upload.service.ts
│   │   │   ├── 📂 chat/
│   │   │   │   └── document-chat.service.ts
│   │   │   ├── 📂 analysis/
│   │   │   │   └── suggested-focus.service.ts
│   │   │   └── __tests__/
│   │   ├── 📂 folders/
│   │   │   ├── folder.model.ts
│   │   │   ├── folder.service.ts
│   │   │   ├── folder.controller.ts
│   │   │   └── folder.routes.ts
│   │   ├── 📂 ai/
│   │   │   ├── ai.controller.ts
│   │   │   ├── ai.routes.ts
│   │   │   ├── 📂 agents/
│   │   │   │   ├── orchestrator.service.ts     ← GPT-4o-mini 3-tool agent
│   │   │   │   ├── cognitive-load.service.ts
│   │   │   │   ├── synthesizer.service.ts
│   │   │   │   └── visual-cortex.service.ts    ← Image-to-text
│   │   │   ├── 📂 organizer/
│   │   │   │   ├── folder-organizer.service.ts
│   │   │   │   └── folder-proposer.service.ts
│   │   │   ├── 📂 pipeline/
│   │   │   │   ├── document-pipeline.service.ts
│   │   │   │   └── document-preview.service.ts ← Token-safe doc sampling
│   │   │   ├── 📂 search/
│   │   │   │   └── vector.service.ts           ← Atlas Vector Search
│   │   │   └── 📂 models/
│   │   │       ├── chat.model.ts
│   │   │       └── token-budget.model.ts
│   │   ├── 📂 comparison/
│   │   │   ├── comparison.service.ts           ← RAG chat across 2 docs
│   │   │   ├── deep-thinker.service.ts         ← 3-model fallback comparison
│   │   │   ├── comparison.controller.ts
│   │   │   └── comparison.routes.ts
│   │   ├── 📂 admin/
│   │   │   ├── admin.controller.ts
│   │   │   ├── admin.service.ts
│   │   │   └── admin.routes.ts
│   │   ├── 📂 analytics/
│   │   │   ├── analytics.model.ts
│   │   │   ├── analytics.controller.ts
│   │   │   ├── analytics.service.ts
│   │   │   └── analytics.routes.ts
│   │   ├── 📂 settings/
│   │   │   ├── settings.service.ts
│   │   │   └── settings.routes.ts
│   │   └── 📂 payments/
│   │       ├── payment.controller.ts
│   │       └── payment.routes.ts
│   │
│   ├── app.ts                          ← Express app (middleware + routes)
│   └── server.ts                       ← HTTP server entry point
│
├── jest.config.js
├── tsconfig.json
├── .env                                ← Never commit this!
└── README.md
```

---

## ⚡ Quick Start

### Prerequisites

- Node.js ≥ 18.x
- A MongoDB Atlas cluster (free tier works perfectly)
- A Cloudinary account (free tier)
- OpenAI API key
- Groq API key (free at [console.groq.com](https://console.groq.com))

### 1. Clone & Install

```bash
git clone <your-github-repo-url>
cd context-api
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Then fill in your `.env` (see [Environment Variables](#-environment-variables) below).

### 3. Run the Dev Server

```bash
npm run dev
# ✅  Server running at http://localhost:5000
# ✅  MongoDB connected
```

### 4. Run Tests

```bash
# Run all suites with coverage report
npm run test:coverage

# Run a specific feature
npx jest --testPathPatterns="auth"
npx jest --testPathPatterns="documents/__tests__/upload"
npx jest --testPathPatterns="admin"
npx jest --testPathPatterns="analytics"
```

### 5. View API Documentation

```bash
# Requires VS Code Swagger Viewer extension (search "Swagger Viewer" by Arjun)
# Open docs/ContextAPI.yaml and press Shift+Alt+P

# OR use Redocly CLI (no install needed):
npx --yes @redocly/cli preview-docs docs/ContextAPI.yaml
# Opens http://127.0.0.1:8080
```

---

## 🔑 Environment Variables

Create a `.env` in the root of `context-api/`. **Never commit this file.**

```env
# ── Server ────────────────────────────────────────────────
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173

# ── Database ───────────────────────────────────────────────
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/context?retryWrites=true

# ── Auth ───────────────────────────────────────────────────
JWT_SECRET=your-super-secret-key-minimum-32-chars
JWT_EXPIRES_IN=7d

# ── Cloudinary (File Storage) ──────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── Ollama Local AI ────────────────────────────────────────
OLLAMA_BASE_URL=http://127.0.0.1:11434

# ── Email (Password Reset) ─────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# ── AI Budget ──────────────────────────────────────────────
AI_DAILY_TOKEN_BUDGET=50000
```

---

## 🔌 API Overview

> Full public specification: [`docs/ContextAPI.yaml`](./docs/ContextAPI.yaml)
> Base URL: `http://localhost:5000/api`

### Documentation Strategy (BaaS Standard)

Context API follows the industry-standard practice of separating public and internal documentation:

| Collection | Scope | Use Case |
| --- | --- | --- |
| `ContextAPI.yaml` | Auth, Documents, Folders, AI Core, Comparison | Third-party integrators & SDK generation |
| `Context API (Public).postman_collection.json` | Same as above | Frontend & partner testing |
| `Context API (Internal).postman_collection.json` | All endpoints + Admin/Analytics/Settings/Payments | Internal dev team only |

### Token Budget System

Every AI endpoint is guarded by the `checkTokenBudget` middleware.

```
User has 50,000 tokens/day. Any ⚡ endpoint consumes from this budget.
When the budget is exceeded, the API returns 429 with Retry-After headers.
```

| Header                  | Description                         |
| ----------------------- | ----------------------------------- |
| `X-RateLimit-Limit`     | Daily budget (50000)                |
| `X-RateLimit-Remaining` | Tokens left today                   |
| `X-RateLimit-Reset`     | ISO timestamp of midnight UTC reset |
| `Retry-After`           | Seconds until reset                 |

---

## 📖 API Documentation

The `ContextAPI.yaml` follows **OpenAPI 3.0.3** and includes:

- ✅ `operationId` on every endpoint (enables automatic SDK generation)
- ✅ Reusable `components/schemas` — `ErrorEnvelope`, `TokenBudget429`, `DocumentMetadata`, `PaginatedDocuments`
- ✅ Reusable `components/responses` — `BadRequest`, `Unauthorized`, `NotFound`, `TooManyRequests`, `InternalServer`
- ✅ Reusable `components/headers` — `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`
- ✅ `externalDocs` links per tag (Auth, Documents)
- ✅ `contact`, `license`, and `termsOfService` in the `info` block
- ✅ Full error response mapping on every single endpoint (400 / 401 / 404 / 429 / 500)

---

## 🧪 Testing

The test suite uses **Jest + ts-jest** with full module mocking — no live database or AI calls needed.

```bash
# Run all suites
npm test

# Run with coverage report
npm run test:coverage
```

### Coverage Summary (Latest Run)

| Feature                    | Tests | Status     |
| -------------------------- | ----- | ---------- |
| Auth Service               | 12    | ✅ Pass    |
| User Service               | 6     | ✅ Pass    |
| Upload Service             | 13    | ✅ Pass    |
| Document Service           | 6     | ✅ Pass    |
| Document Chat Service      | 5     | ✅ Pass    |
| Suggested Focus Service    | 10    | ✅ Pass    |
| Folder Service             | 6     | ✅ Pass    |
| Folder Organizer Service   | 5     | ✅ Pass    |
| Folder Proposer Service    | 3     | ✅ Pass    |
| Orchestrator Service       | 8     | ✅ Pass    |
| Synthesizer Service        | 4     | ✅ Pass    |
| Cognitive Load Service     | 5     | ✅ Pass    |
| Visual Cortex Service      | 4     | ✅ Pass    |
| Document Pipeline Service  | 7     | ✅ Pass    |
| Document Preview Service   | 6     | ✅ Pass    |
| Comparison Service         | 4     | ✅ Pass    |
| Deep Thinker Service       | 5     | ✅ Pass    |
| Vector Service             | 3     | ✅ Pass    |
| Admin Service              | 9     | ✅ Pass    |
| Analytics Service          | 7     | ✅ Pass    |
| Payments Controller        | 5     | ✅ Pass    |
| Settings Service           | 3     | ✅ Pass    |
| Auth Middleware            | 6     | ✅ Pass    |
| RequireAdmin Middleware     | 4     | ✅ Pass    |
| Token Budget Middleware     | 5     | ✅ Pass    |
| **Total**                  | **172** | **✅ 24 Suites / 100% Pass** |

> Overall statement coverage: **~81%**. Core business logic services (admin, analytics, comparison, pipeline) reach **90%+**.

---

## 🎨 Brand & Colors

Context uses a dual-mode design system. The API badge and logo colors are derived directly from the front-end palette.

| Token                  | Light Mode | Dark Mode      | Hex (Light) |
| ---------------------- | ---------- | -------------- | ----------- |
| `primary`              | Indigo     | Indigo-lighter | `#4F46E5`   |
| `accent` / `secondary` | Violet     | Purple         | `#7C3AED`   |
| `text`                 | Slate-700  | White          | `#334155`   |
| `border`               | Slate-200  | White/20       | `#E2E8F0`   |

The logo (`ContextLogo.tsx`) is a three-node neural graph — two input nodes merging into one intelligent core — a visual metaphor for how Context takes multiple document sources and produces unified intelligence.

---

## 🌿 Team & Workflow

> Context is a **team project** with weekly rotation. Every contributor works inside a clean feature boundary.

### Git Rules (The "No Tears" Policy)

1. **Never push directly to `main` or `dev`**
2. **Branch off `dev`** — use formats like: `feat/embedding-pipeline`, `fix/token-budget`, `docs/openapi`
3. **Conventional commits:** `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`
4. **PR to `dev`** — needs 1 approval from your rotation partner before merge
5. **Must pass:** `tsc --noEmit` + all Jest tests before opening a PR

### Feature Ownership Rule

> If you are working on `documents`, keep all changes inside `src/features/documents/`.  
> Shared utilities go into `src/core/`. External integrations go into `src/config/`.

---

<div align="center">

<img src="./docs/logo.svg" width="48" height="48" alt="Context Logo" />

**Built with ❤️ by 🧠 Contexters — ITI ITP R2 2026**

_"Your documents shouldn't just be stored. They should think."_

</div>
