---
sidebar_position: 5
title: Smoothing
---

# Smoothing (jitter elimination)

At 10–12 FPS, naive settings visibly shake and drop tracks. The platform implements all four
required anti-jitter techniques, **each toggleable independently** so you can prove which one is
contributing.

```yaml
smoothing:
  detection_smoother: true      # sv.DetectionSmoother first-pass on raw detections
  one_euro_filter: true         # per-track render smoothing
  render_interpolation: true    # Kalman predict between real detections
  min_cutoff: 1.0
  beta: 0.007
  d_cutoff: 1.0
```

## The four problems and their fixes

### 1. Bounding-box jitter (flicker on a near-static object)

Independent per-frame detections vary by a few pixels; at 10–12 FPS each frame is on screen ~3×
longer, so that noise reads as shaking.

Fix: `detection_smoother` — Supervision's DetectionSmoother applied **upstream of tracking**,
stabilizing association inputs.

### 2. Track fragmentation / ID switching

Trackers built for 25–30 FPS benchmarks assume small displacement per frame. At 10–12 FPS objects
move far more between frames, breaking IoU association (see [Tracking](./tracking) for the
time-scaling + real-`dt` fixes).

### 3. Uneven frame delivery

A producer-consumer queue under variable load delivers frames at irregular real intervals. If the
Kalman predict step assumes a fixed `dt`, predictions drift.

Fix: **real measured `dt`** per frame (implemented in the tracker — see [Tracking](./tracking)),
kept in sync with the same timestamp source used here.

### 4. Detection rate ≠ render rate

If inference can only reach 10–12 FPS, the dashboard is not forced to render at that cadence —
and neither is the overlay. `render_interpolation: true` lets the tracker's Kalman **predict**
step interpolate a box position for render frames between real detections, the same technique
games use between physics ticks and render frames.

## One Euro Filter parameters

The per-track filter adapts its cutoff to estimated velocity — smoothing slow motion but staying
responsive on fast objects:

| Parameter | Meaning |
| --- | --- |
| `min_cutoff` | Minimum cutoff frequency (low → smoother, more lag) |
| `beta` | Speed coefficient — how quickly cutoff rises with velocity |
| `d_cutoff` | Cutoff used for the derivative (velocity) estimate |

Tuning guidance: raise `min_cutoff` if fast objects jitter; lower it if slow objects swim. Raise
`beta` if fast objects lag.

## Debugging

Turn off `one_euro_filter` alone and watch boxes shake; turn off `render_interpolation` and watch
the render cadence revert to inference cadence. Each toggle isolates one layer, so a regression is
always attributable to one technique.

## The acceptance numbers

The shipped harness logs per-track box deltas frame-to-frame and asserts:

- **static object** — smoothed output's positional variance below a pixel threshold;
- **moving object** — lag (centroid distance, predicted vs next real detection) below a threshold.

The whole stack, and each layer's contribution, is verified numerically — not by eyeballing.