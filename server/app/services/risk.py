from typing import Optional
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.risk import Risk
from app.models.milestone import Milestone
from app.models.user import User


async def create_risk(db: AsyncSession, workspace_id: str, **kwargs) -> dict:
    # Convert empty strings to None to avoid FK violations
    for k in ("milestone_id", "owner_id"):
        if kwargs.get(k) == "":
            kwargs[k] = None
    risk = Risk(workspace_id=workspace_id, **kwargs)
    db.add(risk)
    await db.commit()
    await db.refresh(risk)
    loaded = await get_risk(db, risk.id)
    return _risk_to_dict(loaded)


async def get_risk(db: AsyncSession, risk_id: str) -> Optional[Risk]:
    result = await db.execute(
        select(Risk)
        .options(selectinload(Risk.milestone), selectinload(Risk.owner))
        .where(Risk.id == risk_id)
    )
    return result.scalar_one_or_none()


async def list_risks(
    db: AsyncSession,
    workspace_id: str,
    status: Optional[str] = None,
    risk_type: Optional[str] = None,
    milestone_id: Optional[str] = None,
) -> list[dict]:
    query = (
        select(Risk)
        .options(selectinload(Risk.milestone), selectinload(Risk.owner))
        .where(Risk.workspace_id == workspace_id)
    )
    if status:
        query = query.where(Risk.status == status)
    if risk_type:
        query = query.where(Risk.risk_type == risk_type)
    if milestone_id:
        query = query.where(Risk.milestone_id == milestone_id)

    query = query.order_by(Risk.created_at.desc())
    result = await db.execute(query)
    risks = result.scalars().all()

    return [_risk_to_dict(r) for r in risks]


async def update_risk(db: AsyncSession, risk: Risk, **kwargs) -> dict:
    for field, value in kwargs.items():
        if value is not None:
            setattr(risk, field, value)
    await db.commit()
    await db.refresh(risk)
    return _risk_to_dict(await get_risk(db, risk.id))


async def close_risk(db: AsyncSession, risk: Risk) -> dict:
    risk.status = "CLOSED"
    risk.closed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(risk)
    return _risk_to_dict(await get_risk(db, risk.id))


def _risk_to_dict(r: Risk) -> dict:
    return {
        "id": r.id,
        "workspace_id": r.workspace_id,
        "milestone_id": r.milestone_id,
        "milestone_name": r.milestone.name if r.milestone else None,
        "title": r.title,
        "description": r.description,
        "risk_type": r.risk_type,
        "probability": r.probability,
        "impact": r.impact,
        "status": r.status,
        "mitigation": r.mitigation,
        "owner_id": r.owner_id,
        "owner_name": r.owner.display_name if r.owner else None,
        "closed_at": r.closed_at.isoformat() if r.closed_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else "",
        "updated_at": r.updated_at.isoformat() if r.updated_at else "",
    }
