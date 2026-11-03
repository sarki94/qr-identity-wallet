"""Token checks, role-based access and service-to-service keys (FR-27, FR-28, NFR-S7)."""
import hmac
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

ISSUER_CLAIM = "qrw-auth"
_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    username: str
    role: str
    point_id: Optional[str]


def current_principal(request: Request,
                      creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)) -> Principal:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    try:
        claims = jwt.decode(creds.credentials, request.app.state.auth_public_key, algorithms=["EdDSA"],
                            issuer=ISSUER_CLAIM, options={"require": ["exp", "sub", "role"]})
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired token")
    return Principal(claims["sub"], claims["role"], claims.get("pt"))


def require_roles(*roles: str):
    """Dependency factory: allow only the listed roles (least privilege)."""
    def check(principal: Principal = Depends(current_principal)) -> Principal:
        if principal.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "role not permitted")
        return principal
    return check


def require_service_key(request: Request, x_service_key: str = Header(default="")) -> None:
    expected = request.app.state.service_key
    if not x_service_key or not hmac.compare_digest(x_service_key.encode(), expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "service key required")


class RateLimiter:
    """Fixed-window limiter per client address (NFR-S7)."""

    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit, self.window = limit, window_seconds
        self.hits = defaultdict(deque)

    def __call__(self, request: Request) -> None:
        now = time.monotonic()
        key = request.client.host if request.client else "unknown"
        q = self.hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if len(q) >= self.limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many requests, slow down")
        q.append(now)
