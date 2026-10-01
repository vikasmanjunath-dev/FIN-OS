FROM python:3.12-slim
# WeasyPrint (PDF reports) system libs
RUN apt-get update && apt-get install -y --no-install-recommends libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b fonts-dejavu-core curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV ARYA_HOST=0.0.0.0 ARYA_PORT=7475
EXPOSE 7475
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fs http://localhost:7475/health || exit 1
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7475", "--workers", "2"]
