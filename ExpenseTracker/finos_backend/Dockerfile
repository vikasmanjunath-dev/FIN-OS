FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt* ./
RUN pip install --no-cache-dir django djangorestframework numpy statsmodels
COPY . .
RUN python manage.py migrate --no-input
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
