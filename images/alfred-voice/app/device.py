"""One persistent link per ESPHome voice satellite.

The link plays the role Home Assistant's ESPHome integration normally holds:
it connects over the native API, subscribes as THE voice assistant client
(the firmware accepts a single subscriber — first one wins, see
voice_assistant.cpp::client_subscription), and hands pipeline runs to a
VoiceRun created by the injected factory.

Requires the device's assist_satellite entity to be DISABLED in Home
Assistant, otherwise HA holds the slot and this link receives nothing —
there is no protocol-level NACK to detect the conflict, only silence.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

from aioesphomeapi import APIClient
from aioesphomeapi.model import VoiceAssistantFeature

log = logging.getLogger("alfred-voice.device")

RECONNECT_MIN_S = 5
RECONNECT_MAX_S = 60


class DeviceLink:
    def __init__(self, name: str, host: str, port: int, noise_psk: str,
                 pipeline_factory: Callable[["DeviceLink"], Any]):
        self.name = name
        self.host = host
        self.port = port
        self._noise_psk = noise_psk
        self._pipeline_factory = pipeline_factory
        self.cli: APIClient | None = None
        self.connected = False
        self.esphome_version: str | None = None
        self.model: str | None = None
        self.feature_flags = 0
        self.last_error: str | None = None
        self._run: Any | None = None
        self._stopping = False
        self._disconnected = asyncio.Event()
        self._task: asyncio.Task | None = None

    # --- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        self._task = asyncio.create_task(self._loop(), name=f"link-{self.name}")

    async def stop(self) -> None:
        self._stopping = True
        self._disconnected.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self._teardown()

    async def _loop(self) -> None:
        backoff = RECONNECT_MIN_S
        while not self._stopping:
            try:
                await self._connect_and_serve()
                backoff = RECONNECT_MIN_S
            except asyncio.CancelledError:
                raise
            except Exception as err:
                self.last_error = str(err)
                log.warning("[%s] connection failed: %s", self.name, err)
            await self._teardown()
            if self._stopping:
                break
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, RECONNECT_MAX_S)

    async def _connect_and_serve(self) -> None:
        cli = APIClient(self.host, self.port, None, noise_psk=self._noise_psk)
        self._disconnected.clear()
        await cli.connect(on_stop=self._on_stop, login=True)
        info = await cli.device_info()
        self.esphome_version = info.esphome_version
        self.model = getattr(info, "model", None)
        self.feature_flags = getattr(info, "voice_assistant_feature_flags", 0)
        if not self.feature_flags & VoiceAssistantFeature.VOICE_ASSISTANT:
            await cli.disconnect()
            raise RuntimeError("device does not expose a voice assistant")
        self.cli = cli
        self.connected = True
        self.last_error = None
        log.info("[%s] connected — ESPHome %s, features=%s",
                 self.name, self.esphome_version, self.feature_flags)
        unsub = cli.subscribe_voice_assistant(
            handle_start=self._handle_start,
            handle_stop=self._handle_stop,
            handle_audio=self._handle_audio,
            handle_announcement_finished=self._handle_announcement_finished,
        )
        try:
            await self._disconnected.wait()
        finally:
            unsub()

    async def _on_stop(self, expected_disconnect: bool) -> None:
        log.info("[%s] disconnected (expected=%s)", self.name, expected_disconnect)
        self._disconnected.set()

    async def _teardown(self) -> None:
        self.connected = False
        if self._run is not None:
            self._run.cancel()
            self._run = None
        if self.cli is not None:
            try:
                await self.cli.disconnect()
            except Exception:
                pass
            self.cli = None

    # --- voice assistant handlers ------------------------------------------

    async def _handle_start(self, conversation_id: str, flags: int,
                            audio_settings: Any,
                            wake_word_phrase: str | None) -> int:
        if self._run is not None:
            self._run.cancel()
        self._run = self._pipeline_factory(self)
        await self._run.start(conversation_id, flags, audio_settings,
                              wake_word_phrase)
        return 0  # stream mic audio over the API connection, not UDP

    async def _handle_audio(self, data: bytes, *_extra: Any) -> None:
        if self._run is not None:
            self._run.feed(data)

    async def _handle_stop(self, abort: bool = False) -> None:
        if self._run is not None:
            self._run.on_device_stop(abort)

    async def _handle_announcement_finished(self, *_args: Any) -> None:
        log.debug("[%s] announcement finished", self.name)

    # --- outgoing ----------------------------------------------------------

    def send_event(self, event_type: Any, data: dict[str, str] | None = None) -> None:
        if self.cli is None:
            log.warning("[%s] dropped event %s: not connected", self.name, event_type)
            return
        self.cli.send_voice_assistant_event(event_type, data or {})

    async def announce(self, media_url: str, *, text: str = "",
                       start_conversation: bool = False,
                       timeout: float = 60.0) -> None:
        if self.cli is None:
            raise RuntimeError(f"device {self.name} is not connected")
        if not self.feature_flags & VoiceAssistantFeature.ANNOUNCE:
            raise RuntimeError(f"device {self.name} does not support announcements")
        await self.cli.send_voice_assistant_announcement_await_response(
            media_id=media_url, timeout=timeout, text=text,
            start_conversation=start_conversation)

    def snapshot(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "host": self.host,
            "connected": self.connected,
            "esphome_version": self.esphome_version,
            "model": self.model,
            "features": self.feature_flags,
            "last_error": self.last_error,
        }
