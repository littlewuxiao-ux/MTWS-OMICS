"""实况趋势告警：规则读写与结果表。"""

from __future__ import annotations

import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from utils.access_control import has_perm, is_local_request, resolve_access_identity
from utils.trend_alert import build_results, known_weather_codes, read_config, save_config


def _body(request):
    try:
        return json.loads(request.body.decode('utf-8') or '{}')
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


@require_http_methods(['GET', 'PUT'])
@csrf_exempt
def trend_alert_config(request, time_mode='current'):
    identity = resolve_access_identity(request)
    if request.method == 'GET':
        if not has_perm(identity, 'settings_trend_alert', 'display'):
            return JsonResponse({'success': False, 'error': '无实况趋势告警设置权限'}, status=403)
        return JsonResponse({
            'success': True,
            'config': read_config(),
            'weather_codes': sorted(known_weather_codes()),
        })
    if not has_perm(identity, 'settings_trend_alert', 'write'):
        return JsonResponse({'success': False, 'error': '无该设置项写入权限'}, status=403)
    if not is_local_request(request):
        return JsonResponse({'success': False, 'error': '设置项仅允许本机用户修改'}, status=403)
    data = _body(request)
    payload = data.get('config') if isinstance(data.get('config'), dict) else data
    config, errors = save_config(payload)
    if errors:
        return JsonResponse({'success': False, 'error': '；'.join(errors), 'errors': errors}, status=400)
    return JsonResponse({'success': True, 'config': config})


@require_http_methods(['GET'])
def trend_alert_results(request, time_mode='current'):
    identity = resolve_access_identity(request)
    if not has_perm(identity, 'view_trend', 'display'):
        return JsonResponse({'success': False, 'error': '无实况趋势告警查看权限'}, status=403)
    scope = (request.GET.get('scope') or 'has_flight').strip()
    if scope not in ('has_flight', 'recent2h'):
        return JsonResponse({'success': False, 'error': '机场范围无效'}, status=400)
    result = build_results(scope)
    return JsonResponse({'success': True, **result})
