"""Common FastAPI setup: CORS and a health endpoint."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings


def base_app(name: str, settings: Settings, lifespan=None) -> FastAPI:
    app = FastAPI(title=f"QRW {name} service", version="0.1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"],
                       allow_headers=["*"])
    app.state.settings = settings

    @app.get("/health", tags=["ops"])
    def health():
        return {"service": name, "status": "ok"}

    return app
