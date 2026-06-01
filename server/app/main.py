from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.exceptions import AppException, app_exception_handler, global_exception_handler
from app.middleware import request_logging_middleware
from app.database import engine, Base
from app.models import *  # noqa: F401,F403 — ensure all models are registered
from app.routers import auth, users, workspaces, tasks, iterations, comments, requirements, documents, workflows, search, dashboard, milestones

app = FastAPI(title="AI-PM API", version="0.0.1")


@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(request_logging_middleware)
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, global_exception_handler)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(workspaces.router)
app.include_router(tasks.router)
app.include_router(iterations.router)
app.include_router(comments.router)
app.include_router(requirements.router)
app.include_router(documents.router)
app.include_router(workflows.router)
app.include_router(search.router)
app.include_router(dashboard.router)
app.include_router(milestones.router)


@app.get("/api/health")
def health():
    return {"code": 0, "message": "ok", "data": {"status": "ok"}}
