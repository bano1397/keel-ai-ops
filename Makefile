PY ?= .venv/bin/python
.PHONY: up down seed eval eval-quick test lint fmt e2e dataset

up:            ## Build and start db + api + web
	docker compose up -d --build
	@echo "API http://localhost:8000  ·  Dashboard http://localhost:3000  ·  Chat http://localhost:3000/chat"

down:
	docker compose down

seed:          ## Seed demo data and (re)index the knowledge base
	cd backend && ../$(PY) -m keel.seed

eval:          ## Full 100-case eval on an isolated database
	$(PY) -m evals.run

eval-quick:    ## 20-case subset (used in CI)
	$(PY) -m evals.run --subset 20 --label ci

test:
	cd backend && ../$(PY) -m pytest -q

lint:
	.venv/bin/ruff check backend evals finetune corpus && .venv/bin/ruff format --check backend evals finetune corpus
	cd backend && ../.venv/bin/mypy keel
	cd frontend && npm run lint

fmt:
	.venv/bin/ruff check --fix backend evals finetune corpus && .venv/bin/ruff format backend evals finetune corpus

e2e:
	cd frontend && npx playwright test

dataset:       ## Rebuild the fine-tune dataset (needs bitext.jsonl)
	$(PY) finetune/build_dataset.py --bitext $(BITEXT)
