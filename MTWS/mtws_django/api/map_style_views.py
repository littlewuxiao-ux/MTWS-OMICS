"""地图样式 API。"""

from __future__ import annotations

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from utils.map_style_defaults import merge_map_style, BORDER_WIDTH, COLOR_SCHEMES


def _json_body(request):
    import json
    try:
        return json.loads(request.body.decode('utf-8') or '{}')
    except Exception:
        return {}


@require_http_methods(['GET', 'PUT'])
@csrf_exempt
def map_style_config(request, time_mode='current'):
    from core.models import MapStyleConfig

    row = MapStyleConfig.objects.order_by('id').first()
    if request.method == 'GET':
        cfg = merge_map_style(row.config if row else None)
        return JsonResponse({
            'success': True,
            'config': cfg,
            'border_widths': BORDER_WIDTH,
            'color_schemes': [
                {'id': k, 'label': v['scheme_label']} for k, v in COLOR_SCHEMES.items()
            ],
            'palette': COLOR_SCHEMES[cfg['color_scheme']],
        })

    data = _json_body(request)
    cfg_in = data.get('config')
    if not isinstance(cfg_in, dict):
        return JsonResponse({'success': False, 'error': 'config must be object'}, status=400)
    cfg = merge_map_style(cfg_in)
    if row:
        row.config = cfg
        row.save(update_fields=['config', 'updated_at'])
    else:
        MapStyleConfig.objects.create(config=cfg)
    return JsonResponse({
        'success': True,
        'config': cfg,
        'border_widths': BORDER_WIDTH,
        'color_schemes': [
            {'id': k, 'label': v['scheme_label']} for k, v in COLOR_SCHEMES.items()
        ],
        'palette': COLOR_SCHEMES[cfg['color_scheme']],
    })
