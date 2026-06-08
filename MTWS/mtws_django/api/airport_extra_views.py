"""
机场额外信息API
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from datetime import datetime, timedelta
import logging
import requests
from suntime import Sun

logger = logging.getLogger('mtws.api')


@require_http_methods(["GET"])
def airport_coords(request, time_mode=None):
    """
    按机场代码列表返回经纬度坐标（来自 airport_location 表）。
    参数：codes=ZBAA,ZSSS,ZGGG,...（逗号分隔，必填）
    响应：{ success: true, coords: { "ZBAA": { lat, lon }, ... } }
    """
    try:
        codes_param = request.GET.get('codes', '').strip()
        if not codes_param:
            return JsonResponse({'success': True, 'coords': {}})

        codes = [c.strip().upper() for c in codes_param.split(',') if c.strip()]
        if not codes:
            return JsonResponse({'success': True, 'coords': {}})

        from core.models import AirportLocation
        qs = AirportLocation.objects.filter(
            airport_4code__in=codes
        ).values('airport_4code', 'latitude', 'longitude')

        coords = {
            row['airport_4code']: {
                'lat': float(row['latitude']),
                'lon': float(row['longitude'])
            }
            for row in qs
        }
        return JsonResponse({'success': True, 'coords': coords})
    except Exception as e:
        logger.error(f'获取机场坐标失败: {e}')
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


def _get_coords_from_db(airport_code: str) -> tuple[float, float] | tuple[None, None]:
    """
    优先从 airport_location 数据表获取机场坐标。
    找到返回 (lat, lon)，否则返回 (None, None)。
    """
    try:
        from core.models import AirportLocation
        loc = AirportLocation.objects.filter(airport_4code=airport_code).values('latitude', 'longitude').first()
        if loc:
            logger.info(f"机场{airport_code} 坐标来自数据库: lat={loc['latitude']}, lon={loc['longitude']}")
            return loc['latitude'], loc['longitude']
    except Exception as e:
        logger.warning(f"从数据库获取机场{airport_code}坐标失败: {str(e)}")
    return None, None


def _get_coords_from_api(airport_code: str) -> tuple[float | None, float | None, list]:
    """
    从 aviationweather.gov API 获取机场坐标及跑道信息。
    返回 (lat, lon, runways)；请求失败时抛出 requests.RequestException。
    """
    api_url = f"https://aviationweather.gov/api/data/airport?ids={airport_code}&format=json"
    response = requests.get(api_url, timeout=10)
    response.raise_for_status()
    airport_data = response.json()

    if not airport_data:
        return None, None, []

    airport_info = airport_data[0]
    lat = airport_info.get('lat')
    lon = airport_info.get('lon')
    runways = airport_info.get('runways', [])
    return lat, lon, runways


def _calc_sun_times(lat: float, lon: float, airport_code: str) -> dict:
    """根据坐标计算日出日落时间，返回含四个字段的字典。"""
    try:
        sun = Sun(lat, lon)
        current_datetime = datetime.now()
        sunrise_utc_dt = sun.get_sunrise_time(current_datetime)
        sunset_utc_dt = sun.get_sunset_time(current_datetime)
        sunrise_beijing = sunrise_utc_dt + timedelta(hours=8)
        sunset_beijing = sunset_utc_dt + timedelta(hours=8)
        result = {
            'sunrise':     sunrise_beijing.strftime('%H:%M'),
            'sunset':      sunset_beijing.strftime('%H:%M'),
            'sunrise_utc': sunrise_utc_dt.strftime('%H:%M'),
            'sunset_utc':  sunset_utc_dt.strftime('%H:%M'),
        }
        logger.info(f"机场{airport_code} 日出日落计算成功: 日出{result['sunrise']}, 日落{result['sunset']}")
        return result
    except Exception as e:
        logger.error(f"计算日出日落时间失败 (机场:{airport_code}, 坐标:{lat},{lon}): {str(e)}", exc_info=True)
        return {'sunrise': None, 'sunset': None, 'sunrise_utc': None, 'sunset_utc': None}


@require_http_methods(["GET"])
def airport_extra_info(request, airport_code, time_mode='current'):
    """
    获取机场额外信息API（日出日落时间、跑道信息）。

    坐标获取策略：
      1. 优先查询 airport_location 数据表；
      2. 数据表中无记录时，回退到 aviationweather.gov API。
    跑道信息始终来自 aviationweather.gov API。
    """
    try:
        # ── Step 1: 从数据库获取坐标（优先） ──────────────────────────
        lat, lon = _get_coords_from_db(airport_code)
        coord_source = 'db'

        # ── Step 2: 从外部 API 获取跑道信息，坐标按需补全 ────────────
        runway_ids = []
        try:
            api_lat, api_lon, runways = _get_coords_from_api(airport_code)
            runway_ids = [r.get('id', '') for r in runways if r.get('id')]

            if lat is None or lon is None:
                # 数据库未找到坐标，使用 API 返回值
                lat, lon = api_lat, api_lon
                coord_source = 'api'
                if lat is not None:
                    logger.info(f"机场{airport_code} 坐标回退至外部API: lat={lat}, lon={lon}")
                else:
                    logger.warning(f"机场{airport_code} 外部API亦未返回坐标")

        except requests.RequestException as e:
            logger.error(f"请求aviationweather.gov API失败: {str(e)}")
            if lat is None:
                # 数据库和 API 均无坐标，无法继续
                return JsonResponse({'success': False, 'error': 'API请求失败且数据库中无机场坐标'})

        # ── Step 3: 计算日出日落 ───────────────────────────────────────
        sun_times = {'sunrise': None, 'sunset': None, 'sunrise_utc': None, 'sunset_utc': None}
        if lat is not None and lon is not None:
            sun_times = _calc_sun_times(lat, lon, airport_code)

        return JsonResponse({
            'success': True,
            'data': {
                **sun_times,
                'runways':      runway_ids,
                'coord_source': coord_source,
            }
        })

    except Exception as e:
        logger.error(f"获取机场额外信息失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '获取机场信息失败',
            'message': str(e)
        }, status=500)
