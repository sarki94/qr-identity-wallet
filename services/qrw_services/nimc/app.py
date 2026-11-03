"""Mock NIMC: stands in for the national NIN database (assumption A1 in the SRS).

All records are fictional test data.
"""
import json
import re
from importlib import resources

from fastapi import HTTPException

from ..shared.app import base_app
from ..shared.config import Settings


def create_app(settings: Settings = None):
    settings = settings or Settings()
    app = base_app("mock-nimc", settings)
    records = {r["nin"]: r for r in json.loads(resources.files(__package__).joinpath("records.json").read_text())}

    @app.get("/nin/{nin}", tags=["nimc"])
    def lookup(nin: str):
        if not re.fullmatch(r"\d{11}", nin):
            raise HTTPException(422, "NIN must be 11 digits")
        if nin not in records:
            raise HTTPException(404, "NIN not found")
        return records[nin]

    return app


app = create_app()
