# Running Sentinel in GitHub Codespaces

Codespaces runs Sentinel on a GitHub-hosted Linux machine. Your computer only needs a browser. It is appropriate for development, testing, and short demos; it is not permanent production hosting.

## 1. Push the Codespaces files

Before creating the Codespace, confirm that GitHub contains `.devcontainer/devcontainer.json`, `.env.example`, `docker-compose.yml`, and this file. From local PowerShell, if needed:

```powershell
cd "C:\Users\kamle\OneDrive\Desktop\placement project\sentinel"
git add .
git commit -m "Add GitHub Codespaces support"
git push origin main
```

Do not add `.env`; it is intentionally ignored by Git.

## 2. Create the Codespace

1. Open the repository on GitHub.
2. Select **Code**, then **Codespaces**.
3. Select **Create codespace on main**. Use **New with options** if GitHub offers machine selection.
4. Prefer an 8-core / 16 GB machine for the complete stack. A 4-core machine may run the core application but can struggle during image builds. The 2-core machine is not recommended.
5. Wait until VS Code opens and the terminal finishes the post-create command.

The dev container provisions Docker-in-Docker, Go 1.22, Python 3.12, and Node.js 20.

## 3. Verify and configure the environment

Run in the Codespaces terminal:

```bash
docker --version
docker compose version
test -f .env || cp .env.example .env
sed -i 's/^RISK_ENGINE_FAIL_OPEN=.*/RISK_ENGINE_FAIL_OPEN=true/' .env
sed -i "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=https://${CODESPACE_NAME}-3000.app.github.dev|" .env
grep -E '^(CORS_ALLOWED_ORIGINS|RISK_ENGINE_FAIL_OPEN)=' .env
docker compose config --quiet
```

`RISK_ENGINE_FAIL_OPEN=true` lets the first demo run in rules-only mode before a model has been trained. Never commit `.env`, passwords, private keys, tokens, or webhook URLs.

## 4. Start Sentinel

For the complete stack on an 8-core machine:

```bash
docker compose up -d --build
```

For a smaller Codespace, start the application path first:

```bash
docker compose up -d --build \
  postgres redis kafka kafka-init clickhouse \
  auth-service risk-engine analytics-service alert-service \
  gateway dashboard
```

The first build can take several minutes. Watch progress with:

```bash
docker compose ps
docker compose logs -f kafka-init auth-service risk-engine analytics-service gateway dashboard
```

Exit log-following with `Ctrl+C`; this does not stop the containers.

## 5. Forward the browser ports

1. Open the **Ports** panel in Codespaces (`Ctrl+Shift+P`, then **Ports: Focus on Ports View** if it is hidden).
2. Confirm ports `3000` and `8080` are listed. Add them manually if necessary.
3. Port `3000` is the dashboard; port `8080` is the API gateway.
4. For the simplest short demo, right-click each port, choose **Port Visibility**, and set it to **Public**. Return both to **Private** or stop the Codespace after the demo.
5. Open the port `8080` URL once and confirm the health response. Then open port `3000`.

The URLs normally are:

```text
https://<codespace-name>-3000.app.github.dev
https://<codespace-name>-8080.app.github.dev
```

The dashboard automatically converts its `-3000` hostname to `-8080` for API and WebSocket calls. If you changed `.env` after starting the stack, apply it with:

```bash
docker compose up -d --force-recreate gateway
```

## 6. Verify health

```bash
curl -fsS http://localhost:8080/health
docker compose exec -T gateway wget -qO- http://auth-service:8081/health
docker compose exec -T gateway wget -qO- http://risk-engine:8082/health
docker compose exec -T gateway wget -qO- http://analytics-service:8083/health
docker compose exec -T gateway wget -qO- http://alert-service:8084/health
docker compose ps
```

The containers needed by the app should show `Up` or `healthy`. `kafka-init` should show `Exited (0)` because it is a successful one-time setup job.

## 7. Create an account and sign in

Create the first account through the local gateway:

```bash
curl -i -X POST http://localhost:8080/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"SentinelDemo!2026","full_name":"Demo Operator"}'
```

HTTP `201 Created` means registration worked. Open the port `3000` URL and sign in with the same email and password. The password policy requires at least 12 characters with uppercase, lowercase, digit, and special characters.

## 8. Optional: train the ML model

```bash
docker compose exec risk-engine python ml/train.py
docker compose restart risk-engine
docker compose exec -T gateway wget -qO- http://risk-engine:8082/health
```

Look for `"model_loaded":true`. The `risk_models` volume preserves the model across normal container recreation. After training, strict mode can be enabled with:

```bash
sed -i 's/^RISK_ENGINE_FAIL_OPEN=.*/RISK_ENGINE_FAIL_OPEN=false/' .env
docker compose up -d --force-recreate risk-engine
```

## 9. Troubleshooting

```bash
docker compose ps -a
docker compose logs --tail=200 kafka kafka-init
docker compose logs --tail=200 auth-service risk-engine analytics-service gateway dashboard
docker stats --no-stream
docker compose up -d --build gateway dashboard
```

If login works with `curl` but fails in the dashboard, verify that port `8080` is reachable in the browser and that `.env` contains the exact port-3000 Codespaces URL in `CORS_ALLOWED_ORIGINS`. Then recreate the gateway.

If a build is killed or containers continually restart, switch to a larger Codespace or run only the core command from step 4. GitHub Actions runs tests; it does not keep this application online.

## 10. Stop safely

```bash
docker compose down
```

This preserves named volumes. Do not use `docker compose down -v` unless you intentionally want to erase the database, analytics data, keys, and trained model. Stop or delete the Codespace from GitHub when finished to avoid consuming Codespaces quota.
