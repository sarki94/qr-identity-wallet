"""Common FastAPI setup: CORS, security headers, safe error responses and a health endpoint."""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings

log = logging.getLogger("qrw")

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


def base_app(name: str, settings: Settings, lifespan=None) -> FastAPI:
    app = FastAPI(title=f"QRW {name} service", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "PUT", "PATCH"],
                       allow_headers=["Authorization", "Content-Type", "X-Service-Key"])
    app.state.settings = settings

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            if request.url.path.startswith(("/docs", "/redoc")) and k == "Content-Security-Policy":
                continue  # the interactive API docs page needs to load its own scripts
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
