"""
Rebuild department structure:
  生产运维部 > 四个中心 > 小组

Mapping:
  云服务中心:       中间件维护组、数据库运维团队、运维平台支撑团队、运维平台研发团队
  云基础设施中心:   主机运维团队、基础设施运维团队、托管系统运维团队、测试环境支持团队、网络运维团队
  综合服务中心:     内控合规团队、商务管理团队、综合保障团队
  运维服务中心:     流程管理组、生产调度团队、运行监控团队

Note: Center-level and production运维部-level users are assigned to 生产运维部 directly.
"""

import asyncio
import json
import sys
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session
from app.models.department import Department
from app.models.user import User

CENTER_MAP = {
    "云服务中心": [
        "中间件维护组", "数据库运维团队", "运维平台支撑团队", "运维平台研发团队",
    ],
    "云基础设施中心": [
        "主机运维团队", "基础设施运维团队", "托管系统运维团队",
        "测试环境支持团队", "网络运维团队",
    ],
    "综合服务中心": [
        "内控合规团队", "商务管理团队", "综合保障团队",
    ],
    "运维服务中心": [
        "流程管理组", "生产调度团队", "运行监控团队",
    ],
}

# Groups that should be assigned to 生产运维部 directly (not to a center)
# These are users at the "商行联盟/生产运维部" level or center-level users
PROD_OPS_USERS: list[str] = ["cuihb", "wangzht", "shixw", "gaoxx", "SCCBA_ALARM", "dbcpapi"]


async def create_dept(session: AsyncSession, name: str, parent_id: str | None) -> Department:
    dept = Department(name=name, parent_id=parent_id)
    session.add(dept)
    await session.flush()
    return dept


async def main(data_path: str):
    with open(data_path) as f:
        resp = json.load(f)

    users_data = resp.get("data", [])

    async with async_session() as session:
        # Step 1: Clear all user department_id references
        await session.execute(
            User.__table__.update().values(department_id=None)
        )
        await session.flush()

        # Delete all existing departments
        all_depts_result = await session.execute(select(Department))
        all_depts = all_depts_result.scalars().all()
        for d in all_depts:
            await session.delete(d)
        await session.commit()
        print(f"Cleared {len(all_depts)} existing departments")

        # Step 2: Build new hierarchy
        yun_prod = await create_dept(session, "生产运维部", None)

        center_ids: dict[str, str] = {}
        for center_name in CENTER_MAP:
            center = await create_dept(session, center_name, str(yun_prod.id))
            center_ids[center_name] = str(center.id)

        group_to_id: dict[str, str] = {}
        for center_name, teams in CENTER_MAP.items():
            for team in teams:
                dept = await create_dept(session, team, center_ids[center_name])
                group_to_id[team] = str(dept.id)

        await session.commit()

        print(f"\n--- New Department Tree ---")
        print(f"- 生产运维部 (id={yun_prod.id[:8]})")
        for center_name, teams in sorted(CENTER_MAP.items()):
            cid = center_ids[center_name]
            print(f"  - {center_name} (id={cid[:8]})")
            for team in teams:
                print(f"    - {team} (id={group_to_id[team][:8]})")

        # Step 3: Build lookup maps from original data
        group_path_map: dict[str, str] = {}
        for u in users_data:
            gname = u.get("groupName", "")
            if gname:
                segments = [s.strip() for s in gname.split("/") if s.strip()]
                actual = segments[-1] if segments else ""
                group_path_map[gname] = actual

        user_dept_count = {"assigned": 0, "unmatched": 0}

        for u in users_data:
            username = u.get("loginid", "")
            if not username:
                continue

            gname = u.get("groupName", "")
            segments = [s.strip() for s in gname.split("/") if s.strip()]
            actual_group = segments[-1] if segments else ""

            dept_id = None

            # Check if user should go to 生产运维部 directly
            if username in PROD_OPS_USERS:
                dept_id = str(yun_prod.id)
            elif actual_group in group_to_id:
                dept_id = group_to_id[actual_group]

            if not dept_id:
                user_dept_count["unmatched"] += 1
                continue

            result = await session.execute(
                select(User).where(User.username == username)
            )
            user = result.scalar_one_or_none()
            if not user:
                print(f"  WARNING: user {username} not found in DB, skipping")
                continue

            user.department_id = dept_id
            user.source = "LDAP"
            user.hashed_password = ""
            user.status = "ACTIVE"
            user.display_name = u.get("name", user.display_name)
            user.email = u.get("mail", user.email)
            user_dept_count["assigned"] += 1

        await session.commit()

        print(f"\n=== Done ===")
        print(f"  Assigned:      {user_dept_count['assigned']}")
        print(f"  Unmatched:     {user_dept_count['unmatched']}")

        # Verify: show users per dept
        print(f"\n--- User Distribution ---")
        all_depts2 = await session.execute(select(Department))
        depts = all_depts2.scalars().all()
        for d in sorted(depts, key=lambda x: x.name):
            rc = await session.execute(
                select(func.count()).where(User.department_id == d.id)
            )
            cnt = rc.scalar()
            indent = "  " if d.parent_id else ""
            if cnt:
                print(f"{indent}- {d.name} ({cnt}人)")

        # Total check
        total = await session.execute(
            select(func.count()).where(User.department_id.isnot(None))
        )
        print(f"\nTotal users with department: {total.scalar()}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python rebuild_org.py <json_file>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
