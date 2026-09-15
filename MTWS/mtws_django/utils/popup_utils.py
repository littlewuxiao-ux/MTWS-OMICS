"""
弹窗工具类
处理实况弹窗列表与按用户写入的处理留痕
"""

import ipaddress
import json
import logging
from typing import Dict, List, Optional

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from core.models import AirportInfo, AircraftParkingInfo, WeatherTypeInfo, PopupSettings
from parsers.models import Metar, Flight

logger = logging.getLogger('mtws.popup')


def get_client_ip(request) -> str:
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
    else:
        ip = (request.META.get('HTTP_X_REAL_IP') or request.META.get('REMOTE_ADDR') or '').strip()
    return normalize_ip(ip)


def normalize_ip(ip: str) -> str:
    if not ip:
        return ''
    raw = ip.strip()
    if raw.lower() == 'localhost':
        return '127.0.0.1'
    if raw.startswith('['):
        end = raw.find(']')
        if end != -1:
            raw = raw[1:end]
    elif raw.count(':') == 1:
        host, port = raw.rsplit(':', 1)
        if port.isdigit():
            raw = host
    if raw.lower().startswith('::ffff:'):
        raw = raw[7:]
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError:
        return raw


def is_loopback_ip(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_loopback
    except ValueError:
        return ip in ('127.0.0.1', '::1', 'localhost')


def client_can_write_popup_handle(request) -> bool:
    """按用户组 metar_popup 写入权限判断（取代 IP 白名单）。"""
    try:
        from utils.access_control import resolve_access_identity, has_perm
        identity = resolve_access_identity(request)
        return has_perm(identity, 'metar_popup', 'write')
    except Exception:
        ip = get_client_ip(request)
        return is_loopback_ip(ip)


def get_seat_identity(request) -> dict:
    """兼容旧字段，完整身份见 resolve_access_identity。"""
    try:
        from utils.access_control import resolve_access_identity
        identity = resolve_access_identity(request)
        return {
            'role': identity.get('role') or 'guest',
            'show_logout': bool(identity.get('show_logout')),
            'label': identity.get('label') or '',
            'is_local': bool(identity.get('is_local')),
            'group_name': identity.get('group_name'),
            'user_id': identity.get('user_id'),
            'permissions': identity.get('permissions') or {},
            'needs_role_select': bool(identity.get('needs_role_select')),
            'host_login_ok': identity.get('host_login_ok', True),
        }
    except Exception:
        ip = get_client_ip(request)
        if is_loopback_ip(ip):
            return {'role': 'local', 'show_logout': True, 'label': '', 'is_local': True}
        return {'role': 'guest', 'show_logout': False, 'label': '', 'needs_role_select': True}


_ALERT_LETTERS = frozenset({'R', 'Y', 'G', 'N'})
_DEFAULT_WEATHER_TYPE_CN = {
    'R': '近时天气',
}


def weather_type_display_name(code: str, description_cn: Optional[str] = None) -> str:
    """徽章文案用天气类型中文名，不用告警等级字母。"""
    code = str(code or '').strip()
    name = (description_cn or '').strip()
    if name and name not in _ALERT_LETTERS:
        return name
    if code in _DEFAULT_WEATHER_TYPE_CN:
        return _DEFAULT_WEATHER_TYPE_CN[code]
    if code and code not in _ALERT_LETTERS:
        return code
    return '近时天气' if code == 'R' else (code or '天气现象')


def get_popup_trace_hours() -> int:
    """全站弹窗追溯小时数 T，取 popup_settings.trace_time（缺省 6，限制 0–9）。"""
    ps = (
        PopupSettings.objects.exclude(user_code__in=('default', 'test')).order_by('id').last()
        or PopupSettings.objects.filter(user_code='default').first()
        or PopupSettings.objects.order_by('id').first()
    )
    raw = getattr(ps, 'trace_time', None) if ps else None
    try:
        hours = int(raw) if raw is not None else 6
    except (TypeError, ValueError):
        hours = 6
    return max(0, min(9, hours))


class PopupManager:
    """弹窗管理器"""

    def __init__(self, user_code: str, time_mode: str = 'current'):
        self.user_code = user_code
        self.time_mode = time_mode
        self.popup_validity_hours = settings.MTWS_CONFIG['POPUP_CONFIG']['POPUP_VALIDITY_HOURS']

    def get_pending_popups(self) -> List[Dict]:
        """有效期内、运行或停场标记为 Y/I 的弹窗。不按处理记录过滤。"""
        try:
            from utils.time_manager import TimeManager

            popups = Metar.objects.filter(
                Q(operation_popup__in=['Y', 'I']) | Q(parking_popup__in=['Y', 'I'])
            ).order_by('-metar_observation_time')

            current_time_utc = TimeManager.get_current_time_utc(self.time_mode)
            current_time_ms = int(current_time_utc.timestamp() * 1000)
            # 前端按「开启时间 t 往前 T 小时～现在」过滤；后端按最大 T=9 小时供数
            validity_threshold_ms = 9 * 3600000

            weather_type_names = {
                t.weather_type_code: (t.description_cn or t.description_en or '')
                for t in WeatherTypeInfo.objects.all()
            }

            result = []
            for metar in popups:
                if metar.popup_time:
                    time_diff = current_time_ms - metar.popup_time
                    if time_diff > validity_threshold_ms:
                        continue
                airport_info = AirportInfo.objects.filter(airport_4code=metar.airport_4code).first()

                flight = Flight.objects.filter(airport_4code=metar.airport_4code).first()
                en_route = bool(flight.en_route) if flight else False
                closest_departure_time_of_arriving_flight = flight.closest_departure_time_of_arriving_flight if flight else None
                closest_landing_time_of_arriving_flight = flight.closest_landing_time_of_arriving_flight if flight else None
                closest_departure_time_at_this_airport = flight.closest_departure_time_at_this_airport if flight else None

                has_parking = False
                latest_parking = AircraftParkingInfo.objects.order_by('-parse_time').first()
                if latest_parking and latest_parking.airport_4code:
                    parking_list = latest_parking.airport_4code
                    if isinstance(parking_list, str):
                        parking_list = json.loads(parking_list)
                    has_parking = (metar.airport_4code in parking_list)

                metar_weather_type_cn = {}
                if metar.metar_weather_type:
                    try:
                        if isinstance(metar.metar_weather_type, str):
                            metar_weather_type = json.loads(metar.metar_weather_type)
                        else:
                            metar_weather_type = metar.metar_weather_type

                        for weather_code, alert_level in metar_weather_type.items():
                            if isinstance(alert_level, dict):
                                level = alert_level.get('alert_level')
                                given_name = alert_level.get('cn_name')
                            else:
                                level = alert_level
                                given_name = None
                            metar_weather_type_cn[str(weather_code)] = {
                                'alert_level': level,
                                'cn_name': weather_type_display_name(
                                    weather_code,
                                    given_name or weather_type_names.get(str(weather_code)),
                                ),
                            }
                    except Exception:
                        metar_weather_type_cn = {}

                metar_data = []
                if metar.metar_observation_time:
                    history_start_time = metar.metar_observation_time - 72 * 3600000
                    history_metars = Metar.objects.filter(
                        airport_4code=metar.airport_4code,
                        metar_observation_time__gt=history_start_time,
                        metar_observation_time__lte=metar.metar_observation_time
                    ).order_by('metar_observation_time')

                    for hist_metar in history_metars:
                        metar_data.append({
                            'metar_observation_time': hist_metar.metar_observation_time,
                            'metar_wind_speed_val': hist_metar.metar_wind_speed_val,
                            'metar_gust_val': hist_metar.metar_gust_val,
                            'metar_visibility_val': hist_metar.metar_visibility_val,
                            'rvr_min_val': hist_metar.rvr_min_val,
                            'metar_min_cloud_height': hist_metar.metar_min_cloud_height,
                            'metar_temp_val': hist_metar.metar_temp_val,
                            'data_status': hist_metar.data_status or 'H'
                        })

                popup_data = {
                    'sqc': metar.sqc,
                    'airport_4code': metar.airport_4code,
                    'airport_name': airport_info.airport_name if airport_info else '',
                    'metar_type': metar.metar_type or '',
                    'metar_observation_time': metar.metar_observation_time,
                    'metar_content': metar.metar_content or '',
                    'en_route': en_route,
                    'closest_departure_time_of_arriving_flight': closest_departure_time_of_arriving_flight,
                    'closest_landing_time_of_arriving_flight': closest_landing_time_of_arriving_flight,
                    'closest_departure_time_at_this_airport': closest_departure_time_at_this_airport,
                    'has_parking': has_parking,
                    'popup_time': metar.popup_time,
                    'operation_popup': metar.operation_popup or 'N',
                    'parking_popup': metar.parking_popup or 'N',
                    'metar_warning': metar.metar_warning or 'N',
                    'metar_wind_warning': metar.metar_wind_warning or 'N',
                    'metar_visibility_warning': metar.metar_visibility_warning or 'N',
                    'metar_rvr_warning': metar.metar_rvr_warning or 'N',
                    'metar_cloud_warning': metar.metar_cloud_warning or 'N',
                    'metar_temperature_warning': metar.metar_temperature_warning or 'N',
                    'metar_ws_warning': metar.metar_ws_warning or 'N',
                    'metar_change_trend_warning': metar.metar_change_trend_warning or 'N',
                    'metar_weather_type': metar_weather_type_cn,
                    'metar_weather_pre': metar.metar_weather_pre or '',
                    'metar_data': metar_data,
                }
                result.append(popup_data)

            return result

        except Exception as e:
            logger.error(f"获取弹窗列表失败: {e}")
            return []

    @staticmethod
    def write_handle_records(sqc_list: list, user_code: Optional[str], method: str, request) -> Dict:
        """
        有 metar_popup 写入权则记入 popup_handle_records：
        {user_id: {handling_method, popup_handle_time}}。
        同一用户已有记录不覆盖；不同用户可分别写入。
        """
        if not sqc_list:
            return {'written': False, 'updated': 0}

        if not client_can_write_popup_handle(request):
            logger.info(
                f"弹窗处理未写库（无写入权 IP={get_client_ip(request)}）method={method} count={len(sqc_list)}"
            )
            return {'written': False, 'updated': 0}

        uid = ''
        try:
            from utils.access_control import resolve_access_identity
            uid = str((resolve_access_identity(request) or {}).get('user_id') or '').strip()
        except Exception:
            uid = ''
        if not uid:
            uid = str(user_code or '').strip()
        if not uid:
            logger.info(f"弹窗处理未写库（无 user_id）method={method} count={len(sqc_list)}")
            return {'written': False, 'updated': 0}

        current_time_ms = int(timezone.now().timestamp() * 1000)
        updated_count = 0
        for metar in Metar.objects.filter(sqc__in=sqc_list):
            rec = metar.popup_handle_records
            if not isinstance(rec, dict):
                rec = {}
            else:
                rec = dict(rec)
            if uid in rec:
                continue
            rec[uid] = {
                'handling_method': method,
                'popup_handle_time': current_time_ms,
            }
            metar.popup_handle_records = rec
            metar.save(update_fields=['popup_handle_records'])
            updated_count += 1
        logger.info(
            f"弹窗处理写库: method={method} updated={updated_count} User={uid} IP={get_client_ip(request)}"
        )
        return {'written': updated_count > 0, 'updated': updated_count}
