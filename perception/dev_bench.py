"""Offline benchmark: drive the live perception runtime over local media.

Usage: python3 -m perception.dev_bench [config.yaml] [--render out.mp4]

Runs the exact orchestration path (detector -> tracking -> zones) over the
local files declared in `cameras[].source`, measures per-frame latency and
throughput, and optionally renders annotated boxes to disk.
"""
from __future__ import annotations

import argparse
import logging
import statistics
import sys
import time

import numpy as np

from .config_schema import ConfigError, load_config
from .ingest import IngestionError, build_pumps
from .orchestrator import Orchestrator

logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("aina.dev_bench")


def _single_payload(payloads):
    return payloads[-1] if payloads else None


def main(argv: list[str] | None = None) -> int:
    argv = list(argv if argv is not None else sys.argv[1:])
    parser = argparse.ArgumentParser()
    parser.add_argument("config", nargs="?", default="/etc/aina/aina.yaml")
    parser.add_argument("--render", default="")
    parser.add_argument("--fps", type=float, default=1000.0, help="pump target cap")
    parser.add_argument("--max-frames", type=int, default=0)
    parser.add_argument("--dump-tracks", action="store_true")
    parser.add_argument("--trace", type=int, action="append", default=[])
    args = parser.parse_args(argv)

    try:
        config = load_config(args.config)
    except (ConfigError, OSError) as exc:
        log.error("config load failed: %s", exc)
        return 1

    orchestrator = Orchestrator(config)

    try:
        pumps = build_pumps(config.cameras, target_fps=args.fps)
    except Exception as exc:
        log.error("pump build failed: %s", exc)
        return 1

    names = [n.name for n in orchestrator.schedule]
    print(f"schedule: {' -> '.join(names)}")

    names: dict[int, str] | None = None
    writer = None
    w, h = 1280, 720
    frame_times: list[float] = []
    n_det: list[int] = []
    n_tracks: list[int] = []
    track_ids: dict[int, int] = {}
    max_gid = 0
    seen_sources = set()
    total = 0
    t0 = time.perf_counter()

    try:
        for pump in pumps:
            pump.open()
            for frame in pump.frames():
                w, h = frame.width or w, frame.height or h
                seen_sources.add(frame.source)
                t = time.perf_counter()
                results = orchestrator.process_frame(frame)
                frame_times.append(time.perf_counter() - t)
                total += 1

                dets = _single_payload(results.get("detections"))
                n_det.append(len(dets))
                tracks = results.get("tracks")
                tr = _single_payload(tracks).tracks if tracks else []
                n_tracks.append(len(tr))
                for track in tr:
                    max_gid = max(max_gid, track.track_id)
                    track_ids[track.track_id] = track_ids.get(track.track_id, 0) + 1

                if args.trace:
                    wanted = set(args.trace)
                    for t in tr:
                        if t.class_id in wanted:
                            b = t.raw_xyxy if getattr(t, "raw_xyxy", None) is not None else t.xyxy
                            print(
                                f"trace cls={t.class_id} id={t.track_id} "
                                f"xy=({b[0]:.0f},{b[1]:.0f},{b[2]:.0f},{b[3]:.0f}) "
                                f"c={'c' if t.coasted else '-'}",
                                flush=True,
                            )
                if args.dump_tracks and total % 15 == 0:
                    print(
                        "ids",
                        [f"{t.track_id}{'c' if t.coasted else ''}:{t.class_id:.3f}" for t in tr[:24]],
                        flush=True,
                    )
                if args.max_frames and total >= args.max_frames:
                    break

                zones = results.get("zone_membership")
                if zones and total % 60 == 0:
                    payload = zones[-1]
                    members = payload.get("memberships", {})
                    for (src, gid), znames in members.items():
                        if znames:
                            print(f"frame {total:4d} {src} track#{gid} in {','.join(znames)}")

                if total % 60 == 0:
                    print(f"frame {total:4d}  det={len(dets)} tracks={len(tr)}", flush=True)

                if args.render:
                    if writer is None:
                        import cv2

                        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                        writer = cv2.VideoWriter(args.render, fourcc, 30.0, (w, h))
                    if names is None and getattr(dets, "data", None):
                        names = (dets.data or {}).get("class_names") or {}
                    image = frame.image.copy()
                    for track in tr:
                        x1, y1, x2, y2 = (int(round(v)) for v in track.xyxy)
                        color = (72, 200, 60) if not track.coasted else (60, 120, 220)
                        cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
                        name = (names or {}).get(int(track.class_id)) or str(track.class_id)
                        text = f"#{track.track_id} {name}" + (" c" if track.coasted else "")
                        cv2.putText(
                            image,
                            text,
                            (x1, max(y1 - 6, 12)),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.5,
                            color,
                            1,
                            cv2.LINE_AA,
                        )
                    writer.write(image)
    except (KeyboardInterrupt, IngestionError) as exc:
        if not isinstance(exc, KeyboardInterrupt):
            log.error("ingestion ended: %s", exc)

    elapsed = time.perf_counter() - t0
    if writer is not None:
        writer.release()

    ft = np.asarray(frame_times) * 1000.0
    print(f"\nprocessed {total} frames in {elapsed:.2f}s from {sorted(seen_sources)}")
    print(
        f"achieved {total / elapsed:.1f} fps  (pipeline/frame: "
        f"mean {ft.mean():.1f}ms p50 {np.percentile(ft, 50):.1f}ms "
        f"p95 {np.percentile(ft, 95):.1f}ms p99 {np.percentile(ft, 99):.1f}ms)"
    )
    if n_det:
        print(
            f"detections/frame: mean {statistics.mean(n_det):.2f} max {max(n_det)} frames_with_any {sum(1 for d in n_det if d)}/{len(n_det)}"
        )
    if n_tracks:
        active = sum(1 for t in n_tracks if t)
        print(f"tracks/frame: mean {statistics.mean(n_tracks):.2f} max {max(n_tracks)} frames_with_tracks {active}/{len(n_tracks)}")
        print(f"unique track ids seen: {len(track_ids)} (max global id {max_gid})")
        stable = sum(1 for c in track_ids.values() if c > len(n_tracks) * 0.5)
        print(f"tracks present on >50% of frames: {stable}")
    return 0


if __name__ == "__main__":
    sys.exit(main())