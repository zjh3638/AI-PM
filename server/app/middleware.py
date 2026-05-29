import time
import logging
from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


async def request_logging_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    logger.info("%s %s %s %.3fs", request.method, request.url.path, response.status_code, duration)
    return response


async def unified_response_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/docs") or path.startswith("/openapi") or path.startswith("/api/ai/stream"):
        return await call_next(request)

    response = await call_next(request)

    if isinstance(response, JSONResponse) and response.status_code < 400:
        return response

    return response
