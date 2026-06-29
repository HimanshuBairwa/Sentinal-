FROM python:3.12-slim as builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
RUN groupadd -r sentinel && useradd -r -g sentinel -u 10001 sentinel
COPY --from=builder /root/.local /home/sentinel/.local
COPY --chown=sentinel:sentinel . .
RUN mkdir -p /models /secrets && chown -R sentinel:sentinel /models /secrets
USER sentinel
ENV PATH=/home/sentinel/.local/bin:$PATH
EXPOSE 8082 9102
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8082/health')" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8082", "--workers", "1", "--loop", "uvloop", "--http", "h11"]
