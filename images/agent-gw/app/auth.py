"""OIDC authentication (Authelia) for agent-gw.

The gateway is an OIDC confidential client (Authorization Code + PKCE).
All four OIDC_* variables must be set to enable SSO; without them the
gateway falls back to the static bearer token (dev / troubleshooting mode).

Sessions are signed cookies (Starlette SessionMiddleware) carrying only the
username — the IdP is consulted at login, never per request.

Rebond rosetta : le login demande aussi `offline_access` ; le refresh token
de CHAQUE utilisateur est rangé côté serveur (~/.agent-gw/oidc-tokens.json,
jamais dans le cookie) et `user_access_token()` fournit un access token frais
— injecté par le gateway dans l'env de chaque session Claude, où
rosetta-bridge le présente aux addons à données utilisateur (/google).
"""

import json
import os
import time
from pathlib import Path

import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

OIDC_ISSUER = os.environ.get("OIDC_ISSUER", "")
OIDC_CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "")
OIDC_CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "")
OIDC_REDIRECT_URI = os.environ.get("OIDC_REDIRECT_URI", "")
# Authelia group required to use the gateway (reusable groups > per-app ones)
OIDC_ALLOWED_GROUP = os.environ.get("OIDC_ALLOWED_GROUP", "admins")

# The four go together: any missing -> local bearer-token mode only.
oidc_enabled = all(
    (OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URI)
)

router = APIRouter()
oauth = OAuth()

if oidc_enabled:
    # Lazy discovery: metadata is fetched (and cached) on first use, so the
    # gateway starts even if Authelia is momentarily down.
    oauth.register(
        name="authelia",
        server_metadata_url=f"{OIDC_ISSUER.rstrip('/')}/.well-known/openid-configuration",
        client_id=OIDC_CLIENT_ID,
        client_secret=OIDC_CLIENT_SECRET,
        client_kwargs={
            # offline_access -> refresh token, la graine du rebond rosetta.
            "scope": "openid profile email groups offline_access",
            "code_challenge_method": "S256",
            # Authelia rejects client_secret_post — be explicit.
            "token_endpoint_auth_method": "client_secret_basic",
        },
    )


# --- Rebond rosetta : refresh tokens par utilisateur, côté serveur ----------

_STATE_DIR = Path(os.environ.get("GW_STATE_DIR", str(Path.home() / ".agent-gw")))
_TOKENS_FILE = _STATE_DIR / "oidc-tokens.json"


def _load_tokens() -> dict:
    try:
        return json.loads(_TOKENS_FILE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_tokens(store: dict) -> None:
    _STATE_DIR.mkdir(parents=True, exist_ok=True)
    _TOKENS_FILE.write_text(json.dumps(store))
    _TOKENS_FILE.chmod(0o600)


def _remember_tokens(username: str, token: dict) -> None:
    """Called at login: seed/refresh the user's server-side token entry."""
    if not token.get("refresh_token"):
        return  # offline_access not granted (client not migrated yet): no rebond
    store = _load_tokens()
    store[username] = {
        "refresh_token": token["refresh_token"],
        "access_token": token.get("access_token", ""),
        "expires_at": time.time() + int(token.get("expires_in", 3600)) - 60,
    }
    _save_tokens(store)


async def user_access_token(username: str) -> str | None:
    """A live access token carrying the user's identity (audience rosetta),
    refreshed silently; None when no session material exists (pre-migration
    login, revoked grant...) — callers simply skip the injection then."""
    store = _load_tokens()
    entry = store.get(username)
    if not entry:
        return None
    if entry.get("access_token") and time.time() < entry.get("expires_at", 0):
        return entry["access_token"]
    refresh = entry.get("refresh_token")
    if not refresh:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{OIDC_ISSUER.rstrip('/')}/api/oidc/token",
                data={"grant_type": "refresh_token", "refresh_token": refresh},
                auth=(OIDC_CLIENT_ID, OIDC_CLIENT_SECRET),
            )
    except httpx.HTTPError:
        return None  # Authelia down: the turn runs without user identity
    if r.status_code != 200:
        # Revoked/expired grant: drop the entry, next login re-seeds it.
        store.pop(username, None)
        _save_tokens(store)
        return None
    data = r.json()
    entry["access_token"] = data["access_token"]
    entry["expires_at"] = time.time() + int(data.get("expires_in", 3600)) - 60
    if data.get("refresh_token"):  # rotation: always keep the latest
        entry["refresh_token"] = data["refresh_token"]
    store[username] = entry
    _save_tokens(store)
    return entry["access_token"]


@router.get("/auth/login")
async def login(request: Request):
    if not oidc_enabled:
        raise HTTPException(status_code=404, detail="SSO not configured")
    return await oauth.authelia.authorize_redirect(request, OIDC_REDIRECT_URI)


@router.get("/auth/callback")
async def callback(request: Request):
    if not oidc_enabled:
        raise HTTPException(status_code=404, detail="SSO not configured")
    try:
        token = await oauth.authelia.authorize_access_token(request)
    except Exception:
        # State mismatch, iss mismatch, invalid_grant… — restart the flow.
        return RedirectResponse("/auth/login")
    userinfo = token.get("userinfo") or await oauth.authelia.userinfo(token=token)
    groups = userinfo.get("groups") or []
    if OIDC_ALLOWED_GROUP and OIDC_ALLOWED_GROUP not in groups:
        raise HTTPException(status_code=403, detail="group not allowed")
    username = userinfo.get("preferred_username", "?")
    _remember_tokens(username, token)
    request.session["user"] = username
    return RedirectResponse("/")


@router.get("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/")


@router.get("/api/auth/config")
async def auth_config():
    return {"oidcEnabled": oidc_enabled}
