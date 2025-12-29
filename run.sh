#!/bin/bash
set -euo pipefail

# 1. Load .env to make variables visible to Spring Boot
if [ -f .env ]; then
  set -a
  source .env
  set +a
else
  echo "Error: .env file is missing!"
  exit 1
fi

# 2. Reset (Optional)
if [ "${DB_RESET:-0}" = "1" ]; then
  docker compose down -v
fi

# 3. Start Database (Docker reads .env automatically)
docker compose up -d postgres

# 4. Wait for Readiness
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" >/dev/null 2>&1; do
  sleep 2
done

# 5. Run App (Inherits variables from Step 1)
./mvnw clean spring-boot:run -Dspring-boot.run.arguments="--spring.docker.compose.enabled=false"