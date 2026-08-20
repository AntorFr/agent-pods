"""Entry point: config, device links, control/TTS HTTP server, hot reload.

Environment:
  ESPHOME_NOISE_KEY     shared noise PSK of the ESPHome fleet (required)
  AGENT_VOICE_DEVICE_DOMAIN   DNS suffix appended to bare device names.
                              No default: a private domain baked into a public
                              image is someone else's network. Unset means
                              device names must already be resolvable.
  AGENT_VOICE_CONFIG    config JSON path
                              (default: /home/agent/.agent-voice/config.json)
  AGENT_VOICE_PORT      control/TTS HTTP port (default: 8100)
  AGENT_VOICE_TTS_BASE  public base URL satellites use to fetch TTS WAVs
                              (default: http://<pod-ip>:8100/tts — LAN setups
                              should point this at the ingress /tts route)
  GW_MCP_URL, GW_MCP_TOKEN    agent gateway MCP endpoint (backend "agent")
  HA_URL, HA_TOKEN            Home Assistant API (backend "ha")

This image was named `alfred-voice` until 2026-08-19, and read `ALFRED_VOICE_*`
alongside the new names for one release. Both are gone: the deployment migrated,
and a fallback nobody reads is dead code that outlives the reason it existed.
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

log = logging.getLogger("agent-voice")

CONFIG_WATCH_INTERVAL_S = 2.0


def env(name: str, default: str = "") -> str:
    """Read `AGENT_VOICE_<name>`. The historical `ALFRED_VOICE_*` is gone."""
    return os.environ.get("AGENT_VOICE_" + name) or default


async def run() -> None:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    noise_psk = os.environ.get("ESPHOME_NOISE_KEY", "")
    if not noise_psk:
        raise SystemExit("ESPHOME_NOISE_KEY is required")
    device_domain = env("DEVICE_DOMAIN")
    config_path = env("CONFIG", "/home/agent/.agent-voice/config.json")
    port = int(env("PORT", "8100"))
    tts_base = env(
        "TTS_BASE",
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
                # Un nom court n'est complété que si un suffixe est déclaré :
                # sans lui, f"{name}." donnerait un point orphelin qu'aucun
                # résolveur n'attend. Le nom nu est le bon repli.
                name if "." in name or not device_domain
                else f"{name}.{device_domain}")
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
    log.info("agent-voice up on :%d — tts base %s, config %s",
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
