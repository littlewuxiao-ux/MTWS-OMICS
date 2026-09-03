"""解析/入库告警所覆盖的机场范围：有航班 ∪ 停场名单。"""

from __future__ import annotations

import json
import logging

logger = logging.getLogger('mtws.utils')


def get_parking_airport_codes() -> set:
    from core.models import AircraftParkingInfo

    latest = AircraftParkingInfo.objects.order_by('-parse_time').first()
    if not latest or not latest.airport_4code:
        return set()
    parking_list = latest.airport_4code
    if isinstance(parking_list, str):
        try:
            parking_list = json.loads(parking_list)
        except (TypeError, json.JSONDecodeError):
            logger.warning('停场名单 JSON 解析失败')
            return set()
    if not parking_list:
        return set()
    return {str(code).strip() for code in parking_list if str(code).strip()}


def get_flight_airport_codes() -> set:
    from parsers.models import Flight

    return set(
        Flight.objects.filter(has_flight=True).values_list('airport_4code', flat=True)
    )


def get_monitored_airport_codes() -> list:
    """有航班机场 ∪ 停场名单，去重；有航班顺序在前，停场-only 按代码排序补在后面。"""
    from parsers.models import Flight

    flight_list = list(
        Flight.objects.filter(has_flight=True)
        .values_list('airport_4code', flat=True)
        .distinct()
    )
    extras = sorted(get_parking_airport_codes() - set(flight_list))
    return flight_list + extras


def get_import_alert_keep_airport_codes() -> set:
    """入库告警自动结案时仍保留的机场：有航班或在停场名单中。"""
    return get_flight_airport_codes() | get_parking_airport_codes()
