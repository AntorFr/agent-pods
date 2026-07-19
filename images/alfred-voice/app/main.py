"""Entry point: config, device links, control/TTS HTTP server, hot reload.

Environment:
  ESPHOME_NOISE_KEY     shared noise PSK of the ESPHome fleet (required)
  ALFRED_VOICE_DEVICE_DOMAIN  DNS suffix for bare device names
                              (default: intra.sberard.fr)
  ALFRED_VOICE_CONFIG   config JSON path
                              (default: /home/agent/.agent-voice/config.json)
  ALFRED_VOICE_PORT     control/TTS HTTP port (default: 8100)
  ALFRED_VOICE_TTS_BASE public base URL satellites use to fetch TTS WAVs
                              (default: http://<pod-ip>:8100/tts — LAN setups
                              should point this at the ingress /tts route)
  GW_MCP_URL, GW_MCP_TOKEN    Alfred gateway MCP endpoint (backend "alfred")
  HA_URL, HA_TOKEN            Home Assistant API (backend "ha")
"""

from __future__ import annotations

import asyncio
import logging
import os
import signal
import socket

from aiohttp import web

from .backends import Backends
from .config import ConfigStore
from .device import DeviceLink
from .http_api import AppContext, build_app
from .pipeline import VoiceRun
from .tts_store import TtsStore

log = logging.getLogger("alfred-voice")

CONFIG_WATCH_INTERVAL_S = 2.0


async def run() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    noise_psk = os.environ.get("ESPHOME_NOISE_KEY", "")
    if not noise_psk:
        raise SystemExit("ESPHOME_NOISE_KEY is required")
    device_domain = os.environ.get("ALFRED_VOICE_DEVICE_DOMAIN", "intra.sberard.fr")
    config_path = os.environ.get(
        "ALFRED_VOICE_CONFIG", "/home/agent/.agent-voice/config.json")
    port = int(os.environ.get("ALFRED_VOICE_PORT", "8100"))
    tts_base = os.environ.get(
        "ALFRED_VOICE_TTS_BASE",
        f"http://{socket.gethostbyname(socket.gethostname())}:{port}/tts")

    store = ConfigStore(config_path)
    backends = Backends()
    tts_store = TtsStore()
    links: dict[str, DeviceLink] = {}

    def pipeline_factory(link: DeviceLink) -> VoiceRun:
        return VoiceRun(link, store, backends, tts_store, tts_base)

    def sync_links() -> None:
        desired: dict[str, str] = {}
        for dev in store.current.get("devices", []):
            name = (dev.get("name") or "").strip()
            if not name:
                continue
            host = dev.get("host") or (
                name if "." in name else f"{name}.{device_domain}")
            desired[name] = host
        for name in list(links):
            if name not in desired:
                log.info("removing device %s", name)
                link = links.pop(name)
                asyncio.create_task(link.stop())
        for name, host in desired.items():
            if name not in links:
                log.info("adding device %s (%s)", name, host)
                link = DeviceLink(name, host, 6053, noise_psk, pipeline_factory)
                links[name] = link
                link.start()

    ctx = AppContext(store, links, backends, tts_store, noise_psk,
                     device_domain, tts_base, sync_links)
    runner = web.AppRunner(build_app(ctx))
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    log.info("alfred-voice up on :%d — tts base %s, config %s",
             port, tts_base, config_path)

    sync_links()

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop_event.set)

    async def watch_config() -> None:
        while not stop_event.is_set():
            await asyncio.sleep(CONFIG_WATCH_INTERVAL_S)
            if store.reload():
                sync_links()

    watcher = asyncio.create_task(watch_config())
    await stop_event.wait()
    log.info("shutting down")
    watcher.cancel()
    for link in links.values():
        await link.stop()
    await runner.cleanup()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
