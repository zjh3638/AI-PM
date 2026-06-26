from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.exceptions import AppException, app_exception_handler, global_exception_handler
from app.middleware import request_logging_middleware
from app.routers import auth, users, workspaces, tasks, iterations, comments, requirements, documents, workflows, search, dashboard, milestones, departments, attachments, signals, risks, task_progress, project_groups, ai, ldap, meetings

app = FastAPI(title="AI-PM API", version="0.0.1")

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
app.include_router(departments.router)
app.include_router(attachments.router)
app.include_router(signals.router)
app.include_router(risks.router)
app.include_router(task_progress.router)
app.include_router(project_groups.router)
app.include_router(ai.router)
app.include_router(ldap.router)
app.include_router(meetings.router)

# Serve uploaded files
from pathlib import Path
uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")


@app.get("/api/health")
def health():
    return {"code": 0, "message": "ok", "data": {"status": "ok"}}
