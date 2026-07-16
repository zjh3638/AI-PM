"""
Import users and departments from external system JSON data.

Usage (inside backend container):
    python /app/import_org.py /app/import_org.json
"""

import asyncio
import json
import sys
from sqlalchemy import select, inspect as sa_inspect
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session
from app.models.department import Department
from app.models.user import User


def parse_group_path(path: str):
    return [s.strip() for s in path.split("/") if s.strip()]


async def get_or_create_dept(
    session: AsyncSession, name: str, parent_id: str | None,
) -> Department:
    result = await session.execute(
        select(Department).where(
            Department.name == name,
            Department.parent_id == parent_id,
        )
    )
    dept = result.scalar_one_or_none()
    if dept:
        return dept

    dept = Department(name=name, parent_id=parent_id)
    session.add(dept)
    await session.flush()
    return dept


async def main(data_path: str):
    with open(data_path) as f:
        resp = json.load(f)

    users_data = resp.get("data", [])
    print(f"Read {len(users_data)} users from {data_path}")

    # Collect unique group paths
    group_paths: set[str] = set()
    for u in users_data:
        if u.get("groupName"):
            group_paths.add(u["groupName"])
    print(f"Found {len(group_paths)} unique department paths")

    async with async_session() as session:
        # Step 1: Build department hierarchy from paths
        dept_by_full_path: dict[str, str] = {}  # full path -> dept id

        # Process all paths: split into prefix -> child segments
        # Build a map of (parent_id) -> list of children
        path_to_segments: dict[str, list[str]] = {}
        for p in group_paths:
            path_to_segments[p] = parse_group_path(p)

        # Sort by depth so parents are created first
        sorted_paths = sorted(group_paths, key=lambda p: len(path_to_segments[p]))

        # parent_id cache: full_path -> id (for children to reference)
        prefix_ids: dict[str, str] = {}  # full_prefix_path -> department id

        for full_path in sorted_paths:
            segments = path_to_segments[full_path]
            parent_id = None
            if len(segments) > 1:
                # Parent's full path is all segments except the last
                parent_path = "/".join(segments[:-1])
                parent_id = prefix_ids.get(parent_path)

            dept = await get_or_create_dept(session, segments[-1], parent_id)
            prefix_ids[full_path] = str(dept.id)
            dept_by_full_path[full_path] = str(dept.id)

        await session.commit()
        print(f"Departments ready: {len(dept_by_full_path)}")

        # Step 2: Import / update users
        imported = 0
        updated = 0
        skipped = 0

        for u in users_data:
            username = u.get("loginid", "")
            if not username:
                skipped += 1
                continue

            result = await session.execute(
                select(User).where(User.username == username)
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.display_name = u.get("name", "")
                existing.email = u.get("mail", "")
                existing.department_id = dept_by_full_path.get(u.get("groupName", ""))
                existing.source = "LDAP"
                existing.hashed_password = ""
                existing.status = "ACTIVE"
                updated += 1
            else:
                new_user = User(
                    username=username,
                    display_name=u.get("name", ""),
                    email=u.get("mail", ""),
                    hashed_password="",
                    source="LDAP",
                    status="ACTIVE",
                    department_id=dept_by_full_path.get(u.get("groupName", "")),
                )
                session.add(new_user)
                imported += 1

        await session.commit()

    print(f"=== Done ===")
    print(f"  Imported:  {imported}")
    print(f"  Updated:   {updated}")
    print(f"  Skipped:   {skipped}")
    print(f"  Departments: {len(dept_by_full_path)}")

    # Print dept tree for verification
    print(f"\n--- Department Tree ---")
    all_paths = list(dept_by_full_path.keys())
    for p in sorted(all_paths):
        depth = len(parse_group_path(p)) - 1
        indent = "  " * depth + ("- " if depth > 0 else "")
        print(f"{indent}{p} (id={dept_by_full_path[p][:8]})")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python import_org.py <json_file>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
