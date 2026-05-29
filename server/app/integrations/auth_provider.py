from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


@dataclass
class AuthResult:
    username: str
    display_name: str
    email: Optional[str] = None
    department: Optional[str] = None
    source: str = "LOCAL"


class AuthProvider(ABC):

    @abstractmethod
    async def authenticate(self, credentials: dict) -> Optional[AuthResult]:
        ...

    @abstractmethod
    def provider_name(self) -> str:
        ...


class LocalAuthProvider(AuthProvider):

    def provider_name(self) -> str:
        return "local"

    async def authenticate(self, credentials: dict) -> Optional[AuthResult]:
        return None
