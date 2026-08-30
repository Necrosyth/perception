"""One Euro Filter — per-track render smoothing (jitter removal).

Standard low-latency adaptive low-pass (Casiez et al.): with a frequency
estimator whose cutoff follows the signal's *derivative*, the filter leans on
`min_cutoff` when motion is slow (hard smoothing) and loosens toward `beta` as
speed rises. Applied per-coordinate to a track's render box when
``smoothing.one_euro_filter`` is on. Pure numpy, zero deps — unit-testable
without the ML stack installed.
"""
from __future__ import annotations

import math


def _alpha(cutoff: float, dt: float) -> float:
    tau = 1.0 / (2.0 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / max(dt, 1e-9))


class _LowPass:
    __slots__ = ("cutoff", "value", "alpha")

    def __init__(self, cutoff: float, first: float) -> None:
        self.cutoff = float(cutoff)
        self.value = float(first)
        self.alpha = 1.0


class OneEuroFilter:
    """One Euro Filter for one scalar stream (timestamps strictly increase)."""

    def __init__(
        self,
        min_cutoff: float = 1.0,
        beta: float = 0.007,
        d_cutoff: float = 1.0,
        freq: float = 10.0,
    ) -> None:
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)
        if freq <= 0:
            raise ValueError("OneEuroFilter.freq must be > 0")
        self.freq = float(freq)
        self._last_t: float | None = None
        self._x: _LowPass | None = None
        self._dx: _LowPass | None = None

    def apply(self, sample: float, timestamp: float) -> float:
        if self._last_t is None:
            self._last_t = float(timestamp)
            self._x = _LowPass(self.min_cutoff, sample)
            self._dx = _LowPass(self.d_cutoff, 0.0)
            return sample
        dt = max(float(timestamp) - self._last_t, 1e-6)
        self._last_t = float(timestamp)

        dx = (sample - self._x.value) / dt
        self._dx.alpha = _alpha(self._dx.cutoff, dt)
        self._dx.value = self._dx.alpha * dx + (1.0 - self._dx.alpha) * self._dx.value

        cutoff = self.min_cutoff + self.beta * abs(self._dx.value)
        self._x.alpha = _alpha(cutoff, dt)
        self._x.value = self._x.alpha * sample + (1.0 - self._x.alpha) * self._x.value
        return self._x.value


class BoxOneEuro:
    """Four independent OneEuroFilters over one xyxy box."""

    def __init__(self, **kwargs) -> None:
        self.filters = [OneEuroFilter(**kwargs) for _ in range(4)]

    def apply(
        self, box: tuple[float, float, float, float], timestamp: float
    ) -> tuple[float, float, float, float]:
        return tuple(f.apply(float(value), timestamp) for f, value in zip(self.filters, box))  # type: ignore[return-value]