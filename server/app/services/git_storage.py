"""Git-backed document storage.

Each workspace gets its own Git repository under ``settings.git_repos_path / <workspace_id>``.
Every Markdown document is stored as ``<doc_id>.md`` and every save/delete produces a commit.

This is the substrate for the knowledge-base version history (Plan 2 §Task 2.4.3)
and the memory context surface that Plan 2.5 Hermes spike will ground on.
"""
from __future__ import annotations

import asyncio
import difflib
from pathlib import Path
from typing import Optional

from git import Repo, Actor

from app.config import settings


class GitDocumentStore:
    def __init__(self, repos_path: str | Path | None = None) -> None:
        self.repos_path = Path(repos_path or settings.git_repos_path)
        # Per-workspace serial lock — git index is not safe under concurrent writers.
        self._locks: dict[str, asyncio.Lock] = {}

    def _repo_path(self, workspace_id: str) -> Path:
        return self.repos_path / workspace_id

    def _lock(self, workspace_id: str) -> asyncio.Lock:
        if workspace_id not in self._locks:
            self._locks[workspace_id] = asyncio.Lock()
        return self._locks[workspace_id]

    def _file_relpath(self, doc_id: str) -> str:
        return f"{doc_id}.md"

    def get_or_init_repo(self, workspace_id: str) -> Repo:
        """获取或初始化工作空间的 Git 仓库"""
        repo_path = self._repo_path(workspace_id)
        if not repo_path.exists():
            repo_path.mkdir(parents=True, exist_ok=True)
            repo = Repo.init(repo_path)
            repo.config_writer().set_value("user", "name", "AI-PM").release()
            repo.config_writer().set_value("user", "email", "ai-pm@local").release()
            return repo
        return Repo(repo_path)

    async def save_document(
        self,
        workspace_id: str,
        doc_id: str,
        content: str,
        author_name: str,
        author_email: Optional[str] = None,
        commit_msg: Optional[str] = None,
    ) -> dict:
        """保存文档并提交到 Git。返回本次提交信息。"""
        async with self._lock(workspace_id):
            return await asyncio.to_thread(
                self._save_sync,
                workspace_id, doc_id, content, author_name, author_email, commit_msg,
            )

    def _save_sync(
        self,
        workspace_id: str,
        doc_id: str,
        content: str,
        author_name: str,
        author_email: Optional[str],
        commit_msg: Optional[str],
    ) -> dict:
        repo = self.get_or_init_repo(workspace_id)
        file_path = Path(repo.working_tree_dir) / self._file_relpath(doc_id)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

        repo.index.add([self._file_relpath(doc_id)])
        if not repo.is_dirty(index=True, working_tree=False, untracked_files=False):
            # No changes to commit (e.g. revert to same content) — return current HEAD
            head = repo.head.commit if repo.head.is_valid() else None
            return self._commit_to_dict(head) if head else {}

        actor_email = author_email or f"{author_name}@local"
        msg = commit_msg or f"Update {doc_id}"
        actor = Actor(author_name, actor_email)
        commit = repo.index.commit(msg, author=actor, committer=actor)
        return self._commit_to_dict(commit)

    async def delete_document(
        self,
        workspace_id: str,
        doc_id: str,
        author_name: str,
        author_email: Optional[str] = None,
        commit_msg: Optional[str] = None,
    ) -> None:
        """从 Git 删除文档并提交。"""
        async with self._lock(workspace_id):
            await asyncio.to_thread(
                self._delete_sync,
                workspace_id, doc_id, author_name, author_email, commit_msg,
            )

    def _delete_sync(
        self,
        workspace_id: str,
        doc_id: str,
        author_name: str,
        author_email: Optional[str],
        commit_msg: Optional[str],
    ) -> None:
        repo = self.get_or_init_repo(workspace_id)
        rel = self._file_relpath(doc_id)
        file_path = Path(repo.working_tree_dir) / rel
        if not file_path.exists():
            return
        repo.index.remove([rel])
        actor_email = author_email or f"{author_name}@local"
        msg = commit_msg or f"Delete {doc_id}"
        actor = Actor(author_name, actor_email)
        repo.index.commit(msg, author=actor, committer=actor)

    async def get_version_history(self, workspace_id: str, doc_id: str) -> list[dict]:
        """获取文档的提交历史（最新在前）。"""
        return await asyncio.to_thread(self._history_sync, workspace_id, doc_id)

    def _history_sync(self, workspace_id: str, doc_id: str) -> list[dict]:
        repo_path = self._repo_path(workspace_id)
        if not repo_path.exists():
            return []
        repo = Repo(repo_path)
        rel = self._file_relpath(doc_id)
        commits = list(repo.iter_commits(paths=rel))
        return [self._commit_to_dict(c) for c in commits]

    async def get_version_content(
        self, workspace_id: str, doc_id: str, commit_hash: str
    ) -> Optional[str]:
        """获取特定版本的文档内容。"""
        return await asyncio.to_thread(self._content_sync, workspace_id, doc_id, commit_hash)

    def _content_sync(
        self, workspace_id: str, doc_id: str, commit_hash: str
    ) -> Optional[str]:
        repo_path = self._repo_path(workspace_id)
        if not repo_path.exists():
            return None
        repo = Repo(repo_path)
        rel = self._file_relpath(doc_id)
        try:
            blob = repo.git.show(f"{commit_hash}:{rel}")
        except Exception:
            return None
        return blob

    async def diff_versions(
        self, workspace_id: str, doc_id: str, v1: str, v2: str
    ) -> str:
        """返回两个版本之间的 unified diff 文本（v1 → v2）。"""
        return await asyncio.to_thread(self._diff_sync, workspace_id, doc_id, v1, v2)

    def _diff_sync(self, workspace_id: str, doc_id: str, v1: str, v2: str) -> str:
        c1 = self._content_sync(workspace_id, doc_id, v1) or ""
        c2 = self._content_sync(workspace_id, doc_id, v2) or ""
        diff = difflib.unified_diff(
            c1.splitlines(keepends=True),
            c2.splitlines(keepends=True),
            fromfile=f"{doc_id}.md@{v1[:8]}",
            tofile=f"{doc_id}.md@{v2[:8]}",
            n=3,
        )
        return "".join(diff)

    async def revert_to_version(
        self,
        workspace_id: str,
        doc_id: str,
        commit_hash: str,
        author_name: str,
        author_email: Optional[str] = None,
    ) -> dict:
        """回滚到指定版本（产生新 commit，不重写历史）。"""
        content = await self.get_version_content(workspace_id, doc_id, commit_hash)
        if content is None:
            raise ValueError(f"version {commit_hash} not found for doc {doc_id}")
        return await self.save_document(
            workspace_id, doc_id, content,
            author_name, author_email,
            commit_msg=f"Revert {doc_id} to {commit_hash[:8]}",
        )

    @staticmethod
    def _commit_to_dict(commit) -> dict:
        return {
            "hash": commit.hexsha,
            "short_hash": commit.hexsha[:8],
            "author": commit.author.name,
            "author_email": commit.author.email,
            "committed_at": commit.committed_datetime.isoformat(),
            "message": commit.message.strip(),
        }


git_store = GitDocumentStore()
