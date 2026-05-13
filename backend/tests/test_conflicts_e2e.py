"""End-to-end QA suite for the schedule-conflict feature.

Runs against a live backend (default ``http://127.0.0.1:8000``) using only
``httpx`` (no pytest needed). Idempotent — every run cleans up its own
``QA_*`` fixture groups first, so it can be re-executed safely.

Usage::

    python tests/test_conflicts_e2e.py
    # or with a custom host:
    BASE=http://127.0.0.1:8000 python tests/test_conflicts_e2e.py

Exit code 0 if every scenario from A through Z passed, 1 otherwise.
"""

from __future__ import annotations

import os
import sys
from datetime import date, timedelta
from typing import Any, Optional

import httpx

# On Windows, the default console codepage (cp1251 on this machine) chokes on
# arrows / colour codes. Force UTF-8 so the suite's pretty output works.
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass


BASE = os.environ.get("BASE", "http://127.0.0.1:8000") + "/api/v1"
ADMIN_LOGIN = "admin"
ADMIN_PASSWORD = "admin123"
TEACHER_LOGIN = "teacher01"
TEACHER_PASSWORD = "Teacher@123"

# ── Pretty printer ────────────────────────────────────────────────────────

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
DIM = "\033[2m"
BOLD = "\033[1m"
END = "\033[0m"

results: list[tuple[str, bool, str]] = []


def step(label: str, ok: bool, info: str = "") -> None:
    mark = f"{GREEN}OK{END}" if ok else f"{RED}FAIL{END}"
    extra = f" {DIM}— {info}{END}" if info else ""
    print(f"  [{label}] {mark}{extra}")
    results.append((label, ok, info))


def section(title: str) -> None:
    print(f"\n{BOLD}{title}{END}")


# ── HTTP helpers ──────────────────────────────────────────────────────────


def login(client: httpx.Client, login: str, password: str) -> str:
    r = client.post(
        f"{BASE}/auth/login",
        json={"login": login, "password": password},
    )
    r.raise_for_status()
    return r.json()["access_token"]


def headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ── Fixture / cleanup ─────────────────────────────────────────────────────


def cleanup_qa_groups(client: httpx.Client, h: dict) -> None:
    """Delete every group whose code starts with ``QA_``.

    Used at start and end of the run so the suite is idempotent and never
    leaves residue in the seed dataset.
    """
    r = client.get(f"{BASE}/groups?limit=1000", headers=h)
    r.raise_for_status()
    items = r.json().get("items", [])
    deleted = 0
    for g in items:
        if g.get("code", "").startswith("QA_"):
            d = client.delete(f"{BASE}/groups/{g['id']}", headers=h)
            if d.status_code == 204:
                deleted += 1
    if deleted:
        print(f"  {DIM}cleaned up {deleted} QA_* groups{END}")


def pick_two(items: list[dict]) -> tuple[int, int]:
    if len(items) < 2:
        raise RuntimeError("Need at least 2 reference items in seed data")
    return items[0]["id"], items[1]["id"]


def qa_only(conflicts: list[dict]) -> list[dict]:
    """Filter conflict hits to only those caused by QA_* fixture groups.

    The seed dataset may already use the same teacher/room slots as our
    fixture, but the suite is concerned exclusively with conflicts produced
    by groups it created itself. This keeps assertions seed-independent.
    """
    return [c for c in conflicts if c.get("group_code", "").startswith("QA_")]


# ── Payload builders ──────────────────────────────────────────────────────


def preview_payload(
    *, days: str = "odd",
    start_time: str = "10:00",
    end_time: str = "11:30",
    start_date: str,
    end_date: str,
    teacher_id: Optional[int] = None,
    room_id: Optional[int] = None,
    exclude_group_id: Optional[int] = None,
) -> dict[str, Any]:
    return {
        "days": days,
        "start_time": start_time,
        "end_time": end_time,
        "start_date": start_date,
        "end_date": end_date,
        "teacher_id": teacher_id,
        "room_id": room_id,
        "exclude_group_id": exclude_group_id,
    }


def create_payload(
    *, code: str,
    days: str = "odd",
    start_time: str = "10:00",
    end_time: str = "11:30",
    start_date: str,
    end_date: str,
    teacher_id: Optional[int] = None,
    room_id: Optional[int] = None,
    status: str = "active",
) -> dict[str, Any]:
    return {
        "code": code,
        "course_id": None,
        "teacher_id": teacher_id,
        "room_id": room_id,
        "days": days,
        "start_time": start_time,
        "end_time": end_time,
        "max_students": 15,
        "price": 0,
        "duration_months": 3,
        "start_date": start_date,
        "end_date": end_date,
        "status": status,
    }


# ── Main suite ────────────────────────────────────────────────────────────


def main() -> int:
    today = date.today()
    iso = lambda d: d.isoformat()  # noqa: E731

    # Common date windows used across scenarios.
    win_start = iso(today)
    win_end = iso(today + timedelta(days=90))

    print(f"{BOLD}E2E conflict suite{END} → {DIM}{BASE}{END}")
    with httpx.Client(timeout=30) as client:
        # ── A. Auth ───────────────────────────────────────────────────────
        section("A. Auth")
        try:
            admin_token = login(client, ADMIN_LOGIN, ADMIN_PASSWORD)
            step("A", bool(admin_token), f"len={len(admin_token)}")
        except Exception as e:
            step("A", False, repr(e))
            return finalize()

        h = headers(admin_token)

        # Cleanup any leftover QA_* groups from a previous run.
        cleanup_qa_groups(client, h)

        # Reference data (rooms / teachers) from seed.
        rooms = client.get(f"{BASE}/rooms?limit=1000", headers=h).json()["items"]
        teachers = client.get(f"{BASE}/teachers?limit=1000", headers=h).json()["items"]
        room1_id, room2_id = pick_two(rooms)
        teacher1_id, teacher2_id = pick_two(teachers)

        # Anchor active group: odd days, 10:00-11:30, T1, R1.
        # `force=true` because seed data may already occupy this slot — we
        # want the QA fixture to exist regardless. Subsequent assertions
        # filter conflict lists to QA_* only via `qa_only()`.
        anchor_payload = create_payload(
            code="QA_ANCHOR",
            days="odd",
            start_time="10:00",
            end_time="11:30",
            start_date=win_start,
            end_date=win_end,
            teacher_id=teacher1_id,
            room_id=room1_id,
        )
        r = client.post(
            f"{BASE}/groups",
            params={"force": "true"},
            json=anchor_payload,
            headers=h,
        )
        if r.status_code != 201:
            step("A.anchor", False, f"{r.status_code}: {r.text[:200]}")
            return finalize()
        anchor_id = r.json()["id"]
        step("A.anchor", True, f"id={anchor_id}")

        # ── B. Free slot preview ──────────────────────────────────────────
        # Use far-future dates AND a teacher we know the seed didn't use heavily,
        # so the slot is genuinely free of any conflict (seed or QA).
        section("B-J. Live preview semantics")
        free_start = iso(today + timedelta(days=200))
        free_end = iso(today + timedelta(days=260))
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="odd",
                start_time="22:00",
                end_time="23:00",
                start_date=free_start,
                end_date=free_end,
                teacher_id=teacher2_id,
                room_id=room2_id,
            ),
        )
        all_cs = r.json().get("conflicts", [])
        ok = r.status_code == 200 and all_cs == []
        step("B", ok, f"{r.status_code} conflicts={all_cs}")

        # ── C. Room conflict (anchor only, ignore seed) ──────────────────
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="odd",
                start_time="10:30",
                end_time="12:00",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher2_id,
                room_id=room1_id,
            ),
        )
        cs = qa_only(r.json().get("conflicts", []))
        ok = (
            r.status_code == 200
            and len(cs) == 1
            and cs[0]["kind"] == "room"
            and cs[0]["group_id"] == anchor_id
        )
        step("C", ok, f"{r.status_code} qa_hits={[c['kind'] for c in cs]}")

        # ── D. Teacher conflict ──────────────────────────────────────────
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="odd",
                start_time="11:00",
                end_time="12:30",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher1_id,
                room_id=room2_id,
            ),
        )
        cs = qa_only(r.json().get("conflicts", []))
        ok = (
            r.status_code == 200
            and len(cs) == 1
            and cs[0]["kind"] == "teacher"
            and cs[0]["group_id"] == anchor_id
        )
        step("D", ok, f"{r.status_code} qa_hits={[c['kind'] for c in cs]}")

        # ── E. Both teacher + room on the same peer (anchor) ─────────────
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="odd",
                start_time="10:00",
                end_time="11:00",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher1_id,
                room_id=room1_id,
            ),
        )
        cs = qa_only(r.json().get("conflicts", []))
        kinds = sorted([c["kind"] for c in cs])
        ids = {c["group_id"] for c in cs}
        ok = (
            r.status_code == 200
            and len(cs) == 2
            and kinds == ["room", "teacher"]
            and ids == {anchor_id}
        )
        step("E", ok, f"{r.status_code} kinds={kinds} ids={ids}")

        # ── F. odd vs even (different parity → no overlap) ──────────────
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="even",
                start_time="10:00",
                end_time="11:30",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher1_id,
                room_id=room1_id,
            ),
        )
        cs = qa_only(r.json().get("conflicts", []))
        ok = r.status_code == 200 and cs == []
        step("F", ok, f"{r.status_code} qa_hits={cs}")

        # ── G. Touching boundaries: 11:30/11:30 must NOT collide ────────
        # Anchor is 10:00-11:30. New starts exactly at 11:30 → strict
        # inequality means no overlap. We don't qa_only here because if seed
        # has anything ALSO touching 11:30 that's a different concern; we
        # explicitly check that the anchor isn't reported.
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="odd",
                start_time="11:30",
                end_time="13:00",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher1_id,
                room_id=room1_id,
            ),
        )
        cs = qa_only(r.json().get("conflicts", []))
        ok = r.status_code == 200 and not any(c["group_id"] == anchor_id for c in cs)
        step("G", ok, f"{r.status_code} anchor_in_qa_hits={any(c['group_id'] == anchor_id for c in cs)}")

        # ── H. Partial time overlap on edge ──────────────────────────────
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="odd",
                start_time="11:25",  # overlaps 5 min with anchor 10:00-11:30
                end_time="13:00",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher2_id,
                room_id=room1_id,
            ),
        )
        cs = qa_only(r.json().get("conflicts", []))
        ok = (
            r.status_code == 200
            and len(cs) == 1
            and cs[0]["kind"] == "room"
            and cs[0]["group_id"] == anchor_id
        )
        step("H", ok, f"{r.status_code} qa_hits={[c['kind'] for c in cs]}")

        # ── I. Date range non-overlap (way in the future, free slot) ────
        # Same construction as B: distant dates, late hour, secondary teacher.
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="odd",
                start_time="22:00",
                end_time="23:00",
                start_date=free_start,
                end_date=free_end,
                teacher_id=teacher1_id,  # anchor's teacher, but date doesn't overlap
                room_id=room1_id,
            ),
        )
        cs = qa_only(r.json().get("conflicts", []))
        ok = (
            r.status_code == 200
            and not any(c["group_id"] == anchor_id for c in cs)
        )
        step("I", ok, f"{r.status_code} anchor_in_qa_hits={any(c['group_id'] == anchor_id for c in cs)}")

        # ── J. Date range partial overlap → overlap_start/end correct ────
        # Anchor: today..today+90; new: today+30..today+120.
        partial_start = iso(today + timedelta(days=30))
        partial_end = iso(today + timedelta(days=120))
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="odd",
                start_time="10:30",
                end_time="11:30",
                start_date=partial_start,
                end_date=partial_end,
                teacher_id=teacher2_id,
                room_id=room1_id,
            ),
        )
        cs = qa_only(r.json().get("conflicts", []))
        anchor_hit = next((c for c in cs if c["group_id"] == anchor_id), None)
        if r.status_code == 200 and anchor_hit:
            expected_start = partial_start  # max(today, today+30) = today+30
            expected_end = win_end  # min(today+90, today+120) = today+90
            ok = (
                anchor_hit["overlap_start"] == expected_start
                and anchor_hit["overlap_end"] == expected_end
            )
            step("J", ok, f"overlap=[{anchor_hit['overlap_start']}..{anchor_hit['overlap_end']}] expected=[{expected_start}..{expected_end}]")
        else:
            step("J", False, f"{r.status_code} cs={cs}")

        # ── K. Completed peer doesn't block ──────────────────────────────
        section("K-L. Special cases")
        # Create a completed group occupying a slot.
        past_end = iso(today - timedelta(days=1))
        past_start = iso(today - timedelta(days=60))
        r = client.post(
            f"{BASE}/groups",
            params={"force": "true"},
            headers=h,
            json=create_payload(
                code="QA_COMPLETED",
                days="odd",
                start_time="13:00",
                end_time="14:30",
                start_date=past_start,
                end_date=past_end,
                teacher_id=teacher2_id,
                room_id=room2_id,
            ),
        )
        if r.status_code != 201:
            step("K.setup", False, f"{r.status_code}: {r.text[:200]}")
        # Now check that the QA_COMPLETED peer is NOT seen as a conflict
        # at the same slot in an active future window.
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="odd",
                start_time="13:00",
                end_time="14:30",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher2_id,
                room_id=room2_id,
            ),
        )
        cs = qa_only(r.json().get("conflicts", []))
        ok = r.status_code == 200 and not any(c["group_code"] == "QA_COMPLETED" for c in cs)
        step("K", ok, f"{r.status_code} qa_completed_in_hits={any(c['group_code'] == 'QA_COMPLETED' for c in cs)}")

        # ── L. exclude_group_id self → anchor not reported ──────────────
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            headers=h,
            json=preview_payload(
                days="odd",
                start_time="10:00",
                end_time="11:30",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher1_id,
                room_id=room1_id,
                exclude_group_id=anchor_id,
            ),
        )
        cs = qa_only(r.json().get("conflicts", []))
        ok = r.status_code == 200 and not any(c["group_id"] == anchor_id for c in cs)
        step("L", ok, f"{r.status_code} anchor_in_hits={any(c['group_id'] == anchor_id for c in cs)}")

        # ── M. POST conflict without force → 409 ─────────────────────────
        section("M-P. POST/PATCH enforcement")
        r = client.post(
            f"{BASE}/groups",
            headers=h,
            json=create_payload(
                code="QA_CONFLICT_NOFORCE",
                days="odd",
                start_time="10:30",
                end_time="11:30",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher1_id,
                room_id=room1_id,
            ),
        )
        ok = r.status_code == 409
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        detail = body.get("detail", {})
        ok = (
            ok
            and isinstance(detail, dict)
            and isinstance(detail.get("conflicts"), list)
            and len(detail["conflicts"]) >= 1
        )
        step("M", ok, f"{r.status_code} body={body}")

        # ── N. POST with force=true → 201 ────────────────────────────────
        r = client.post(
            f"{BASE}/groups",
            params={"force": "true"},
            headers=h,
            json=create_payload(
                code="QA_FORCED",
                days="odd",
                start_time="10:30",
                end_time="11:30",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher1_id,
                room_id=room1_id,
            ),
        )
        ok = r.status_code == 201
        forced_id = r.json().get("id") if ok else None
        step("N", ok, f"{r.status_code} id={forced_id}")

        # ── O. PATCH into conflict without force → 409 ──────────────────
        # Create a parking group somewhere, then move it into anchor's slot.
        # `force=true` because this slot may collide with seed groups; we
        # don't care, we just need a fresh row to mutate.
        r = client.post(
            f"{BASE}/groups",
            params={"force": "true"},
            headers=h,
            json=create_payload(
                code="QA_PATCHME",
                days="odd",
                start_time="16:00",
                end_time="17:00",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher2_id,
                room_id=room2_id,
            ),
        )
        if r.status_code != 201:
            step("O.setup", False, f"{r.status_code}: {r.text[:200]}")
            patchme_id = None
        else:
            patchme_id = r.json()["id"]

        if patchme_id:
            r = client.patch(
                f"{BASE}/groups/{patchme_id}",
                headers=h,
                json={
                    "start_time": "10:30",
                    "end_time": "11:30",
                    "teacher_id": teacher1_id,
                    "room_id": room1_id,
                },
            )
            ok = r.status_code == 409
            detail = r.json().get("detail", {})
            ok = ok and isinstance(detail.get("conflicts"), list) and len(detail["conflicts"]) >= 1
            step("O", ok, f"{r.status_code}")

            # ── P. PATCH same body with force=true → 200 ─────────────────
            r = client.patch(
                f"{BASE}/groups/{patchme_id}",
                params={"force": "true"},
                headers=h,
                json={
                    "start_time": "10:30",
                    "end_time": "11:30",
                    "teacher_id": teacher1_id,
                    "room_id": room1_id,
                },
            )
            step("P", r.status_code == 200, f"{r.status_code}")
        else:
            step("O", False, "no patchme_id")
            step("P", False, "no patchme_id")

        # ── Q. PATCH only `code` → no conflict check ────────────────────
        section("Q-R. PATCH merge semantics")
        if patchme_id:
            r = client.patch(
                f"{BASE}/groups/{patchme_id}",
                headers=h,
                json={"code": "QA_PATCHME_RENAMED"},
            )
            step("Q", r.status_code == 200, f"{r.status_code}")
        else:
            step("Q", False, "no patchme_id")

        # ── R. PATCH merge: only room_id changes, other fields kept ─────
        # patchme is currently in anchor's slot (10:30-11:30, odd, T1, R1)
        # after step P. We need to land it in a known-free configuration
        # FIRST, then mutate just one field to verify the merge logic.
        #
        # Step 1: clear the conflict by switching teacher → T2 AND room → R2
        #         in one PATCH. Now patchme is at (10:30-11:30, T2, R2).
        # Step 2: PATCH only `room_id` → R1. Merged = (10:30-11:30, T2, R1).
        #         Anchor is at (T1, R1) in the same slot → ROOM conflict.
        #         Expect 409, proving merge took the kept teacher_id from
        #         current row plus the new room_id from the patch body.
        if patchme_id:
            r = client.patch(
                f"{BASE}/groups/{patchme_id}",
                headers=h,
                json={"teacher_id": teacher2_id, "room_id": room2_id},
            )
            ok_free = r.status_code == 200
            r = client.patch(
                f"{BASE}/groups/{patchme_id}",
                headers=h,
                json={"room_id": room1_id},
            )
            ok_busy = r.status_code == 409
            step("R", ok_free and ok_busy, f"free_status=200_ok={ok_free} busy_status={r.status_code}")
        else:
            step("R", False, "no patchme_id")

        # ── S. POST with no teacher AND no room → 201 ───────────────────
        # Without resources there's nothing to conflict on, so no force needed.
        section("S-T. No-resource and completed-at-create")
        r = client.post(
            f"{BASE}/groups",
            headers=h,
            json=create_payload(
                code="QA_NORES",
                days="odd",
                start_time="10:00",
                end_time="11:30",
                start_date=win_start,
                end_date=win_end,
                teacher_id=None,
                room_id=None,
            ),
        )
        step("S", r.status_code == 201, f"{r.status_code}")

        # ── T. POST with end_date in the past → 201, conflict skipped ───
        # Completed-at-create skips conflict check entirely (status != active).
        # No force needed.
        r = client.post(
            f"{BASE}/groups",
            headers=h,
            json=create_payload(
                code="QA_PASTGROUP",
                days="odd",
                start_time="10:00",
                end_time="11:30",
                start_date=iso(today - timedelta(days=60)),
                end_date=iso(today - timedelta(days=1)),
                teacher_id=teacher1_id,
                room_id=room1_id,
            ),
        )
        step("T", r.status_code == 201, f"{r.status_code}")

        # ── U. Pydantic: start_time >= end_time → 422 ───────────────────
        section("U-V. Pydantic validation")
        r = client.post(
            f"{BASE}/groups",
            headers=h,
            json=create_payload(
                code="QA_BADTIME",
                start_time="11:30",
                end_time="11:30",
                start_date=win_start,
                end_date=win_end,
            ),
        )
        step("U", r.status_code == 422, f"{r.status_code}")

        # ── V. Pydantic: end_date < start_date → 422 ────────────────────
        r = client.post(
            f"{BASE}/groups",
            headers=h,
            json=create_payload(
                code="QA_BADDATE",
                start_time="10:00",
                end_time="11:00",
                start_date=win_end,
                end_date=win_start,
            ),
        )
        step("V", r.status_code == 422, f"{r.status_code}")

        # ── W. /check-conflicts without token → 401 ─────────────────────
        section("W-X. AuthZ")
        r = client.post(
            f"{BASE}/groups/check-conflicts",
            json=preview_payload(
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher1_id,
            ),
        )
        step("W", r.status_code == 401, f"{r.status_code}")

        # ── X. /check-conflicts as teacher → 403 ────────────────────────
        try:
            teacher_token = login(client, TEACHER_LOGIN, TEACHER_PASSWORD)
            r = client.post(
                f"{BASE}/groups/check-conflicts",
                headers=headers(teacher_token),
                json=preview_payload(
                    start_date=win_start,
                    end_date=win_end,
                    teacher_id=teacher1_id,
                ),
            )
            step("X", r.status_code == 403, f"{r.status_code}")
        except Exception as e:
            step("X", False, repr(e))

        # ── Y. 409 response shape ───────────────────────────────────────
        section("Y. 409 response shape")
        r = client.post(
            f"{BASE}/groups",
            headers=h,
            json=create_payload(
                code="QA_SHAPE",
                days="odd",
                start_time="10:30",
                end_time="11:30",
                start_date=win_start,
                end_date=win_end,
                teacher_id=teacher1_id,
                room_id=room1_id,
            ),
        )
        ok = False
        info = f"{r.status_code}"
        if r.status_code == 409:
            d = r.json().get("detail", {})
            if isinstance(d, dict) and isinstance(d.get("message"), str) and isinstance(d.get("conflicts"), list) and d["conflicts"]:
                hit = d["conflicts"][0]
                required = {
                    "kind", "group_id", "group_code", "teacher_name", "room_name",
                    "days", "start_time", "end_time", "start_date", "end_date",
                    "overlap_start", "overlap_end",
                }
                missing = required - set(hit.keys())
                ok = not missing
                info = f"missing={missing}" if missing else f"all 12 fields present"
        step("Y", ok, info)

        # ── Z. Cleanup ──────────────────────────────────────────────────
        section("Z. Cleanup")
        cleanup_qa_groups(client, h)
        step("Z", True, "cleanup complete")

    return finalize()


def finalize() -> int:
    print()
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    failures = [(label, info) for label, ok, info in results if not ok]
    color = GREEN if not failures else RED
    print(f"{color}{BOLD}{passed}/{total} passed{END}")
    if failures:
        print(f"{RED}Failures:{END}")
        for label, info in failures:
            print(f"  - [{label}] {info}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
