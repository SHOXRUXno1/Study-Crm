"""Pydantic schemas for the Analytics overview endpoint.

A single ``GET /analytics/overview`` call returns everything the Analytics page
needs for a chosen date range — KPI cards, monthly revenue trend, revenue by
course, payment method breakdown, and top groups by attendance.

The shape mirrors :class:`backend/app/schemas/finance.MethodBreakdown` for the
payment-method section, so the frontend can reuse its existing renderer.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.schemas.finance import MethodBreakdown


class AnalyticsKpis(BaseModel):
    students_active: int
    groups_active: int

    revenue_period: int
    revenue_prev_period: int

    debt_total: int
    debtors_count: int

    payments_count: int
    avg_check: int


class RevenuePoint(BaseModel):
    """One month bucket on the revenue-vs-debt area chart."""

    month: str           # ISO "YYYY-MM"
    revenue: int
    debt: int            # placeholder: 0 unless we have a per-month snapshot


class RevenueByCourse(BaseModel):
    course_id: int | None
    course_name: str
    revenue: int


class TopGroupAttendance(BaseModel):
    group_id: int
    code: str
    course_name: str | None
    rate_pct: int
    total_marks: int


class DemographicBreakdown(BaseModel):
    """One slice of a population breakdown (gender, source, etc.)."""

    key: str          # canonical value: "male" / "female" / "instagram" / "telegram" / "recommended" / "unknown"
    count: int


class AnalyticsOverview(BaseModel):
    period_from: date
    period_to: date

    kpis: AnalyticsKpis
    revenue_by_month: list[RevenuePoint]
    revenue_by_course: list[RevenueByCourse]
    payment_methods: list[MethodBreakdown]
    top_groups_attendance: list[TopGroupAttendance]

    # Always over the whole active-student population (independent of filters)
    students_by_gender: list[DemographicBreakdown]
    students_by_source: list[DemographicBreakdown]
