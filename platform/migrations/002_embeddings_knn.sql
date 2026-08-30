-- Stage 7 — pgvector KNN index over the semantic embeddings pool.
-- Cosine distance (<=>) on L2-normalized CLIP vectors; HNSW keeps KNN fast
-- once the demo feed grows. Idempotent like 001 (CREATE INDEX IF NOT EXISTS).
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS idx_embeddings_model_vector
    ON embeddings USING hnsw (vector vector_cosine_ops);