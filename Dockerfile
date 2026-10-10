FROM node:20-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend.py data_analyzer.py data_generator.py inject_problem.py ./
COPY data/ ./data/
COPY --from=frontend-build /build/frontend/dist ./frontend/dist
EXPOSE 10000
CMD ["sh", "-c", "uvicorn backend:app --host 0.0.0.0 --port ${PORT:-10000}"]
