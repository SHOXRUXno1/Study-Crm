"""Group status derivation.

`Group.status` is a function of the group's date window
(`start_date` / `end_date`). Only two statuses exist:

  1. ``today > end_date`` → ``completed``
  2. otherwise            → ``active``

Any group that has not yet ended is considered active, regardless of
whether its start_date is in the future.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

GroupStatusValue = Literal["active", "completed"]


def derived_group_status(
    *,
    start_date: date,
    end_date: date,
    today: date,
) -> GroupStatusValue:
    """Return the status the group *should* have given today's date.

    Pure function; no I/O.
    """
    if today > end_date:
        return "completed"
    return "active"
