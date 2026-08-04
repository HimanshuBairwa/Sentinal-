FROM python:3.12-slim as builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends wget libgomp1 && rm -rf /var/lib/apt/lists/*
RUN groupadd -r sentinel && useradd -r -m -g sentinel -u 10001 sentinel
COPY --from=builder /root/.local /home/sentinel/.local
COPY --chown=sentinel:sentinel . .
RUN mkdir -p /models /secrets && chown -R sentinel:sentinel /models /secrets
USER sentinel
ENV PATH=/home/sentinel/.local/bin:$PATH
EXPOSE 8082 9102
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8082", "--workers", "1", "--loop", "uvloop", "--http", "h11"]
