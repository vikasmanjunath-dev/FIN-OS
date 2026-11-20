FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY health_aggregator.py .
EXPOSE 8010
CMD ["uvicorn", "health_aggregator:app", "--host", "0.0.0.0", "--port", "8010"]
