# One image for all five services; docker-compose picks the service per container.
FROM python:3.12-slim
WORKDIR /app
COPY core /app/core
COPY services /app/services
RUN pip install --no-cache-dir /app/core /app/services && useradd --create-home qrw
USER qrw
ENV QRW_SECRETS_DIR=/secrets QRW_DATA_DIR=/data
