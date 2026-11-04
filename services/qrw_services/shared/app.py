"""Common FastAPI setup: CORS, security headers, safe error responses and a health endpoint."""
import base64
import hashlib
import logging
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response

from .config import Settings

log = logging.getLogger("qrw")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}
DOCS_CDN = "https://cdn.jsdelivr.net"


def docs_csp(html: str) -> str:
    """CSP for the interactive API docs page (found by OWASP ZAP rule 10038).

    Scripts may come only from this origin, the pinned CDN, or the page's own inline
    script, allowed by its SHA-256 hash; no 'unsafe-inline' or 'unsafe-eval' anywhere.
    """
    hashes = " ".join(
        "'sha256-" + base64.b64encode(hashlib.sha256(body.encode()).digest()).decode() + "'"
        for body in re.findall(r"<script>(.*?)</script>", html, re.S))
    return (f"default-src 'none'; script-src 'self' {DOCS_CDN} {hashes}; "
            f"style-src {DOCS_CDN}; img-src 'self' data: {DOCS_CDN} https://fastapi.tiangolo.com; "
            "connect-src 'self'; font-src " + DOCS_CDN + "; worker-src blob:; object-src 'none'; "
            "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")


def base_app(name: str, settings: Settings, lifespan=None) -> FastAPI:
    docs = settings.api_docs
    app = FastAPI(title=f"QRW {name} service", version="0.1.0", lifespan=lifespan,
                  docs_url="/docs" if docs else None, redoc_url="/redoc" if docs else None,
                  openapi_url="/openapi.json" if docs else None)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_methods=["GET", "POST", "PUT", "PATCH"],
                       allow_headers=["Authorization", "Content-Type", "X-Service-Key"])
    app.add_middleware(GZipMiddleware, minimum_size=1024)  # NFR-C3: large revocation lists travel compressed
    app.state.settings = settings

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        if request.url.path in ("/docs", "/redoc") and response.status_code == 200:
            body = b"".join([chunk async for chunk in response.body_iterator])
            headers = {k: v for k, v in response.headers.items() if k.lower() != "content-length"}
            response = Response(content=body, status_code=200, headers=headers, media_type="text/html")
            response.headers["Content-Security-Policy"] = docs_csp(body.decode())
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response

    @app.exception_handler(Exception)
    async def fail_safely(request: Request, exc: Exception):
        # Fail securely: log the detail on the server, never send a stack trace to the client.
        log.exception("unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "internal error"})

    @app.get("/health", tags=["ops"])
    def health():
        return {"service": name, "status": "ok"}

    return app
