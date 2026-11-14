FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PHYSIOGRAPH_INFERENCE_BACKEND=numpy \
    PHYSIOGRAPH_PUBLIC_MODE=1 \
    PHYSIOGRAPH_AUTO_DEMO=1 \
    PHYSIOGRAPH_AUTO_DEMO_SPEED=10
COPY requirements-live-lite.txt /app/
RUN pip install --no-cache-dir -r requirements-live-lite.txt
COPY . /app/
EXPOSE 10000
CMD ["sh", "-c", "uvicorn physiograph.live_api:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
