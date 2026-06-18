"""Unit tests for GitDocumentStore.

Tests use the conftest autouse fixture that redirects git_store.repos_path
to a per-test tmp dir, so commits never touch the real repo.
"""
import pytest

from app.services.git_storage import GitDocumentStore


@pytest.fixture
def store(tmp_path):
    return GitDocumentStore(repos_path=str(tmp_path))


@pytest.fixture
def ws_id():
    return "ws-test"


class TestGitDocumentStore:
    async def test_save_and_history(self, store, ws_id):
        c1 = await store.save_document(ws_id, "doc1", "first content", "alice")
        c2 = await store.save_document(ws_id, "doc1", "second content", "alice")
        history = await store.get_version_history(ws_id, "doc1")
        assert len(history) == 2
        # Newest first
        assert history[0]["hash"] == c2["hash"]
        assert history[1]["hash"] == c1["hash"]
        assert history[0]["author"] == "alice"

    async def test_get_version_content(self, store, ws_id):
        c1 = await store.save_document(ws_id, "doc1", "v1 content", "alice")
        c2 = await store.save_document(ws_id, "doc1", "v2 content", "alice")
        assert await store.get_version_content(ws_id, "doc1", c1["hash"]) == "v1 content"
        assert await store.get_version_content(ws_id, "doc1", c2["hash"]) == "v2 content"

    async def test_get_version_content_missing(self, store, ws_id):
        await store.save_document(ws_id, "doc1", "x", "alice")
        assert await store.get_version_content(ws_id, "doc1", "deadbeef") is None

    async def test_diff_versions(self, store, ws_id):
        c1 = await store.save_document(ws_id, "doc1", "line1\nline2\n", "alice")
        c2 = await store.save_document(ws_id, "doc1", "line1\nline2-changed\n", "alice")
        diff = await store.diff_versions(ws_id, "doc1", c1["hash"], c2["hash"])
        assert "-line2" in diff
        assert "+line2-changed" in diff

    async def test_revert_produces_new_commit(self, store, ws_id):
        c1 = await store.save_document(ws_id, "doc1", "original", "alice")
        await store.save_document(ws_id, "doc1", "modified", "alice")
        c3 = await store.revert_to_version(ws_id, "doc1", c1["hash"], "bob")
        # 3 commits total: original + modified + revert
        history = await store.get_version_history(ws_id, "doc1")
        assert len(history) == 3
        assert history[0]["hash"] == c3["hash"]
        assert history[0]["author"] == "bob"
        # Content matches the reverted-to version
        content = await store.get_version_content(ws_id, "doc1", c3["hash"])
        assert content == "original"

    async def test_revert_missing_version_raises(self, store, ws_id):
        await store.save_document(ws_id, "doc1", "x", "alice")
        with pytest.raises(ValueError):
            await store.revert_to_version(ws_id, "doc1", "deadbeef", "alice")

    async def test_delete_document(self, store, ws_id):
        await store.save_document(ws_id, "doc1", "content", "alice")
        await store.delete_document(ws_id, "doc1", "alice")
        # File gone from working tree; history still has both commits
        history = await store.get_version_history(ws_id, "doc1")
        assert len(history) == 2
        assert "Delete" in history[0]["message"]

    async def test_save_same_content_skips_commit(self, store, ws_id):
        c1 = await store.save_document(ws_id, "doc1", "same", "alice")
        c2 = await store.save_document(ws_id, "doc1", "same", "alice")
        # Second save is a no-op: no new commit, returns current HEAD
        assert c2["hash"] == c1["hash"]
        history = await store.get_version_history(ws_id, "doc1")
        assert len(history) == 1

    async def test_separate_workspaces_isolated(self, store, ws_id):
        await store.save_document(ws_id, "doc1", "ws-a content", "alice")
        await store.save_document("ws-other", "doc1", "ws-b content", "bob")
        a_history = await store.get_version_history(ws_id, "doc1")
        b_history = await store.get_version_history("ws-other", "doc1")
        assert len(a_history) == 1
        assert len(b_history) == 1
        assert a_history[0]["author"] == "alice"
        assert b_history[0]["author"] == "bob"

    async def test_empty_history_for_missing_repo(self, store):
        assert await store.get_version_history("never-existed", "doc1") == []

    async def test_concurrent_saves_serialized(self, store, ws_id):
        """Two concurrent saves on the same workspace must not corrupt the git index."""
        import asyncio
        results = await asyncio.gather(
            store.save_document(ws_id, "doc1", "save-1", "alice"),
            store.save_document(ws_id, "doc1", "save-2", "bob"),
        )
        # Both should succeed; final state matches whichever ran last (lock serializes)
        history = await store.get_version_history(ws_id, "doc1")
        assert len(history) == 2
        assert all(r["hash"] for r in results)
