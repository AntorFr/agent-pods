"""In-memory store for synthesized WAVs, served over HTTP to the satellites.

ESPHome plays TTS by fetching a URL (TTS_END data / announcement media_id), so
every utterance needs a short-lived address. Tokens are unguessable UUIDs and
entries expire — nothing touches disk.
"""

from __future__ import annotations

import time
import uuid

TTL_SECONDS = 300


class TtsStore:
    def __init__(self) -> None:
        self._items: dict[str, tuple[float, bytes]] = {}

    def put(self, wav: bytes) -> str:
        self._prune()
        token = uuid.uuid4().hex
        self._items[token] = (time.monotonic() + TTL_SECONDS, wav)
        return token

    def get(self, token: str) -> bytes | None:
        entry = self._items.get(token)
        if entry is None:
            return None
        expires, wav = entry
        if time.monotonic() > expires:
            del self._items[token]
            return None
        return wav

    def _prune(self) -> None:
        now = time.monotonic()
        for token in [t for t, (exp, _) in self._items.items() if now > exp]:
            del self._items[token]
