"""Runtime configuration store.

The config is a single JSON file on the shared pod volume, owned by the
gateway's settings UI (the PWA writes it, alfred-voice reads it). Changes are
picked up by mtime polling — no restart needed to add/remove a device or
switch a voice.
"""

from __future__ import annotations

import copy
import json
import logging
import os
from pathlib import Path
from typing import Any

log = logging.getLogger("alfred-voice.config")

DEFAULT_CONFIG: dict[str, Any] = {
    "language": "fr",
    "services": {
        "stt": {"host": "wyoming-whisper.home.svc.cluster.local", "port": 10300},
        "tts": {"host": "nestor-voice.home.svc.cluster.local", "port": 10200},
    },
    # One route per wake word (normalized: "Hey Jarvis" -> "hey_jarvis").
    # mode "async": immediate spoken ack, real answer delivered later as an
    #               announcement (for slow agent backends).
    # mode "sync":  wait up to sync_timeout_s and speak the answer in the same
    #               pipeline run (for fast intent backends); falls back to the
    #               async flow when the backend is slower than expected.
    "routes": {
        "hey_jarvis": {
            "backend": "alfred",
            "voice": "nestor",
            "mode": "async",
            "ack": "Bien reçu, je m'en occupe.",
        },
        "okay_nabu": {
            "backend": "ha",
            "voice": "nestor",
            "mode": "sync",
            "ack": "Un instant.",
        },
    },
    "default_route": "hey_jarvis",
    # Devices are ESPHome voice satellites; host defaults to
    # <name>.<ALFRED_VOICE_DEVICE_DOMAIN> when no explicit host is given.
    "devices": [],
    "sync_timeout_s": 8,
    "backend_timeout_s": 240,
}


def normalize_wake_word(phrase: str | None) -> str | None:
    """"Hey Jarvis" / "hey_jarvis." -> "hey_jarvis" (route key form)."""
    if not phrase:
        return None
    return "_".join("".join(c if c.isalnum() else " " for c in phrase.lower()).split())


class ConfigStore:
    """Load/merge/watch the JSON config file (defaults fill missing keys)."""

    def __init__(self, path: str | os.PathLike[str]):
        self.path = Path(path)
        self._mtime: float | None = None
        self.current: dict[str, Any] = copy.deepcopy(DEFAULT_CONFIG)
        self.reload()

    def reload(self) -> bool:
        """Re-read the file if it changed. Returns True when config changed."""
        try:
            mtime = self.path.stat().st_mtime
        except FileNotFoundError:
            if self._mtime is None:
                log.info("no config file at %s — using defaults", self.path)
                self._mtime = 0.0
            return False
        if mtime == self._mtime:
            return False
        self._mtime = mtime
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as err:
            log.error("config %s unreadable (%s) — keeping previous", self.path, err)
            return False
        merged = copy.deepcopy(DEFAULT_CONFIG)
        _deep_merge(merged, data)
        self.current = merged
        log.info("config loaded from %s (%d device(s))",
                 self.path, len(merged.get("devices", [])))
        return True

def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> None:
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
