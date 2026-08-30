---
sidebar_position: 2
title: Writing modules
---

# Writing a perception module

A new capability is a new `PerceptionModule`. This page is the step-by-step contract (with the
house rules front and center).

```python
# perception/modules/<you>.py
from __future__ import annotations

from aina.modules.base import PerceptionModule

class MyCapability(PerceptionModule):
    name = "my_capability"

    def requires(self) -> list[str]:
        return ["tracks"]                     # what you read from upstream

    def produces(self) -> list[str]:
        return ["events"]                     # what downstream modules may read

    def process(self, frame, upstream) -> dict:
        tracks = upstream["tracks"]
        # ... pure logic on typed upstream data ...
        return {"events": [...]}
```

## Rules that will get your PR bounced

1. **Never import another module.** `from aina.modules.foo import get_foo` inside `my_capability`
   is a coupling violation even if it works. If you need `foo`'s output, list it in `requires()`
   and read it from `upstream`.
2. **Never duplicate compute.** If another enabled module already produces a key you need, you
   `requires` it — you do not recompute it.
3. **Config-only enablement.** The module is turned on/off by YAML, never by commenting code:
   ```yaml
   capabilities:
     my_capability:
       enabled: false
   ```
4. **Behaviors are event types.** For behavior modules, produce `events` rows with the new
   `event_type` (e.g. `loitering`) and a severity. No new tables, no migrations.

## Registration

Register the module in the orchestrator's registry map (together with existing modules in
`modules/_registry_stubs.py` / `orchestrator.py`):

```python
MODULES = {
    "object_detection": ObjectDetection,
    "my_capability": MyCapability,
    # …
}
```

The orchestrator builds the graph from each module's `requires()`/`produces()`; nothing else needs
to know about you.

## Dependency resolution

Say you write `tailgating` (deferred, but a good example: `requires: [tracks, zone_membership]`).
Because both keys are produced by `tracking` and `zones`:

- Enable `tracking.enabled: true`, `zones.enabled: true`, `tailgating.enabled: true`.
- If you enable `tailgating` alone, the orchestrator **auto-enables tracking + zones** and logs
  the implicit chain (config ergonomics — the user never derives the graph by hand).
- If you `requires` a key nothing produces, **startup fails fast** naming the missing capability.

## Testing

Unit tests in `perception/tests/` use **dummy modules** (no real ML):

- A module requiring a shared key that two consumers read proves dedup (the producer ran once per
  frame — the test fails if consumers independently recompute).
- Disabling an unneeded module removes it from the graph with zero side effects.
- A missing dependency fails at startup.
- Real-YAML fixtures re-exercise the loader with dummy modules.

```bash
python3 -m pytest perception/tests/ -q
```

## Shipping checklist

- [ ] Implements `PerceptionModule`, unique `name`.
- [ ] `requires`/`produces` typed strings; never imports sibling modules.
- [ ] Config-gated; default `enabled: false` unless it's core.
- [ ] Registered in the orchestrator registry.
- [ ] Dummy-module tests prove dedup + no-side-effect-disable + fail-fast.
- [ ] Does not duplicate anything `requires`d from an enabled upstream.