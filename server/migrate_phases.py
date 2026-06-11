"""One-off migration: REQUIREMENTS→PLAN, DESIGN_REVIEW→DESIGN."""
import asyncio
import sys
sys.path.insert(0, ".")

from sqlalchemy import select, update
from app.database import engine, async_session, Base
from app.models.task import Task


async def migrate():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        # 1. REQUIREMENTS → PLAN
        result = await db.execute(
            select(Task).where(Task.phase == "REQUIREMENTS")
        )
        req_tasks = result.scalars().all()
        for t in req_tasks:
            t.phase = "PLAN"
        print(f"Migrated {len(req_tasks)} tasks: REQUIREMENTS → PLAN")

        # 2. DESIGN_REVIEW → DESIGN, preserve review context
        result2 = await db.execute(
            select(Task).where(Task.phase == "DESIGN_REVIEW")
        )
        dr_tasks = result2.scalars().all()
        for t in dr_tasks:
            t.phase = "DESIGN"
            if t.design_review_status is None:
                t.design_review_status = "pending_review"
        print(f"Migrated {len(dr_tasks)} tasks: DESIGN_REVIEW → DESIGN")

        await db.commit()
        print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(migrate())
