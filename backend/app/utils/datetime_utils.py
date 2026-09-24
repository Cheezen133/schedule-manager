"""统一处理日程时间：数据库存 UTC，无时区值按约定解释，接口展示北京时间。"""
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo


UTC = timezone.utc
BEIJING = ZoneInfo("Asia/Shanghai")


def to_utc_naive(value: datetime, *, naive_is_beijing: bool = True) -> datetime:
    """转换为写入数据库的 UTC naive datetime。旧客户端无时区输入按北京时间解释。"""
    if value.tzinfo is None:
        value = value.replace(tzinfo=BEIJING if naive_is_beijing else UTC)
    return value.astimezone(UTC).replace(tzinfo=None)


def stored_utc_to_beijing(value: datetime | None) -> datetime | None:
    """数据库 DateTime 无时区值按 UTC 解释，再转换为北京时间。"""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    else:
        value = value.astimezone(UTC)
    return value.astimezone(BEIJING)


def to_beijing_iso(value: datetime | None) -> str | None:
    converted = stored_utc_to_beijing(value)
    return converted.isoformat() if converted else None


def parse_client_datetime(value: str, *, end_of_day: bool = False) -> datetime:
    """解析接口筛选时间；日期和无时区时间均视为北京时间，结果为 UTC naive。"""
    parsed = datetime.fromisoformat(value)
    if len(value.strip()) == 10:
        parsed = datetime.combine(parsed.date(), time.max if end_of_day else time.min)
    return to_utc_naive(parsed, naive_is_beijing=True)
