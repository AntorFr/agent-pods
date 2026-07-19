"""One pipeline run: wake word -> audio -> STT -> backend -> spoken answer.

Two delivery modes, chosen per route (see config.py):

- sync:  wait briefly for the backend and speak the answer inside the run —
         the classic assistant feel, for fast backends (HA intents).
- async: speak a short ack inside the run, then deliver the real answer as an
         announcement whenever the backend is done. This is the whole point
         of owning the server: an agent may think for two minutes and no
         pipeline timeout is there to kill it.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from aioesphomeapi.model import VoiceAssistantEventType as Event

from . import wyo
from .backends import Backends
from .config import ConfigStore
from .device import DeviceLink
from .tts_store import TtsStore
from .vad import EnergyEndpointer, Verdict

log = logging.getLogger("alfred-voice.pipeline")

ERROR_MESSAGE = "Désolé, je n'ai pas pu obtenir de réponse."
STT_TIMEOUT_S = 30.0
TTS_TIMEOUT_S = 30.0


class VoiceRun:
    def __init__(self, link: DeviceLink, store: ConfigStore, backends: Backends,
                 tts_store: TtsStore, tts_base_url: str):
        self.link = link
        self.cfg = store.current            # snapshot for this run
        self.route: dict[str, Any] = {}     # resolved at start()
        self.backends = backends
        self.tts_store = tts_store
        self.tts_base_url = tts_base_url.rstrip("/")
        self.sample_rate = 16000
        self.endpointer: EnergyEndpointer | None = None
        self.audio = bytearray()
        self.listening = False
        self.cancelled = False
        self._process_task: asyncio.Task | None = None

    # --- called by DeviceLink ----------------------------------------------

    async def start(self, conversation_id: str, flags: int, audio_settings: Any,
                    wake_word_phrase: str | None) -> None:
        rate = getattr(audio_settings, "sample_rate", 0) or 16000
        self.sample_rate = rate
        self.endpointer = EnergyEndpointer(rate)
        self.route = _route_of(self.cfg, wake_word_phrase)
        self.listening = True
        log.info("[%s] run start: wake_word=%r -> backend=%s mode=%s voice=%s",
                 self.link.name, wake_word_phrase, self.route.get("backend"),
                 self.route.get("mode"), self.route.get("voice"))
        self.link.send_event(Event.VOICE_ASSISTANT_RUN_START)
        self.link.send_event(Event.VOICE_ASSISTANT_STT_START)

    def feed(self, data: bytes) -> None:
        if not self.listening or self.endpointer is None:
            return
        self.audio.extend(data)
        verdict = self.endpointer.feed(data)
        if verdict is Verdict.CONTINUE:
            return
        self.listening = False
        self._process_task = asyncio.create_task(
            self._process(verdict), name=f"run-{self.link.name}")

    def on_device_stop(self, abort: bool) -> None:
        # The device ended the stream itself (mute, button, its own timeout).
        if self.listening:
            self.listening = False
            if not abort and self.audio:
                self._process_task = asyncio.create_task(
                    self._process(Verdict.END), name=f"run-{self.link.name}")

    def cancel(self) -> None:
        self.cancelled = True
        self.listening = False
        if self._process_task is not None:
            self._process_task.cancel()

    # --- the run itself -----------------------------------------------------

    async def _process(self, verdict: Verdict) -> None:
        try:
            await self._process_inner(verdict)
        except asyncio.CancelledError:
            pass
        except Exception:
            log.exception("[%s] pipeline run failed", self.link.name)
            self._end_run_with_error("pipeline-error", ERROR_MESSAGE)

    async def _process_inner(self, verdict: Verdict) -> None:
        if verdict is Verdict.TIMEOUT:
            log.info("[%s] no speech detected — aborting run", self.link.name)
            self._end_run_with_error("stt-no-text-recognized",
                                     "Aucune parole détectée")
            return

        stt = self.cfg["services"]["stt"]
        text = await wyo.transcribe(
            stt["host"], stt["port"], bytes(self.audio),
            rate=self.sample_rate, language=self.cfg.get("language"),
            timeout=STT_TIMEOUT_S)
        text = text.strip()
        self.link.send_event(Event.VOICE_ASSISTANT_STT_END, {"text": text})
        log.info("[%s] heard: %r", self.link.name, text)
        if not text:
            self._end_run_with_error("stt-no-text-recognized",
                                     "Aucune parole détectée")
            return

        self.link.send_event(Event.VOICE_ASSISTANT_INTENT_START)
        backend = self.route.get("backend", "alfred")
        ask = asyncio.create_task(self.backends.ask(
            backend, text, language=self.cfg.get("language", "fr"),
            timeout=float(self.cfg.get("backend_timeout_s", 240))))

        if self.route.get("mode", "async") == "sync":
            try:
                answer = await asyncio.wait_for(
                    asyncio.shield(ask),
                    timeout=float(self.cfg.get("sync_timeout_s", 8)))
                self.link.send_event(Event.VOICE_ASSISTANT_INTENT_END)
                await self._speak_in_run(answer)
                return
            except asyncio.TimeoutError:
                log.info("[%s] backend slower than sync window — "
                         "falling back to ack + announce", self.link.name)

        # Async flow: close the run with the ack, announce the answer later.
        self.link.send_event(Event.VOICE_ASSISTANT_INTENT_END)
        ack = (self.route.get("ack") or "").strip()
        if ack:
            await self._speak_in_run(ack)
        else:
            self.link.send_event(Event.VOICE_ASSISTANT_RUN_END)

        try:
            answer = await ask
        except Exception as err:
            log.error("[%s] backend %s failed: %s", self.link.name, backend, err)
            answer = ERROR_MESSAGE
        if self.cancelled:
            return
        await self._announce(answer)

    # --- speech out ---------------------------------------------------------

    async def _speak_in_run(self, text: str) -> None:
        try:
            url = await self._synth_url(text)
            self.link.send_event(Event.VOICE_ASSISTANT_TTS_START, {"text": text})
            self.link.send_event(Event.VOICE_ASSISTANT_TTS_END, {"url": url})
        except Exception as err:
            log.error("[%s] TTS failed: %s", self.link.name, err)
            self.link.send_event(
                Event.VOICE_ASSISTANT_ERROR,
                {"code": "tts-failed", "message": str(err)})
        finally:
            self.link.send_event(Event.VOICE_ASSISTANT_RUN_END)

    async def _announce(self, text: str) -> None:
        try:
            url = await self._synth_url(text)
            await self.link.announce(url, text=text)
            log.info("[%s] announced answer (%d chars)", self.link.name, len(text))
        except Exception as err:
            log.error("[%s] announce failed: %s", self.link.name, err)

    async def _synth_url(self, text: str) -> str:
        tts = self.cfg["services"]["tts"]
        rate, width, channels, pcm = await wyo.synthesize(
            tts["host"], tts["port"], text,
            voice=self.route.get("voice"), timeout=TTS_TIMEOUT_S)
        token = self.tts_store.put(wyo.pcm_to_wav(rate, width, channels, pcm))
        return f"{self.tts_base_url}/{token}.wav"

    def _end_run_with_error(self, code: str, message: str) -> None:
        self.link.send_event(Event.VOICE_ASSISTANT_ERROR,
                             {"code": code, "message": message})
        self.link.send_event(Event.VOICE_ASSISTANT_RUN_END)


def _route_of(cfg: dict[str, Any], wake_word_phrase: str | None) -> dict[str, Any]:
    from .config import normalize_wake_word
    key = normalize_wake_word(wake_word_phrase)
    routes = cfg.get("routes", {})
    if key and key in routes:
        return {"wake_word": key, **routes[key]}
    default_key = cfg.get("default_route", "")
    return {"wake_word": key or default_key, **routes.get(default_key, {})}
