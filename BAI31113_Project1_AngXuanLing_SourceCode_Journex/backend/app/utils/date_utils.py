import datetime
from typing import Any, Optional

def parse_date(val: Any) -> Optional[datetime.date]:
    """
    Parses various date string formats or datetime/date objects into a datetime.date object.
    Supports standard ISO (YYYY-MM-DD), slash formats (DD/MM/YYYY, MM/DD/YYYY, YYYY/MM/DD),
    verbal month formats (Sep 29, 2026, 29 Sep 2026, September 29, 2026), and ISO timestamps.
    """
    if not val:
        return None
    if isinstance(val, datetime.datetime):
        return val.date()
    if isinstance(val, datetime.date):
        return val

    s = str(val).strip()
    if not s or s in ("—", "-", "None", "null"):
        return None

    formats = [
        "%Y-%m-%d",          # 2026-09-29
        "%d/%m/%Y",          # 29/09/2026
        "%m/%d/%Y",          # 09/29/2026
        "%b %d, %Y",         # Sep 29, 2026
        "%d %b %Y",          # 29 Sep 2026
        "%B %d, %Y",         # September 29, 2026
        "%d %B %Y",          # 29 September 2026
        "%Y/%m/%d",          # 2026/09/29
        "%d-%m-%Y",          # 29-09-2026
        "%Y-%m-%dT%H:%M:%S", # ISO timestamp
        "%Y-%m-%d %H:%M:%S",
    ]

    for fmt in formats:
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except ValueError:
            pass

    try:
        from dateutil import parser
        return parser.parse(s).date()
    except Exception:
        return None


def is_date_in_range(
    target: Any,
    from_date: Optional[Any] = None,
    to_date: Optional[Any] = None
) -> bool:
    """
    Checks if target date falls inclusively within [from_date, to_date].
    If target is unparseable, returns True only when no date range filters are specified.
    """
    f_d = parse_date(from_date)
    t_d = parse_date(to_date)

    if not f_d and not t_d:
        return True

    t_obj = parse_date(target)
    if not t_obj:
        return False

    if f_d and t_obj < f_d:
        return False
    if t_d and t_obj > t_d:
        return False

    return True
