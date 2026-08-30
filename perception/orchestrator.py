"""Surveillance Intelligence Lab perception orchestrator.

Builds a dependency graph from every enabled module's ``requires()`` /
``produces()`` declarations, topologically sorts it, and runs one pass per
frame. Dedup is structural, not conventional:

- exactly one module produces a given capability key (or several broadcast it —
  each broadcast producer runs *once*);
- consumers read a per-frame cached namespace, so a shared upstream result is
  computed exactly once even when two consumers need it;
- missing capabilities fail fast at startup (ConfigError) — never mid-run;
- registry stubs (implemented=False) likewise refuse to boot when enabled, so
  a not-yet-implemented capability can never silently pass as working.

Nothing here imports any perception module; modules communicate solely through
the typed capability namespace (AINA_AGENT_BUILD_PROMPT §0.1).
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from dataclasses import dataclass
from typing import Any

from .config_schema import (
    AinaConfig,
    ConfigError,
    auto_enable_log,
    load_config,
    resolve_enabled,
)
from .modules import REGISTRY, REGISTRY_ORDER, Frame, PerceptionModule

logger = logging.getLogger("aina.perception")


class DependencyError(Exception):
    """Graph is unsatisfiable: missing capability or a cycle."""


@dataclass(frozen=True)
class ModuleNode:
    module: PerceptionModule
    requires: list[str]
    produces: list[str]
    index: int

    @property
    def name(self) -> str:
        return self.module.name


class Orchestrator:
    """Runs a set of PerceptionModules over frames according to their graph."""

    def __init__(
        self,
        config: AinaConfig,
        overrides: dict[str, PerceptionModule] | None = None,
        registry_order: list[str] | None = None,
    ) -> None:
        overrides = overrides or {}
        self.config = config
        self._overrides = overrides

        order = list(dict.fromkeys([*(registry_order or REGISTRY_ORDER), *REGISTRY.keys(), *overrides.keys()]))

        # Discover requires()/produces() from the full available pool — the
        # whole registry, not just config-listed capabilities — so auto-enable
        # can pull in an upstream module the operator never mentioned (e.g.
        # "zones" behind "behavior_loitering"). Discovery uses cheap stubs;
        # heavy model loading happens in start(), only for modules that survive
        # resolution.
        self._contracts: dict[str, tuple[list[str], list[str]]] = {}
        for name in order:
            if name in overrides:
                probe = overrides[name]
            elif name in REGISTRY:
                probe = REGISTRY[name]()
            else:
                continue
            self._contracts[name] = (probe.requires(), probe.produces())

        # Overrides shadow the registry for every capability they produce: the
        # operator's detector replaces the built-in one — never both. This keeps
        # one compute per key per frame by construction.
        override_keys = {
            k for name in overrides for _, produces in [self._contracts[name]] for k in produces
        }
        if override_keys:
            self._contracts = {
                name: contract
                for name, contract in self._contracts.items()
                if name in overrides or not set(contract[1]) & override_keys
            }

        produces_by_key: dict[str, list[str]] = {}
        for name, (_, produces) in self._contracts.items():
            for k in produces:
                produces_by_key.setdefault(k, []).append(name)

        requested = {n for n, cc in config.capabilities.items() if cc.enabled and n in self._contracts}
        requested |= set(overrides)
        self.enabled, auto = resolve_enabled(
            requested,
            requires_of=lambda n: self._contracts[n][0],
            produces_by_key=produces_by_key,
            order=order,
        )
        auto_enable_log(auto)

        self._reject_unknown_requested()
        self._reject_unimplemented()

        # Instantiate only the enabled set; hand each its config params and
        # cross-cutting context (smoothing stack; camera names/zones, which live
        # under cameras: not capabilities: in aina.yaml). Heavy resource loading
        # happens in start(), not here.
        self._modules: dict[str, PerceptionModule] = {}
        sources = [cam.name for cam in config.cameras]
        zones_by_source = {cam.name: [{"name": z.name, "polygon": z.polygon} for z in cam.zones] for cam in config.cameras}
        camera_defs = [
            {
                "name": cam.name,
                "source": cam.source,
                "zones": [{"name": z.name, "polygon": z.polygon} for z in cam.zones],
            }
            for cam in config.cameras
        ]
        for name in self.enabled:
            module = overrides[name] if name in overrides else REGISTRY[name]()
            params = dict(config.capabilities[name].params if name in config.capabilities else {})
            if name == "tracking":
                params["_sources"] = sources
            if name == "zones":
                params["_zones_by_source"] = zones_by_source
            if name == "persistence":
                params["_camera_defs"] = camera_defs
                # Only sink behavior events when an *enabled* behavior module
                # produces them; otherwise persistence must not require "events"
                # (that would auto-enable a behavior module toggled off).
                params["_behavior_events"] = [
                    n for n in self.enabled if "events" in self._contracts[n][1]
                ]
                # Same gating for semantic embeddings (semantic_search module):
                # no embeddings producer => persistence must not require it.
                params["_embedding_sinks"] = [
                    n for n in self.enabled if "embeddings" in self._contracts[n][1]
                ]
            module.configure(params)
            module.smoothing = dict(config.smoothing)
            self._modules[name] = module

        self.nodes: list[ModuleNode] = [
            ModuleNode(
                module=self._modules[n],
                requires=self._modules[n].requires(),
                produces=self._modules[n].produces(),
                index=i,
            )
            for i, n in enumerate(self.enabled)
        ]
        name_to_node = {n.name: n for n in self.nodes}
        self.producer_map: dict[str, list[ModuleNode]] = {}
        for node in self.nodes:
            for k in node.produces:
                self.producer_map.setdefault(k, []).append(node)

        self.schedule = self._topological_sort(name_to_node)

        for node in self.schedule:
            node.module.start()

    # ------------------------------------------------------------------ #
    def _reject_unimplemented(self) -> None:
        stubs = []
        for name in self.enabled:
            if name in self._overrides or name not in REGISTRY:
                continue  # test override or unknown — handled elsewhere
            if not REGISTRY[name]().implemented:
                stubs.append(name)
        if stubs:
            raise ConfigError(
                "refusing to start: enabled capability module(s) are registered "
                f"but not implemented yet: {sorted(stubs)}. They must not run."
            )

    # ------------------------------------------------------------------ #
    def _reject_unknown_requested(self) -> None:
        unknown = sorted(
            n
            for n, cc in self.config.capabilities.items()
            if cc.enabled and n not in self._contracts
        )
        if unknown:
            raise ConfigError(
                f"config enables unknown capability module(s): {unknown} "
                "(typo? not yet implemented?)"
            )

    # ------------------------------------------------------------------ #
    def _topological_sort(self, name_to_node: dict[str, ModuleNode]) -> list[ModuleNode]:
        """Kahn's algorithm on module-level edges producer -> consumer.

        A consumer waits on *every* producer of each capability it requires.
        """
        nodes = self.nodes
        index = {n.name: i for i, n in enumerate(nodes)}
        in_degree = {n.name: 0 for n in nodes}
        adjacency: dict[str, set[str]] = {n.name: set() for n in nodes}

        for node in nodes:
            for key in node.requires:
                producers = self.producer_map.get(key, [])
                if not producers:
                    raise DependencyError(
                        f"module {node.name!r} requires capability {key!r} but no enabled "
                        "module produces it. This should have been caught during "
                        "resolution — bug."
                    )
                for p in producers:
                    if p.name == node.name:
                        continue
                    adjacency[p.name].add(node.name)
                    in_degree[node.name] += 1

        # stable order: process ready nodes in declaration order
        ready = sorted([n for n in nodes if in_degree[n.name] == 0], key=lambda n: n.index)
        done: list[ModuleNode] = []
        while ready:
            current = ready.pop(0)
            done.append(current)
            for consumer_name in sorted(adjacency[current.name], key=lambda n: index[n]):
                in_degree[consumer_name] -= 1
                if in_degree[consumer_name] == 0:
                    ready.append(name_to_node[consumer_name])
                    ready.sort(key=lambda n: n.index)
        if len(done) != len(nodes):
            cyclic = [n.name for n in nodes if n not in done]
            raise DependencyError(f"dependency cycle detected among modules: {sorted(cyclic)}")
        return done

    # ------------------------------------------------------------------ #
    def process_frame(self, frame: Frame) -> dict[str, list[Any]]:
        """Run one frame through the graph. Each module runs exactly once."""
        results: dict[str, list[Any]] = {}
        for node in self.schedule:
            upstream = {k: results[k] for k in node.requires if k in results}
            outputs = node.module.process(frame, upstream)
            if not isinstance(outputs, dict):
                raise TypeError(f"module {node.name!r} returned {type(outputs).__name__}, expected dict")
            for key, value in outputs.items():
                results.setdefault(key, []).append(value)
        return results

    # ------------------------------------------------------------------ #
    def execution_summary(self) -> str:
        lines = ["enabled modules in execution order:"]
        for node in self.schedule:
            deps = ", ".join(node.requires) or "(none)"
            outs = ", ".join(node.produces) or "(sink)"
            lines.append(f"  {node.name:<24} requires[{deps}]  produces[{outs}]")
        return "\n".join(lines)


# --------------------------------------------------------------------------- #
# CLI / container boot
# --------------------------------------------------------------------------- #


def _print_gpu_proof() -> None:
    target = os.environ.get("DEPLOYMENT_TARGET", "edge")
    logger.info("deployment.target=%s", target)
    try:
        out = subprocess.run(["nvidia-smi"], capture_output=True, text=True, timeout=30)
        if out.returncode == 0:
            smi = "\n".join(out.stdout.splitlines()[:12])
            logger.info("GPU proof (nvidia-smi inside container):\n%s", smi)
        else:
            logger.warning("nvidia-smi failed rc=%s", out.returncode)
    except FileNotFoundError:
        logger.warning("nvidia-smi not present — GPU passthrough not proven for this container.")


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    config_path = next((a for a in argv if not a.startswith("-")), "/etc/aina/aina.yaml")
    if not os.path.exists(config_path):
        logger.error("config not found: %s", config_path)
        return 1

    try:
        config = load_config(config_path)
    except (ConfigError, OSError) as exc:
        logger.error("config load failed: %s", exc)
        return 1

    _print_gpu_proof()

    try:
        orchestrator = Orchestrator(config)
    except (ConfigError, DependencyError) as exc:
        logger.error("orchestrator refused to start: %s", exc)
        return 1

    logger.info("orchestrator ready\n%s", orchestrator.execution_summary())

    if os.environ.get("AINA_INGEST", "none") == "rtsp":
        return _run_ingest_loop(orchestrator, config)

    logger.info("AINA_INGEST=%s — idle until ingestion is enabled (Stage 4)", os.environ.get("AINA_INGEST", "none"))
    import time

    try:
        while True:
            time.sleep(30)
    except KeyboardInterrupt:
        pass
    return _shutdown(orchestrator)


def _run_ingest_loop(orchestrator: Orchestrator, config: AinaConfig) -> int:
    from .ingest import IngestionError, build_pumps

    if not config.cameras:
        logger.error("AINA_INGEST=rtsp but config declares no cameras")
        return 1
    try:
        pumps = build_pumps(config.cameras, target_fps=parse_fps_env())
    except Exception as exc:
        logger.error("pump build failed: %s", exc)
        return 1

    results: dict = {}
    try:
        for frame in _round_robin(pumps):
            try:
                results = orchestrator.process_frame(frame)
            except Exception as exc:
                results = results or {}
                logger.exception("frame %s failed: %s", frame.frame_id, exc)
                if os.environ.get("AINA_FAIL_FAST") == "1":
                    raise
            _maybe_log_frame(frame, results)
    except IngestionError as exc:
        logger.error("ingestion failed: %s", exc)
        return 1
    except KeyboardInterrupt:
        pass
    finally:
        for pump in pumps:
            pump.close()
    return _shutdown(orchestrator)


def _round_robin(pumps):
    """Yield one frame per pump, cycled, until every source ends.

    Each pump.FramePump throttles internally, so interleaving cameras still
    holds each source to AINA_FPS.
    """
    gens = [pump.frames() for pump in pumps]
    while gens:
        for gen in list(gens):
            try:
                yield next(gen)
            except StopIteration:
                gens.remove(gen)


def parse_fps_env() -> float:
    try:
        return max(1.0, min(30.0, float(os.environ.get("AINA_FPS", "10"))))
    except ValueError:
        return 10.0


def _single_payload(payloads: list[Any]) -> Any:
    """Unwrap the one-element list process_frame builds per capability key."""
    return payloads[-1] if payloads else None


def _payload_count(payloads: list[Any]) -> int:
    p = _single_payload(payloads) if payloads else None
    if p is None:
        return 0
    try:
        return len(p)
    except TypeError:
        return 0


def _maybe_log_frame(frame, results: dict) -> None:
    count = _payload_count(results.get("detections"))
    if count or frame.frame_id % 30 == 0:  # ~3x/sec at 10fps, not per-frame spam
        logger.info("%s frame=%s detections=%s", frame.source, frame.frame_id, count)


def _shutdown(orchestrator: Orchestrator) -> int:
    try:
        for node in orchestrator.schedule:
            node.module.stop()
    finally:
        return 0


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    sys.exit(main())