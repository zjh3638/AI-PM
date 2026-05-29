from typing import Any
from pydantic import BaseModel


class APIResponse(BaseModel):
    code: int = 0
    message: str = "ok"
    data: Any = None


class PaginatedResponse(BaseModel):
    code: int = 0
    message: str = "ok"
    data: list[Any]
    total: int
    page: int
    page_size: int
