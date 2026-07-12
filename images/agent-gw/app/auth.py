"""OIDC authentication (Authelia) for agent-gw.

The gateway is an OIDC confidential client (Authorization Code + PKCE).
All four OIDC_* variables must be set to enable SSO; without them the
gateway falls back to the static bearer token (dev / troubleshooting mode).

Sessions are signed cookies (Starlette SessionMiddleware) carrying only the
username — the IdP is consulted at login, never per request.
"""

import os

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
            "scope": "openid profile email groups",
            "code_challenge_method": "S256",
            # Authelia rejects client_secret_post — be explicit.
            "token_endpoint_auth_method": "client_secret_basic",
        },
    )


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
    request.session["user"] = userinfo.get("preferred_username", "?")
    return RedirectResponse("/")


@router.get("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/")


@router.get("/api/auth/config")
async def auth_config():
    return {"oidcEnabled": oidc_enabled}
