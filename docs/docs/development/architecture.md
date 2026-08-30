---
sidebar_position: 1
title: Architecture
---

# Architecture

Two non-negotiable constraints shape the whole codebase; both are enforced *structurally*, not by
convention:

> **1. Nothing is coupled.** No perception module may import another module or call its functions.
> Modules communicate only through typed data declared via `requires()` / `produces()` on a shared
> orchestrator.

> **2. No redundant compute.** If two enabled modules need the same upstream result, it's computed
> **exactly once per frame** and shared. Enforced by the orchestrator's dependency graph, not code
> review.

## The module contract

Every perception capability implements this interface:

```python
class PerceptionModule(ABC):
    name: str                          # unique key, e.g. "object_detection"

    def requires(self) -> list[str]:   # keys this module needs from upstream output
    def produces(self) -> list[str]:   # keys this module writes for downstream modules

    def process(self, frame, upstream) -> dict:
        """upstream: dict of already-computed results keyed by requires() strings.
        Returns a dict keyed by produces() strings.
        Must not reach into other modules directly."""
```

Modules never import each other. A behavior module asking for `[tracks, zone_membership]` gets
exactly those keys in `upstream` — typed, cached, and computed once.

## The orchestrator

On startup:

1. Read `capabilities:` from `config/aina.yaml` and instantiate **only the enabled modules**.
2. Build a dependency graph from `requires()` / `produces()`.
3. Topologically sort it — **this is where dedup happens**: if face-recognition and demographic
   estimation both declare `requires: [face_crops]`, the producer of `face_crops` runs once per
   frame and both consumers read the same cached result. A second computation is
   *architecturally impossible*, not merely discouraged.
4. **Fail fast:** if an enabled module requires a key no enabled module produces, startup aborts
   with an error naming the missing capability. No silent mid-run skips.
5. **Config ergonomics:** if a user enables a module without its required upstream (e.g. ANPR
   without vehicles), the orchestrator auto-enables the minimum dependency chain and logs what it
   turned on implicitly.

```bash
# verify the enabled graph at runtime
python -m pytest perception/tests/ -q        # incl. dedup + missing-dep tests, dummy modules
```

## Per-frame flow

```
frame timestamped at capture ─▶ detection ─▶ DetectionSmoother ─▶ tracking (dt-aware)
   ─▶ One Euro per-track render smoothing ─▶ zones ─▶ persistence / behaviors / overlays
```

Everything is a config toggle (`smoothing.*`, each capability); see
[Configuration](../configuration).

## Container topology

`media` (go2rtc) restreams each camera **once**.

- The API/recording layer and perception consume the same restream — the "restream-once"
  principle repeated at every layer.
- The dashboard never talks to a camera; nginx proxies `/media` (MSE) and `/api` (catalog/queries).

## Data flow contract

`perception` writes to Postgres. `api` reads Postgres and serves it (cameras, zones, tracks,
events). `dashboard` reads the API and the go2rtc MSE stream. There is no hidden channel between
services — a fresh viewer can trace every byte through the four boundaries above.

## Why modules, not processes

Each module stays inside one GPU process so frames never leave the container, but the module
boundary is a hard interface — it is what lets you add ANPR or a new detector layer without
touching any other module's code. See [Writing modules](./modules).