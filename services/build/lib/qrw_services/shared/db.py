"""Database-per-service: each service owns its own database (SQLite in the prototype)."""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


def make_session_factory(url: str, metadata):
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args)
    metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)
