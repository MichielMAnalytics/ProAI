# Personal Assistant Core Technology

*Pre-launch* - Building the foundation for truly personal AI agents.

## Overview

Three critical challenges prevent AI agents from becoming effective personal assistants: **lack of customizable tool access**, **insufficient understanding of user context**, and **inability to proactively execute tasks**.

We're solving this by leveraging the **MCP standard** and **advanced context-awareness** to provide core technology that empowers Personal Assistants to not just access tools, but to understand you deeply and act autonomously on your behalf.

Our unified tooling ecosystem combined with intelligent user modeling enables your PA to be **deeply personalized**, **proactive**, and capable of taking meaningful action across your entire digital landscape—knowing when and how to execute your to-dos without constant instruction.

# ✨ Features

- 🖥️ **UI & Experience** inspired by ChatGPT with enhanced design and features

- 🤖 **AI Model Selection**:  
  - Anthropic (Claude), AWS Bedrock, OpenAI, Azure OpenAI, Google, Vertex AI, OpenAI Assistants API (incl. Azure)
  - [Custom Endpoints](https://www.librechat.ai/docs/quick_start/custom_endpoints): Use any OpenAI-compatible API with LibreChat, no proxy required
  - Compatible with [Local & Remote AI Providers](https://www.librechat.ai/docs/configuration/librechat_yaml/ai_endpoints):
    - Ollama, groq, Cohere, Mistral AI, Apple MLX, koboldcpp, together.ai,
    - OpenRouter, Perplexity, ShuttleAI, Deepseek, Qwen, and more

- 🔧 **[Code Interpreter API](https://www.librechat.ai/docs/features/code_interpreter)**: 
  - Secure, Sandboxed Execution in Python, Node.js (JS/TS), Go, C/C++, Java, PHP, Rust, and Fortran
  - Seamless File Handling: Upload, process, and download files directly
  - No Privacy Concerns: Fully isolated and secure execution

- 🔦 **Agents & Tools Integration**:  
  - **[LibreChat Agents](https://www.librechat.ai/docs/features/agents)**:
    - No-Code Custom Assistants: Build specialized, AI-driven helpers without coding  
    - Flexible & Extensible: Attach tools like DALL-E-3, file search, code execution, and more  
    - Compatible with Custom Endpoints, OpenAI, Azure, Anthropic, AWS Bedrock, and more
    - [Model Context Protocol (MCP) Support](https://modelcontextprotocol.io/clients#librechat) for Tools
  - Use LibreChat Agents and OpenAI Assistants with Files, Code Interpreter, Tools, and API Actions

- 🔍 **Web Search**:  
  - Search the internet and retrieve relevant information to enhance your AI context
  - Combines search providers, content scrapers, and result rerankers for optimal results
  - **[Learn More →](https://www.librechat.ai/docs/features/web_search)**

- 🪄 **Generative UI with Code Artifacts**:  
  - [Code Artifacts](https://youtu.be/GfTj7O4gmd0?si=WJbdnemZpJzBrJo3) allow creation of React, HTML, and Mermaid diagrams directly in chat

- 🎨 **Image Generation & Editing**
  - Text-to-image and image-to-image with [GPT-Image-1](https://www.librechat.ai/docs/features/image_gen#1--openai-image-tools-recommended)
  - Text-to-image with [DALL-E (3/2)](https://www.librechat.ai/docs/features/image_gen#2--dalle-legacy), [Stable Diffusion](https://www.librechat.ai/docs/features/image_gen#3--stable-diffusion-local), [Flux](https://www.librechat.ai/docs/features/image_gen#4--flux), or any [MCP server](https://www.librechat.ai/docs/features/image_gen#5--model-context-protocol-mcp)
  - Produce stunning visuals from prompts or refine existing images with a single instruction

- 💾 **Presets & Context Management**:  
  - Create, Save, & Share Custom Presets  
  - Switch between AI Endpoints and Presets mid-chat
  - Edit, Resubmit, and Continue Messages with Conversation branching  
  - [Fork Messages & Conversations](https://www.librechat.ai/docs/features/fork) for Advanced Context control

- 💬 **Multimodal & File Interactions**:  
  - Upload and analyze images with Claude 3, GPT-4.5, GPT-4o, o1, Llama-Vision, and Gemini 📸  
  - Chat with Files using Custom Endpoints, OpenAI, Azure, Anthropic, AWS Bedrock, & Google 🗃️

- 🌎 **Multilingual UI**:  
  - English, 中文, Deutsch, Español, Français, Italiano, Polski, Português Brasileiro
  - Русский, 日本語, Svenska, 한국어, Tiếng Việt, 繁體中文, العربية, Türkçe, Nederlands, עברית

- 🧠 **Reasoning UI**:  
  - Dynamic Reasoning UI for Chain-of-Thought/Reasoning AI models like DeepSeek-R1

- 🎨 **Customizable Interface**:  
  - Customizable Dropdown & Interface that adapts to both power users and newcomers

- 🗣️ **Speech & Audio**:  
  - Chat hands-free with Speech-to-Text and Text-to-Speech  
  - Automatically send and play Audio  
  - Supports OpenAI, Azure OpenAI, and Elevenlabs

- 📥 **Import & Export Conversations**:  
  - Import Conversations from LibreChat, ChatGPT, Chatbot UI  
  - Export conversations as screenshots, markdown, text, json

- 🔍 **Search & Discovery**:  
  - Search all messages/conversations

- 👥 **Multi-User & Secure Access**:
  - Multi-User, Secure Authentication with OAuth2, LDAP, & Email Login Support
  - Built-in Moderation, and Token spend tools

- ⚙️ **Configuration & Deployment**:  
  - Configure Proxy, Reverse Proxy, Docker, & many Deployment options  
  - Use completely local or deploy on the cloud

- 📖 **Open-Source & Community**:  
  - Completely Open-Source & Built in Public  
  - Community-driven development, support, and feedback

[For a thorough review of our features, see our docs here](https://docs.librechat.ai/) 📚

## 🪶 All-In-One AI Conversations with LibreChat

LibreChat brings together the future of assistant AIs with the revolutionary technology of OpenAI's ChatGPT. Celebrating the original styling, LibreChat gives you the ability to integrate multiple AI models. It also integrates and enhances original client features such as conversation and message search, prompt templates and plugins.

With LibreChat, you no longer need to opt for ChatGPT Plus and can instead use free or pay-per-call APIs. We welcome contributions, cloning, and forking to enhance the capabilities of this advanced chatbot platform.

[![Watch the video](https://raw.githubusercontent.com/LibreChat-AI/librechat.ai/main/public/images/changelog/v0.7.6.gif)](https://www.youtube.com/watch?v=ilfwGQtJNlI)

Click on the thumbnail to open the video☝️

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
