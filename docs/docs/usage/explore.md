---
sidebar_position: 3
title: Explore (semantic search)
---

# Explore

**Explore** is the planned semantic-search surface: type *"man in red shirt near the loading dock
after 10pm"* and get ranked footage.

## Target UX (Stage 7)

1. **Query input** — a free-text box.
2. **Natural-language parsing** — an LLM call splits the query into
   `{structured_filters, semantic_text}`: *camera=near loading dock*, *time=after 10pm* → hard
   filters; *"man in red shirt"* → the semantic part.
3. **Filtered vector search** — the API applies structured filters first (camera/zone/time), then
   pgvector similarity over CLIP embeddings of track thumbnails **within that narrowed set**.
4. **Result grid** — ranked thumbnails with the matching track and its recorded window.

The embeddings pipeline is async and off the per-frame hot path: each track's best-confidence
thumbnail gets an embedding queued as it finalizes, then written to the `embeddings` table
(see [Data layer → embeddings](../platform/data-layer#embeddings)).

## Alpha status

- The **Explore page exists** in the dashboard (`Explore.tsx`) with the query box and a mock result
  grid.
- The **schema is ready**: `embeddings` (pgvector columns), `segments`, `incidents` are created by
  the migrations.
- `semantic_search` in `config/aina.yaml` is **off by default** (`enabled: false`) until the local
  CLIP encoder lands.

```yaml
semantic_search:
  enabled: false          # Stage 7 — off until local-CLIP embeddings land
  embedding_model: local_clip   # must stay local — no cloud embedding APIs
```

## Wiring plan

1. `embeddings` module (local CLIP/OpenCLIP, interface-swappable) writes vectors on track finalize.
2. API gains `POST /api/search {query, filters}` → `{structured_filters, semantic_text}` → vector
   similarity in the narrowed set.
3. `Explore.tsx` swaps its mock results for real ranked rows.

Track this on the [roadmap](../development/roadmap).