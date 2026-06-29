.PHONY: up down build logs test lint migrate seed generate train load-test k8s-deploy tf-plan

up:
	docker compose up -d --build
	@echo "SENTINEL is running:"
	@echo "  Dashboard    → http://localhost:3000"
	@echo "  Grafana      → http://localhost:3001 (admin/admin)"
	@echo "  Jaeger       → http://localhost:16686"
	@echo "  MLflow       → http://localhost:5000"
	@echo "  Prometheus   → http://localhost:9090"

down:
	docker compose down -v

build:
	docker compose build

logs:
	docker compose logs -f gateway auth-service risk-engine analytics-service alert-service

test:
	@for svc in gateway auth-service analytics-service alert-service; do \
		echo "=== Testing $$svc ==="; \
		cd $$svc && go test -race -count=1 -coverprofile=coverage.out ./... && \
		go tool cover -func=coverage.out | grep ^total; cd ..; \
	done
	@echo "=== Testing risk-engine ==="
	cd risk-engine && python -m pytest tests/ -v --cov=app --cov-report=term-missing

lint:
	golangci-lint run ./gateway/... ./auth-service/... ./analytics-service/... ./alert-service/...
	cd risk-engine && flake8 app/ && mypy app/ --ignore-missing-imports

migrate:
	docker compose exec postgres psql -U sentinel -d sentinel \
		-c "\i /docker-entrypoint-initdb.d/000001_extensions.up.sql" \
		-c "\i /docker-entrypoint-initdb.d/000002_users.up.sql" \
		-c "\i /docker-entrypoint-initdb.d/000003_sessions.up.sql" \
		-c "\i /docker-entrypoint-initdb.d/000004_audit_log.up.sql" \
		-c "\i /docker-entrypoint-initdb.d/000005_fraud_rules.up.sql" \
		-c "\i /docker-entrypoint-initdb.d/000006_risk_decisions.up.sql"

seed:
	docker compose exec risk-engine python scripts/seed_rules.py
	docker compose exec auth-service ./scripts/seed_test_users.sh

generate:
	docker compose exec risk-engine python scripts/generate_fraud_data.py
	@echo "Generated 100K synthetic fraud events at /data/fraud_dataset_100k.csv"

train:
	docker compose exec risk-engine python ml/trainer.py \
		--data /data/fraud_dataset_100k.csv \
		--experiment SENTINEL-LightGBM
