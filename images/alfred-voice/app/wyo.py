"""Thin async clients for the Wyoming STT/TTS services (whisper, nestor-voice).

Wyoming is the small JSONL+PCM protocol used across the Rhasspy/HA voice
ecosystem; both services here are existing cluster deployments. Each call is
one short-lived TCP connection — the services are local and stateless, pooling
would be complexity for nothing.
"""

from __future__ import annotations

import asyncio
import io
import wave
from typing import Any

from wyoming.asr import Transcribe, Transcript
from wyoming.audio import AudioChunk, AudioStart, AudioStop
from wyoming.client import AsyncTcpClient
from wyoming.info import Describe, Info
from wyoming.tts import Synthesize, SynthesizeVoice

_CHUNK = 2048  # samples per AudioChunk when streaming PCM out


async def transcribe(host: str, port: int, pcm: bytes, *, rate: int = 16000,
                     language: str | None = None, timeout: float = 30.0) -> str:
    async def _run() -> str:
        client = AsyncTcpClient(host, port)
        await client.connect()
        try:
            await client.write_event(Transcribe(language=language).event())
            await client.write_event(
                AudioStart(rate=rate, width=2, channels=1).event())
            for i in range(0, len(pcm), _CHUNK * 2):
                await client.write_event(
                    AudioChunk(rate=rate, width=2, channels=1,
                               audio=pcm[i:i + _CHUNK * 2]).event())
            await client.write_event(AudioStop().event())
            while True:
                event = await client.read_event()
                if event is None:
                    raise ConnectionError("STT service closed the connection")
                if Transcript.is_type(event.type):
                    return Transcript.from_event(event).text or ""
        finally:
            await client.disconnect()

    return await asyncio.wait_for(_run(), timeout)


async def synthesize(host: str, port: int, text: str, *, voice: str | None = None,
                     timeout: float = 30.0) -> tuple[int, int, int, bytes]:
    """Returns (rate, width, channels, pcm)."""
    async def _run() -> tuple[int, int, int, bytes]:
        client = AsyncTcpClient(host, port)
        await client.connect()
        try:
            synth_voice = SynthesizeVoice(name=voice) if voice else None
            await client.write_event(Synthesize(text=text, voice=synth_voice).event())
            rate, width, channels = 22050, 2, 1
            pcm = bytearray()
            while True:
                event = await client.read_event()
                if event is None:
                    break
                if AudioStart.is_type(event.type):
                    start = AudioStart.from_event(event)
                    rate, width, channels = start.rate, start.width, start.channels
                elif AudioChunk.is_type(event.type):
                    pcm.extend(AudioChunk.from_event(event).audio)
                elif AudioStop.is_type(event.type):
                    break
            if not pcm:
                raise ConnectionError("TTS service returned no audio")
            return rate, width, channels, bytes(pcm)
        finally:
            await client.disconnect()

    return await asyncio.wait_for(_run(), timeout)


async def describe(host: str, port: int, *, timeout: float = 5.0) -> dict[str, Any]:
    """Service self-description: names, and for TTS the installed voices."""
    async def _run() -> dict[str, Any]:
        client = AsyncTcpClient(host, port)
        await client.connect()
        try:
            await client.write_event(Describe().event())
            while True:
                event = await client.read_event()
                if event is None:
                    raise ConnectionError("service closed before describing itself")
                if Info.is_type(event.type):
                    info = Info.from_event(event)
                    return {
                        "asr": [p.name for p in info.asr],
                        "tts": [
                            {
                                "name": p.name,
                                "voices": [
                                    {"name": v.name,
                                     "languages": list(v.languages or [])}
                                    for v in (p.voices or [])
                                ],
                            }
                            for p in info.tts
                        ],
                    }
        finally:
            await client.disconnect()

    return await asyncio.wait_for(_run(), timeout)


def pcm_to_wav(rate: int, width: int, channels: int, pcm: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(width)
        wav.setframerate(rate)
        wav.writeframes(pcm)
    return buf.getvalue()
