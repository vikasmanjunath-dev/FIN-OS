FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl libpango-1.0-0 libpangoft2-1.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 7476
# Startup embeds models (~15-25s) before /api/health reports ok
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD curl -fs http://localhost:7476/api/health || exit 1
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7476"]
