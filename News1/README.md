# FIN-OS News Intelligence — React/TypeScript App

> React + TypeScript + Vite | Gemini AI | Indian financial news  
> **Updated:** July 14, 2026

A React/TypeScript news application that aggregates and analyses Indian financial news using the Gemini API.

---

## Setup

**Prerequisites:** Node.js 18+

```bash
cd "Initial Deployment/News1"
npm install

# Add your Gemini API key
echo "GEMINI_API_KEY=your_key_here" > .env.local

npm run dev
```

## Note

The primary news backend for FIN-OS is `app.py` (Flask, Google News RSS, port 5000), which requires no API key. This React/TypeScript app is a separate standalone experiment using the Gemini API for news summarisation and analysis.
