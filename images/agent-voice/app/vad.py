"""Server-side end-of-utterance detection (endpointing).

The satellite streams mic audio from the wake word until we tell it to stop;
deciding where the utterance ends is our job (same split as Home Assistant's
pipeline). This is a deliberately simple adaptive-energy endpointer: satellites
are close-mic devices and Whisper is robust to trailing noise, so an RMS
threshold with hangover is enough for v1 — and it keeps torch/onnx out of the
image. Swap for a model VAD later if real-world use proves it too naive.

Audio is assumed s16le mono (any sample rate; frame timing derives from it).
"""

from __future__ import annotations

from array import array
from enum import Enum
import math

FRAME_MS = 30                # analysis frame
LEADING_TIMEOUT_MS = 5000    # no speech at all -> give up (false wake)
MIN_SPEECH_MS = 250          # ignore blips shorter than this
TRAILING_SILENCE_MS = 900    # this much silence after speech -> end
MAX_UTTERANCE_MS = 12000     # hard cap, whatever happens
NOISE_EMA_ALPHA = 0.05       # noise-floor tracker smoothing
THRESHOLD_FLOOR = 350.0      # absolute minimum RMS to count as speech
THRESHOLD_RATIO = 3.0        # speech if RMS > ratio * noise floor


class Verdict(Enum):
    CONTINUE = "continue"
    END = "end"              # utterance complete, buffer worth transcribing
    TIMEOUT = "timeout"      # nothing said (or endless noise) — abort the run


class EnergyEndpointer:
    def __init__(self, sample_rate: int):
        self.sample_rate = sample_rate
        self._frame_bytes = int(sample_rate * FRAME_MS / 1000) * 2
        self._pending = bytearray()
        self._noise_floor = THRESHOLD_FLOOR
        self._elapsed_ms = 0
        self._speech_ms = 0
        self._silence_ms = 0
        self._in_speech = False

    def feed(self, data: bytes) -> Verdict:
        """Feed a chunk; returns the running verdict."""
        self._pending.extend(data)
        while len(self._pending) >= self._frame_bytes:
            frame = bytes(self._pending[: self._frame_bytes])
            del self._pending[: self._frame_bytes]
            verdict = self._feed_frame(frame)
            if verdict is not Verdict.CONTINUE:
                return verdict
        return Verdict.CONTINUE

    def _feed_frame(self, frame: bytes) -> Verdict:
        self._elapsed_ms += FRAME_MS
        rms = _rms(frame)
        threshold = max(THRESHOLD_FLOOR, self._noise_floor * THRESHOLD_RATIO)
        is_speech = rms > threshold

        if is_speech:
            self._speech_ms += FRAME_MS
            self._silence_ms = 0
            if self._speech_ms >= MIN_SPEECH_MS:
                self._in_speech = True
        else:
            # Only track the noise floor outside speech, so the threshold
            # doesn't chase the voice itself.
            self._noise_floor += NOISE_EMA_ALPHA * (rms - self._noise_floor)
            self._noise_floor = max(self._noise_floor, 1.0)
            if self._in_speech:
                self._silence_ms += FRAME_MS
                if self._silence_ms >= TRAILING_SILENCE_MS:
                    return Verdict.END
            else:
                self._speech_ms = 0

        if not self._in_speech and self._elapsed_ms >= LEADING_TIMEOUT_MS:
            return Verdict.TIMEOUT
        if self._elapsed_ms >= MAX_UTTERANCE_MS:
            return Verdict.END if self._in_speech else Verdict.TIMEOUT
        return Verdict.CONTINUE


def _rms(frame: bytes) -> float:
    samples = array("h")
    samples.frombytes(frame)
    if not samples:
        return 0.0
    return math.sqrt(sum(s * s for s in samples) / len(samples))
