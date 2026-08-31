"""Stage 4b: smoothing stack — OneEuro, KalmanCV, first-pass smoother."""
from __future__ import annotations

import numpy as np

from perception.smoothing import BoxOneEuro, DetectionSmoother, KalmanCV, OneEuroFilter


def test_one_euro_constant_signal_stays_constant():
    f = OneEuroFilter(min_cutoff=1.0, beta=0.007, d_cutoff=1.0, freq=10.0)
    out = [f.apply(42.0, i * 0.1) for i in range(50)]
    assert all(abs(v - 42.0) < 1e-6 for v in out[:6])  # steady-state flat


def test_one_euro_reduces_noise_variance():
    rng = np.random.default_rng(3)
    raw = [100.0 + rng.normal(0, 4.0) for _ in range(200)]
    f = OneEuroFilter(min_cutoff=1.0, beta=0.007, d_cutoff=1.0, freq=10.0)
    smooth = [f.apply(v, i * 0.1) for i, v in enumerate(raw)]
    assert np.var(smooth[10:]) < np.var(raw[10:]) * 0.3


def test_box_one_euro_filters_four_coordinates():
    f = BoxOneEuro(min_cutoff=1.0, beta=0.007, d_cutoff=1.0, freq=10.0)
    out1 = f.apply((1.0, 2.0, 3.0, 4.0), 0.0)
    out2 = f.apply((5.0, 6.0, 7.0, 8.0), 0.1)
    assert len(out2) == 4


def test_kalman_const_velocity_track():
    kf = KalmanCV((0.0, 0.0, 20.0, 40.0))
    # module drives the filter: time step, then absorb a new measurement
    for offset in (0.0, 11.0, 22.0, 33.0, 44.0):
        kf.predict()
        kf.update((offset, 0.0, offset + 20.0, 40.0))
    # coast a couple of frames — the learned velocity keeps the box gliding
    p1 = kf.predict()
    p2 = kf.predict()
    assert p2[0] > p1[0]  # still moving, not frozen
    assert p2[2] > p1[2]


def test_kalman_converges_to_measurement():
    kf = KalmanCV((0.0, 0.0, 20.0, 40.0))
    for _ in range(15):
        kf.predict()
        kf.update((100.0, 100.0, 120.0, 140.0))
    cx = (kf.box[0] + kf.box[2]) / 2.0
    assert abs(cx - 110.0) < 1.5  # settled on the measured center


def test_kalman_predict_scales_with_dt():
    """A longer elapsed gap must glide proportionally further (px/s)."""
    slow = KalmanCV((0.0, 0.0, 20.0, 40.0))
    fast = KalmanCV((0.0, 0.0, 20.0, 40.0))
    slow.x[4] = fast.x[4] = 20.0  # 20 px/s horizontally right (cx starts at 10)
    slow.predict(0.1)
    fast.predict(0.2)
    cx = lambda kf: (kf.box[0] + kf.box[2]) / 2.0  # noqa: E731
    assert cx(fast) == 14.0  # 10 + vx*dt
    assert cx(slow) == 12.0


def test_detection_smoother_passthrough_without_supervision():
    # On this host supervision isn't installed under the core extras, so the
    # enabled smoother must gracefully pass raw detections straight through.
    marker = {"xyxy": "pytest-sentinel"}
    smoother = DetectionSmoother(enabled=True)
    assert smoother.smooth(marker) is marker or smoother.smooth(marker) == {"xyxy": "pytest-sentinel"}
    assert smoother.smooth(None) is None


def test_detection_smoother_disabled_is_identity():
    marker = object()
    assert DetectionSmoother(enabled=False).smooth(marker) is marker