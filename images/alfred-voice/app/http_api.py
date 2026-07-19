"""Control API + TTS file serving (aiohttp, in-pod port).

Two audiences:
- the gateway's settings UI (status, reload, device test, voice preview),
  proxied by agent-gw so the PWA never talks to this port directly;
- the satellites themselves, which fetch synthesized WAVs from /tts/<token>.wav
  (unguessable single-purpose URLs with a short TTL — this path is the only
  one that must be reachable from the LAN).
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Callable

from aiohttp import web
from aioesphomeapi import APIClient

from . import __version__, wyo

log = logging.getLogger("alfred-voice.http")

DESCRIBE_TIMEOUT_S = 4.0


def build_app(ctx: "AppContext") -> web.Application:
    app = web.Application()
    app["ctx"] = ctx
    app.add_routes([
        web.get("/health", handle_health),
        web.get("/status", handle_status),
        web.post("/reload", handle_reload),
        web.post("/devices/test", handle_device_test),
        web.post("/say", handle_say),
        web.get("/tts/{token}", handle_tts),
    ])
    return app


class AppContext:
    def __init__(self, store: Any, links: dict[str, Any], backends: Any,
                 tts_store: Any, noise_psk: str, device_domain: str,
                 tts_base_url: str, sync_links: Callable[[], None]):
        self.store = store
        self.links = links
        self.backends = backends
        self.tts_store = tts_store
        self.noise_psk = noise_psk
        self.device_domain = device_domain
        self.tts_base_url = tts_base_url.rstrip("/")
        self.sync_links = sync_links


async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({"ok": True, "version": __version__})


async def handle_status(request: web.Request) -> web.Response:
    ctx: AppContext = request.app["ctx"]
    cfg = ctx.store.current
    services: dict[str, Any] = {}
    for name in ("stt", "tts"):
        svc = cfg["services"][name]
        try:
            info = await wyo.describe(svc["host"], svc["port"],
                                      timeout=DESCRIBE_TIMEOUT_S)
            services[name] = {"ok": True, **svc, **info}
        except Exception as err:
            services[name] = {"ok": False, **svc, "error": str(err)}
    return web.json_response({
        "version": __version__,
        "devices": [link.snapshot() for link in ctx.links.values()],
        "services": services,
        "config": cfg,
    })


async def handle_reload(request: web.Request) -> web.Response:
    ctx: AppContext = request.app["ctx"]
    changed = ctx.store.reload()
    if changed:
        ctx.sync_links()
    return web.json_response({"reloaded": changed})


async def handle_device_test(request: web.Request) -> web.Response:
    """Probe a device before adding it: reachable? voice-capable?"""
    ctx: AppContext = request.app["ctx"]
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        return web.json_response({"ok": False, "error": "name required"},
                                 status=400)
    host = body.get("host") or _host_of(name, ctx.device_domain)
    cli = APIClient(host, int(body.get("port", 6053)), None,
                    noise_psk=ctx.noise_psk)
    try:
        await asyncio.wait_for(cli.connect(login=True), timeout=8)
        info = await cli.device_info()
        flags = getattr(info, "voice_assistant_feature_flags", 0)
        return web.json_response({
            "ok": True,
            "host": host,
            "esphome_version": info.esphome_version,
            "model": getattr(info, "model", None),
            "voice_assistant": bool(flags),
            "features": flags,
            "note": ("" if flags else
                     "device has no voice_assistant component"),
        })
    except Exception as err:
        return web.json_response({"ok": False, "host": host, "error": str(err)})
    finally:
        try:
            await cli.disconnect()
        except Exception:
            pass


async def handle_say(request: web.Request) -> web.Response:
    """Voice preview: synthesize text and play it on a connected satellite."""
    ctx: AppContext = request.app["ctx"]
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        return web.json_response({"ok": False, "error": "text required"},
                                 status=400)
    link = _pick_link(ctx, body.get("device"))
    if link is None:
        return web.json_response(
            {"ok": False, "error": "no connected device"}, status=409)
    cfg = ctx.store.current
    tts = cfg["services"]["tts"]
    try:
        rate, width, channels, pcm = await wyo.synthesize(
            tts["host"], tts["port"], text, voice=body.get("voice"))
        token = ctx.tts_store.put(wyo.pcm_to_wav(rate, width, channels, pcm))
        await link.announce(f"{ctx.tts_base_url}/{token}.wav", text=text)
        return web.json_response({"ok": True, "device": link.name})
    except Exception as err:
        return web.json_response({"ok": False, "error": str(err)})


async def handle_tts(request: web.Request) -> web.Response:
    ctx: AppContext = request.app["ctx"]
    token = request.match_info["token"].removesuffix(".wav")
    wav = ctx.tts_store.get(token)
    if wav is None:
        raise web.HTTPNotFound()
    return web.Response(body=wav, content_type="audio/wav")


def _host_of(name: str, domain: str) -> str:
    return name if "." in name else f"{name}.{domain}"


def _pick_link(ctx: AppContext, device: str | None) -> Any | None:
    if device:
        link = ctx.links.get(device)
        return link if link is not None and link.connected else None
    for link in ctx.links.values():
        if link.connected:
            return link
    return None
