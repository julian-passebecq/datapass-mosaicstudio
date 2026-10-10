"""Identity provider for the optional local Jupyter Server used by the DataPass workbench.

Jupyter Server skips its Origin check for token-authenticated requests (including the kernel
channels websocket, which is not covered by browser CORS). The workbench pairs with an exact
origin, so this subclass keeps the check on: a request that carries an Origin header must come
from the same host or from `ServerApp.allow_origin` exactly. Requests without an Origin header
(scripts, curl) are still governed by the token, as in stock Jupyter Server.

Used only through `--ServerApp.identity_provider_class=jupyter_strict_origin.StrictOriginIdentityProvider`
(see jupyter_local.py). It changes no other authentication behaviour.
"""
from __future__ import annotations

from typing import Any

from jupyter_server.auth.identity import PasswordIdentityProvider


class StrictOriginIdentityProvider(PasswordIdentityProvider):
    """Token/password auth unchanged; the Origin check also applies to token-authenticated requests."""

    def should_check_origin(self, handler: Any) -> bool:  # noqa: ARG002 - signature from jupyter_server
        return True
