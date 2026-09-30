"""z3 初筛 → z5 复筛 → z7 终算管线。"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple

from django.db import transaction
from django.utils import timezone

from .config_defaults import merge_config
from .inversion import count_ge_dbz_in_radius, png_to_dbz, collect_blob_pixels
from .rainviewer import RainViewerClient
from .rate_limiter import get_rate_limiter
from .scoring import bin_pixels_to_rings_and_azimuth, score_rings
from .tiles import build_airport_tile_index, tiles_covering_radius

logger = logging.getLogger('mtws.radar.pipeline')

_job_lock = threading.Lock()
_job_status: Dict[str, Any] = {
    'state': 'idle',  # idle|running|rate_limited|done|error
    'message': '',
    'phase': '',
    'frame_time': None,
    'started_at': None,
    'finished_at': None,
    'airports_total': 0,
    'airports_z5': 0,
    'airports_z7': 0,
    'alerts': {'R': 0, 'Y': 0, 'G': 0},
    'rate_limiter': {},
}


def get_radar_job_status() -> Dict[str, Any]:
    with _job_lock:
        st = dict(_job_status)
    st['rate_limiter'] = get_rate_limiter().status()
    return st


def _set_status(**kwargs) -> None:
    with _job_lock:
        _job_status.update(kwargs)
        if kwargs.get('state') == 'running' and not _job_status.get('started_at'):
            _job_status['started_at'] = timezone.now().isoformat()


def trigger_radar_job(force: bool = False) -> Dict[str, Any]:
    """异步启动一轮计算；若已在跑则返回当前状态。"""
    with _job_lock:
        if _job_status.get('state') == 'running' and not force:
            return dict(_job_status)
        _job_status['state'] = 'running'
        _job_status['message'] = 'queued'
        _job_status['phase'] = 'starting'
        _job_status['started_at'] = timezone.now().isoformat()
        _job_status['finished_at'] = None

    t = threading.Thread(target=_run_job_safe, name='radar-alert-job', daemon=True)
    t.start()
    return get_radar_job_status()


def _run_job_safe() -> None:
    try:
        pipeline = RadarAlertPipeline()
        pipeline.run()
    except Exception as e:
        logger.error('radar job failed: %s', e, exc_info=True)
        _set_status(state='error', message=str(e), finished_at=timezone.now().isoformat())


class RadarAlertPipeline:
    def __init__(self, config: Optional[dict] = None):
        from core.models import RadarAlertConfig

        if config is None:
            row = RadarAlertConfig.objects.order_by('id').first()
            config = merge_config(row.config if row else None)
        else:
            config = merge_config(config)
        self.cfg = config
        self.client = RainViewerClient(rate_limit_per_minute=int(config.get('rate_limit_per_minute', 80)))
        self.tile_cache: Dict[Tuple[int, int, int], bytes] = {}
        self.dbz_cache: Dict[Tuple[int, int, int], Any] = {}

    def run(self) -> dict:
        if not self.cfg.get('enabled', True):
            _set_status(state='done', message='disabled', finished_at=timezone.now().isoformat())
            return {'success': True, 'message': 'disabled'}

        _set_status(state='running', message='loading airports', phase='airports')
        airports = self._load_airports()
        if not airports:
            _set_status(state='done', message='no airports', airports_total=0, finished_at=timezone.now().isoformat())
            return {'success': True, 'message': 'no airports'}

        _set_status(airports_total=len(airports), message=f'{len(airports)} airports')

        # 瓦片索引：启动/变更时缓存，此处确保存在
        index = self._ensure_tile_index(airports)

        _set_status(phase='maps', message='fetching RainViewer maps.json')
        host, path, frame_ts = self.client.latest_frame()
        _set_status(frame_time=frame_ts, message=f'frame {frame_ts}')

        radius = float(self.cfg['radius_km'])
        z3 = int(self.cfg['overview_z'])
        z5 = int(self.cfg['mid_z'])
        z7 = int(self.cfg['final_z'])
        tile_size = int(self.cfg['tile_size'])
        screen_dbz = float(self.cfg['screen_dbz'])
        z3_min = int(self.cfg['z3_min_pixels'])
        z3_skip_dbz = float(self.cfg.get('z3_skip_dbz', 41))
        z3_skip_min = int(self.cfg.get('z3_skip_min_pixels', 3))
        z5_screen_dbz = float(self.cfg.get('z5_screen_dbz', screen_dbz))
        z5_min = int(self.cfg['z5_min_pixels'])
        color = int(self.cfg.get('color_scheme', 2))
        smooth = int(self.cfg.get('smooth', 0))
        snow = int(self.cfg.get('snow', 0))

        # —— z3 全球概览（64 张）——
        _set_status(phase='z3_download', message='downloading z3 overview')
        z3_tiles = {(x, y) for x in range(8) for y in range(8)}
        self.client.download_tiles(
            host, path, z3, z3_tiles,
            tile_size=tile_size, color=color, smooth=smooth, snow=snow, cache=self.tile_cache,
        )
        self._decode_tiles(z3, z3_tiles)

        # —— z3 初筛：过筛进 z5；强回波捷径直进 z7 ——
        _set_status(phase='z3_screen', message='screening with z3')
        pass_z5: List[dict] = []
        pass_z7: List[dict] = []
        skip_codes: Set[str] = set()
        for ap in airports:
            n = self._count_for_airport(ap, z3, radius, screen_dbz, tile_size, index)
            if n < z3_min:
                continue
            n_skip = self._count_for_airport(ap, z3, radius, z3_skip_dbz, tile_size, index)
            if n_skip >= z3_skip_min:
                pass_z7.append(ap)
                skip_codes.add(ap['code'])
            else:
                pass_z5.append(ap)
        _set_status(
            airports_z5=len(pass_z5),
            airports_z7=len(pass_z7),
            message=f'z5 candidates {len(pass_z5)}, z7 fast-track {len(pass_z7)}',
        )

        # —— z5 并集下载 + 复筛 ——
        if pass_z5:
            _set_status(phase='z5_download', message='downloading z5 tiles')
            z5_union = self._union_for_airports(pass_z5, z5, radius, index)
            self.client.download_tiles(
                host, path, z5, z5_union,
                tile_size=tile_size, color=color, smooth=smooth, snow=snow, cache=self.tile_cache,
            )
            self._decode_tiles(z5, z5_union)
            _set_status(phase='z5_screen', message='screening with z5')
            for ap in pass_z5:
                n = self._count_for_airport(ap, z5, radius, z5_screen_dbz, tile_size, index)
                if n >= z5_min:
                    pass_z7.append(ap)
        # 去重保序
        seen = set()
        uniq_z7: List[dict] = []
        for ap in pass_z7:
            if ap['code'] in seen:
                continue
            seen.add(ap['code'])
            uniq_z7.append(ap)
        pass_z7 = uniq_z7
        _set_status(airports_z7=len(pass_z7), message=f'z7 candidates {len(pass_z7)} (fast {len(skip_codes)})')

        # —— z7 终算 ——
        results = []
        if pass_z7:
            _set_status(phase='z7_download', message='downloading z7 tiles')
            z7_union = self._union_for_airports(pass_z7, z7, radius, index)
            self.client.download_tiles(
                host, path, z7, z7_union,
                tile_size=tile_size, color=color, smooth=smooth, snow=snow, cache=self.tile_cache,
            )
            self._decode_tiles(z7, z7_union)
            _set_status(phase='z7_score', message='scoring airports')
            for ap in pass_z7:
                results.append(self._score_airport(ap, z7, radius, tile_size, index, frame_ts))

        # 未进 z7 的机场写 N
        scored_codes = {r['airport_4code'] for r in results}
        for ap in airports:
            if ap['code'] not in scored_codes:
                results.append(self._empty_result(ap['code'], frame_ts))

        self._persist_results(results, frame_ts, host, path)
        counts = {'R': 0, 'Y': 0, 'G': 0}
        for r in results:
            for key in ('alert_33', 'alert_41'):
                c = r.get(key) or 'N'
                if c in counts:
                    counts[c] += 1
        _set_status(
            state='done',
            message='ok',
            phase='done',
            alerts=counts,
            finished_at=timezone.now().isoformat(),
        )
        return {'success': True, 'frame_time': frame_ts, 'results': len(results), 'alerts': counts}

    def _load_airports(self) -> List[dict]:
        from parsers.models import Flight
        from utils.airport_coords import resolve_airport_coords

        codes = list(Flight.objects.filter(has_flight=True).values_list('airport_4code', flat=True))
        if not codes:
            return []
        found, coord_errors = resolve_airport_coords(codes)
        if coord_errors:
            logger.error("雷达机场坐标: " + "；".join(coord_errors))
        return [
            {'code': code, 'lat': lat, 'lon': lon}
            for code, (lat, lon) in found.items()
        ]

    def _ensure_tile_index(self, airports: List[dict]) -> dict:
        from core.models import RadarTileIndex

        cfg = self.cfg
        zooms = [int(cfg['overview_z']), int(cfg['mid_z']), int(cfg['final_z'])]
        radius = float(cfg['radius_km'])
        row = RadarTileIndex.objects.order_by('id').first()
        fingerprint = {
            'radius_km': radius,
            'zooms': zooms,
            'codes': sorted(a['code'] for a in airports),
        }
        if row and row.fingerprint == fingerprint and row.index_data:
            return row.index_data
        index = build_airport_tile_index(airports, radius, zooms)
        if row:
            row.index_data = index
            row.fingerprint = fingerprint
            row.save(update_fields=['index_data', 'fingerprint', 'updated_at'])
        else:
            RadarTileIndex.objects.create(index_data=index, fingerprint=fingerprint)
        return index

    def _union_for_airports(self, airports: List[dict], z: int, radius: float, index: dict) -> Set[Tuple[int, int]]:
        by_ap = index.get('by_airport') or {}
        out: Set[Tuple[int, int]] = set()
        zkey = str(z)
        for ap in airports:
            tiles = (by_ap.get(ap['code']) or {}).get(zkey)
            if tiles:
                for t in tiles:
                    out.add((int(t[0]), int(t[1])))
            else:
                out |= tiles_covering_radius(ap['lat'], ap['lon'], radius, z)
        return out

    def _decode_tiles(self, z: int, tiles) -> None:
        for x, y in tiles:
            key = (int(z), int(x), int(y))
            if key in self.dbz_cache:
                continue
            raw = self.tile_cache.get(key)
            if not raw:
                continue
            try:
                self.dbz_cache[key] = png_to_dbz(raw)
            except Exception as e:
                logger.warning('decode tile %s failed: %s', key, e)

    def _tiles_for_airport(self, ap: dict, z: int, index: dict) -> List[Tuple[int, int]]:
        by_ap = index.get('by_airport') or {}
        tiles = (by_ap.get(ap['code']) or {}).get(str(z)) or []
        return [(int(t[0]), int(t[1])) for t in tiles]

    def _count_for_airport(
        self, ap: dict, z: int, radius: float, threshold: float, tile_size: int, index: dict
    ) -> int:
        total = 0
        for x, y in self._tiles_for_airport(ap, z, index):
            grid = self.dbz_cache.get((z, x, y))
            if grid is None:
                continue
            total += count_ge_dbz_in_radius(
                grid, z, x, y, ap['lat'], ap['lon'], radius, threshold, tile_size
            )
        return total

    def _score_airport(
        self, ap: dict, z: int, radius: float, tile_size: int, index: dict, frame_ts: int
    ) -> dict:
        levels = list(self.cfg.get('z7_levels') or [])
        if len(levels) < 2:
            # 兜底：旧扁平配置
            ths = [float(t) for t in self.cfg.get('dbz_thresholds') or [33, 41]]
            blob = int(self.cfg.get('min_blob_pixels') or 5)
            levels = [
                {
                    'dbz': ths[0],
                    'min_blob_pixels': blob,
                    'count_bins': self.cfg.get('count_bins'),
                    'color_matrix': self.cfg.get('color_matrix'),
                },
                {
                    'dbz': ths[1] if len(ths) > 1 else 41,
                    'min_blob_pixels': blob,
                    'count_bins': self.cfg.get('count_bins'),
                    'color_matrix': self.cfg.get('color_matrix'),
                },
            ]
        rings = self.cfg['rings_km']
        az_bins = int(self.cfg.get('azimuth_bins', 36))

        result = self._empty_result(ap['code'], frame_ts)
        sector_all = {}

        for level in levels[:2]:
            thr = float(level['dbz'])
            min_blob = int(level.get('min_blob_pixels') or 5)
            score_cfg = {
                'rings_km': rings,
                'count_bins': level.get('count_bins') or self.cfg.get('count_bins'),
                'color_matrix': level.get('color_matrix') or self.cfg.get('color_matrix'),
            }
            pixels = []
            for x, y in self._tiles_for_airport(ap, z, index):
                grid = self.dbz_cache.get((z, x, y))
                if grid is None:
                    continue
                pixels.extend(collect_blob_pixels(
                    grid, z, x, y, ap['lat'], ap['lon'], radius, thr, min_blob, tile_size
                ))
            counts, sectors = bin_pixels_to_rings_and_azimuth(pixels, rings, az_bins)
            scored = score_rings(counts, score_cfg)
            thr_i = int(thr)
            result[f'alert_{thr_i}'] = scored['highest']
            result[f'detail_{thr_i}'] = {
                'counts': counts,
                'alerts': scored['alerts'],
                'dbz': thr_i,
                'min_blob_pixels': min_blob,
            }
            sector_all[str(thr_i)] = sectors

        # 兼容模型字段 alert_33 / alert_41：分别对应档A / 档B（阈值可变）
        # 是否告警不在此取较高值：两档都为 R/Y 才告警，仅一档为观察项（见 radar_alerts）
        t0 = int(levels[0]['dbz'])
        t1 = int(levels[1]['dbz'])
        result['alert_33'] = result.get(f'alert_{t0}', 'N') or 'N'
        result['alert_41'] = result.get(f'alert_{t1}', 'N') or 'N'
        result['detail_33'] = result.get(f'detail_{t0}')
        result['detail_41'] = result.get(f'detail_{t1}')

        from .config_defaults import ALERT_RANK
        a33 = result.get('alert_33') or 'N'
        a41 = result.get('alert_41') or 'N'
        result['alert_highest'] = a33 if ALERT_RANK.get(a33, 0) >= ALERT_RANK.get(a41, 0) else a41
        result['sector_stats'] = sector_all
        return result

    def _empty_result(self, code: str, frame_ts: int) -> dict:
        return {
            'airport_4code': code,
            'frame_time': frame_ts,
            'alert_33': 'N',
            'alert_41': 'N',
            'alert_highest': 'N',
            'detail_33': None,
            'detail_41': None,
            'sector_stats': None,
        }

    def _persist_results(self, results: List[dict], frame_ts: int, host: str, path: str) -> None:
        from core.models import AirportRadarAlert, RadarJobRun

        now = timezone.now()
        with transaction.atomic():
            RadarJobRun.objects.create(
                frame_time=frame_ts,
                host=host,
                path=path,
                airport_count=len(results),
                status='done',
                finished_at=now,
            )
            for r in results:
                AirportRadarAlert.objects.update_or_create(
                    airport_4code=r['airport_4code'],
                    defaults={
                        'frame_time': frame_ts,
                        'alert_33': r.get('alert_33') or 'N',
                        'alert_41': r.get('alert_41') or 'N',
                        'alert_highest': r.get('alert_highest') or 'N',
                        'detail_33': r.get('detail_33'),
                        'detail_41': r.get('detail_41'),
                        'sector_stats': r.get('sector_stats'),
                        'updated_at': now,
                    },
                )
