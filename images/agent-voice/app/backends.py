"""Conversation backends: where a transcribed utterance goes.

- "agent": the agent gateway's MCP endpoint (its `ask_<agent>` tool), in-pod on
  localhost. This is the slow, thinking backend — the caller handles the
  ack/announce dance around it. It answered to "alfred" for one release, while
  the rename settled; that alias is gone.
- "ha": Home Assistant's conversation API — the fast intent backend
  ("allume la lumière"), kept for wake words routed to the house brain.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import aiohttp

from . import __version__

log = logging.getLogger("agent-voice.backends")

MCP_PROTOCOL_VERSION = "2025-06-18"


class BackendError(RuntimeError):
    pass


class Backends:
    def __init__(self) -> None:
        self.gw_mcp_url = os.environ.get("GW_MCP_URL", "http://localhost:8000/mcp")
        self.gw_mcp_token = os.environ.get("GW_MCP_TOKEN", "")
        # Le nom de l'outil MCP suit l'agent servi : la gateway expose
        # `ask_<GW_AGENT>`, pas un nom fixe. AUCUN DÉFAUT — il valait `ask_alfred`,
        # c'est-à-dire le nom d'UN corps dans une image qui en sert plusieurs. Le
        # pod le déclare (`GW_MCP_TOOL`), et un backend `agent` sans lui échoue en
        # le disant, plutôt que d'appeler un outil qui n'existe pas.
        self.gw_mcp_tool = os.environ.get("GW_MCP_TOOL", "")
        self.ha_url = os.environ.get(
            "HA_URL", "http://home-assistant.home.svc.cluster.local:8123")
        self.ha_token = os.environ.get("HA_TOKEN", "")

    async def ask(self, backend: str, text: str, *, language: str,
                  timeout: float) -> str:
        if backend == "agent":
            return await self._ask_agent(text, timeout=timeout)
        if backend == "ha":
            return await self._ask_ha(text, language=language, timeout=timeout)
        raise BackendError(f"unknown backend {backend!r}")

    # --- The agent, through the gateway's MCP endpoint ---------------------

    async def _ask_agent(self, text: str, *, timeout: float) -> str:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.gw_mcp_token:
            headers["Authorization"] = f"Bearer {self.gw_mcp_token}"

        client_timeout = aiohttp.ClientTimeout(total=timeout)
        async with aiohttp.ClientSession(timeout=client_timeout) as session:
            init = {
                "jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {
                    "protocolVersion": MCP_PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": "agent-voice", "version": __version__},
                },
            }
            async with session.post(self.gw_mcp_url, json=init,
                                    headers=headers) as resp:
                if resp.status >= 400:
                    raise BackendError(f"MCP initialize failed: HTTP {resp.status}")
                session_id = resp.headers.get("mcp-session-id")
                await _read_mcp_body(resp)  # drain; result unused
            if session_id:
                headers["Mcp-Session-Id"] = session_id

            initialized = {"jsonrpc": "2.0",
                           "method": "notifications/initialized"}
            async with session.post(self.gw_mcp_url, json=initialized,
                                    headers=headers) as resp:
                await resp.read()

            call = {
                "jsonrpc": "2.0", "id": 2, "method": "tools/call",
                "params": {"name": self.gw_mcp_tool,
                           "arguments": {"request": text, "agent": "voice"}},
            }
            async with session.post(self.gw_mcp_url, json=call,
                                    headers=headers) as resp:
                if resp.status >= 400:
                    raise BackendError(f"MCP tools/call failed: HTTP {resp.status}")
                message = await _read_mcp_body(resp, want_id=2)

        result = message.get("result") or {}
        parts = [c.get("text", "") for c in result.get("content", [])
                 if c.get("type") == "text"]
        answer = "\n".join(p for p in parts if p).strip()
        if result.get("isError"):
            raise BackendError(answer or f"{self.gw_mcp_tool} returned an error")
        if not answer:
            raise BackendError(f"{self.gw_mcp_tool} returned no text")
        return answer

    # --- Home Assistant conversation API -----------------------------------

    async def _ask_ha(self, text: str, *, language: str, timeout: float) -> str:
        if not self.ha_token:
            raise BackendError("HA_TOKEN is not configured")
        headers = {"Authorization": f"Bearer {self.ha_token}"}
        payload = {"text": text, "language": language}
        client_timeout = aiohttp.ClientTimeout(total=timeout)
        async with aiohttp.ClientSession(timeout=client_timeout) as session:
            async with session.post(f"{self.ha_url}/api/conversation/process",
                                    json=payload, headers=headers) as resp:
                if resp.status >= 400:
                    raise BackendError(
                        f"HA conversation failed: HTTP {resp.status}")
                data = await resp.json()
        try:
            speech = data["response"]["speech"]["plain"]["speech"]
        except (KeyError, TypeError) as err:
            raise BackendError(f"unexpected HA response shape: {err}") from err
        return (speech or "").strip() or "C'est fait."


async def _read_mcp_body(resp: aiohttp.ClientResponse,
                         want_id: int | None = None) -> dict[str, Any]:
    """Parse a streamable-HTTP MCP response: plain JSON or an SSE stream."""
    content_type = resp.headers.get("Content-Type", "")
    if "text/event-stream" not in content_type:
        body = await resp.text()
        return json.loads(body) if body.strip() else {}

    message: dict[str, Any] = {}
    async for raw_line in resp.content:
        line = raw_line.decode("utf-8", errors="replace").strip()
        if not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        if not payload:
            continue
        try:
            obj = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if want_id is None or obj.get("id") == want_id:
            message = obj
            if want_id is not None and ("result" in obj or "error" in obj):
                break
    if "error" in message:
        raise BackendError(f"MCP error: {message['error']}")
    return message
