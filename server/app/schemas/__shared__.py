"""Shared Pydantic validators for frontend empty-string compat."""

from datetime import date, datetime
from typing import Any

from pydantic import field_validator


def _parse_date(v: Any) -> Any:
    if v is None or v == "":
        return None
    if isinstance(v, str):
        return date.fromisoformat(v.split("T")[0])
    return v


def _parse_datetime(v: Any) -> Any:
    if v is None or v == "":
        return None
    if isinstance(v, str):
        return datetime.fromisoformat(v.split("+")[0].split("Z")[0])
    return v


def _parse_int(v: Any) -> Any:
    if v is None or v == "":
        return None
    if isinstance(v, str):
        return int(v)
    return v


def _parse_float(v: Any) -> Any:
    if v is None or v == "":
        return None
    if isinstance(v, str):
        return float(v)
    return v
