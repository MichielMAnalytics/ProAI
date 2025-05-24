# Personal Assistant Core Technology

*Pre-launch* - Building the foundation for truly personal AI agents.

## Overview

Three critical challenges prevent AI agents from becoming effective personal assistants: **lack of customizable tool access**, **insufficient understanding of user context**, and **inability to proactively execute tasks**.

We're solving this by leveraging the **MCP standard** and **advanced context-awareness** to provide core technology that empowers Personal Assistants to not just access tools, but to understand you deeply and act autonomously on your behalf.

Our unified tooling ecosystem combined with intelligent user modeling enables your PA to be **deeply personalized**, **proactive**, and capable of taking meaningful action across your entire digital landscape—knowing when and how to execute your to-dos without constant instruction.

---

## 🚀 Getting Started

### Configuration

1. **Copy environment configuration:**
   ```bash
   cp .env.example .env
   ```
   Set an API key (e.g., OpenAI) in your `.env` file.

2. **Copy LibreChat configuration:**
   ```bash
   cp librechat.example.yaml librechat.yaml
   ```
   Configure your preferences in the `librechat.yaml` file.

### Docker Deployment

**Build and run:**
```bash
docker compose up -d --build
```

**Start existing containers:**
```bash
docker compose up -d
```

### NPM Installation

**Production setup:**
```bash
npm ci
npm run frontend
npm run backend
```

**Development workflow:**
- **Backend changes:** Restart with `npm run backend`
- **Development mode:** Use `npm run dev` (runs on port 3090)
- **Frontend changes:** Run `npm run frontend` to reflect changes when using `npm run backend`

---

## 📚 Credits

This project is a fork of [LibreChat](https://github.com/danny-avila/LibreChat) by [@danny-avila](https://github.com/danny-avila), an enhanced ChatGPT clone featuring multiple AI providers, agents, tools integration, and advanced conversation management.

---

## 📄 License

MIT License

Copyright (c) 2025 LibreChat

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---
