FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 HF_HOME=/opt/models FASTEMBED_CACHE_PATH=/opt/models/fastembed
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl libgomp1 && rm -rf /var/lib/apt/lists/*
COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/keel/__init__.py backend/keel/__init__.py
ARG WITH_ROUTER=1
RUN pip install -e "./backend[local]"
RUN if [ "$WITH_ROUTER" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends build-essential cmake && \
      CMAKE_ARGS="-DGGML_NATIVE=OFF -DGGML_BLAS=OFF" pip install "llama-cpp-python==0.3.5" && \
      apt-get purge -y build-essential cmake && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*; \
    fi
RUN python -c "from fastembed import TextEmbedding; from fastembed.rerank.cross_encoder import TextCrossEncoder; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/opt/models/fastembed'); TextCrossEncoder('Xenova/ms-marco-MiniLM-L-6-v2', cache_dir='/opt/models/fastembed')"
COPY backend backend
COPY corpus corpus
COPY evals evals
RUN useradd -m keel && mkdir -p /app/models && chown -R keel /app /opt/models
USER keel
WORKDIR /app/backend
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD curl -fs http://localhost:8000/health || exit 1
CMD ["sh", "-c", "uvicorn keel.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
