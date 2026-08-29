"""
iCal (RFC 5545) 导出服务
"""
from datetime import datetime, timedelta, timezone
from icalendar import Calendar, Event
from ..models.schedule import Schedule


def generate_ical(schedules: list[Schedule]) -> bytes:
    """
    根据已确认的日程列表生成 .ics 文件内容
    """
    cal = Calendar()
    cal.add("prodid", "-//日程管理系统//CN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    cal.add("x-wr-calname", "团队日程（已确认）")
    cal.add("x-wr-timezone", "Asia/Shanghai")

    for s in schedules:
        event = Event()
        event.add("summary", f"{'🔴 ' if s.is_important else ''}{s.title}")
        if s.description:
            event.add("description", s.description)

        # 设置时间
        event.add("dtstart", _to_ical_datetime(s.start_time, s.is_all_day))
        event.add("dtend", _to_ical_datetime(s.end_time, s.is_all_day))
        event.add("dtstamp", datetime.now(timezone.utc))

        # 重要日程设置高优先级
        if s.is_important:
            event.add("priority", 1)

        # 唯一标识符
        event.add("uid", f"schedule-{s.id}@schedule-manager.local")

        # 外部联系人信息写入描述
        if s.external_contact_name or s.external_contact_phone:
            desc_parts = [s.description or ""]
            if s.external_contact_name:
                desc_parts.append(f"\n联系人: {s.external_contact_name}")
            if s.external_contact_phone:
                desc_parts.append(f"电话: {s.external_contact_phone}")
            event.add("description", "\n".join(desc_parts).strip())

        # 添加提醒（提前15分钟）
        from icalendar import Alarm
        alarm = Alarm()
        alarm.add("action", "DISPLAY")
        alarm.add("description", f"提醒: {s.title}")
        alarm.add("trigger", timedelta(minutes=-15))  # 提前15分钟
        event.add_component(alarm)

        cal.add_component(event)

    return cal.to_ical()


def _to_ical_datetime(dt, is_all_day: bool):
    """将 datetime 转为 iCal 格式"""
    if is_all_day:
        return dt.date()
    return dt
