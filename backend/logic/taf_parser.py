# backend/logic/taf_parser.py (已更新)

from avwx import Taf
from datetime import timedelta, date
import calendar
import re
from typing import Dict, List, Optional, Any
import copy

def _convert_speed_to_mps(speed: Optional[str], unit: str) -> Optional[int]:
    try:
        if not speed: return None
        speed_val = int(speed)
        return round(speed_val * 0.51444) if unit == "KT" else speed_val
    except (ValueError, TypeError):
        return None

def _convert_visibility_to_meters(vis: Optional[str], unit: str) -> Optional[int]:
    try:
        if not vis: return None
        if vis == "CAVOK": return 9999
        if ">" in vis: vis = vis.replace(">", "")
        if "SM" in unit:
            if "/" in vis:
                parts = vis.split('/')
                return int(float(parts[0]) / float(parts[1]) * 1609.34)
            return int(float(vis) * 1609.34)
        return int(vis)
    except (ValueError, TypeError):
        return None

def _get_lowest_cloud(clouds: List[Any]) -> Dict[str, Any]:
    if not clouds: return {}
    significant_layers = []
    for cloud in clouds:
        if cloud.type in ["BKN", "OVC", "SCT", "VV"]:
            height_ft = cloud.base * 100 if cloud.base else 0
            amount = "BKN/OVC" if cloud.type in ["BKN", "OVC", "VV"] else "FEW/SCT"
            significant_layers.append({'height': height_ft, 'amount': amount, "raw_amount": cloud.type})
    if significant_layers:
        lowest = min(significant_layers, key=lambda x: x['height'])
        return {'height': round(lowest['height'] * 0.3048), 'amount': lowest['amount'], 'raw_amount': lowest['raw_amount']}
    return {}

def _convert_avwx_group_to_dict(group: Any, units: Any) -> Dict[str, Any]:
    data = {}
    wind_speed = _convert_speed_to_mps(group.wind_speed.repr if group.wind_speed else None, units.wind_speed)
    gust_speed = _convert_speed_to_mps(group.wind_gust.repr if group.wind_gust else None, units.wind_speed)
    if wind_speed is not None or gust_speed is not None:
        data['wind_speed'] = max(wind_speed or 0, gust_speed or 0)

    visibility = _convert_visibility_to_meters(group.visibility.repr if group.visibility else None, units.visibility)
    if visibility is not None: data['visibility'] = visibility

    if group.wx_codes: data['weather'] = " ".join([wx.repr for wx in group.wx_codes])
    elif hasattr(group, 'weather') and group.weather == 'NSW': data['weather'] = 'NSW'
    
    if hasattr(group, 'clouds') and not group.clouds: data['cloud'] = {}
    elif group.clouds: data['cloud'] = _get_lowest_cloud(group.clouds)
    return data

def parse_tafs(taf_text: str, issued_date=None) -> List[Dict]:
    parsed_tafs = []
    individual_tafs = re.split(r'(?=TAF(?:\s|AMD|COR))', taf_text)
    
    for report in individual_tafs:
        report = report.strip()
        if not report or not report.startswith("TAF"): continue

        try:
            validity_match = re.search(r'\s(\d{2}\d{2}/\d{2}\d{2})\s', report)
            validity_str_raw = validity_match.group(1).replace('/', '-') if validity_match else None

            # ========================================================
            # 🌟 核心升级：落实你的思路！剥离系统“日”，完全听从报文“日”
            # ========================================================
            specific_issued_date = issued_date
            if issued_date:
                # 从报文头部提取发布时间，例如 172106Z 提取出 17
                issue_match = re.search(r'\b(\d{2})\d{4}Z\b', report)
                if issue_match:
                    rep_day = int(issue_match.group(1))
                    base_y = issued_date.year
                    base_m = issued_date.month
                    base_d = issued_date.day

                    # 跨月/跨年精准判断 (差值大于 15 天才算跨月)
                    if rep_day > base_d + 15:
                        base_m -= 1
                        if base_m == 0:
                            base_m = 12; base_y -= 1
                    elif rep_day < base_d - 15:
                        base_m += 1
                        if base_m == 13:
                            base_m = 1; base_y += 1

                    # 防止如“2月30日”这种极端溢出错误
                    max_days = calendar.monthrange(base_y, base_m)[1]
                    safe_day = min(rep_day, max_days)
                    
                    # 组合成该报文专属的完美日期！
                    specific_issued_date = date(base_y, base_m, safe_day)

            # 把专属日期喂给 avwx，它绝对不会再报错
            taf = Taf.from_report(report, issued=specific_issued_date)
            # ========================================================

            if not taf or not taf.data or not taf.units: continue
            
            data, units = taf.data, taf.units
            start_dt, end_dt = data.start_time.dt, data.end_time.dt

            hourly_forecasts = {}
            main_forecast_dict = _convert_avwx_group_to_dict(data.forecast[0], units)
            
            temp_dt = start_dt
            while temp_dt < end_dt:
                hour_key = f"{temp_dt.day:02d}{temp_dt.hour:02d}"
                hourly_forecasts[hour_key] = {'rule': 'NORMAL', 'base': copy.deepcopy(main_forecast_dict), 'change': {}}
                temp_dt += timedelta(hours=1)
            
            if len(data.forecast) > 1:
                for group in data.forecast[1:]:
                    if not group.start_time: continue
                    
                    change_start = group.start_time.dt
                    change_end = group.end_time.dt if group.end_time else change_start + timedelta(hours=1)
                    change_dict = _convert_avwx_group_to_dict(group, units)
                    
                    if group.type == "FROM":
                        temp_dt = change_start
                        while temp_dt < end_dt:
                            hour_key = f"{temp_dt.day:02d}{temp_dt.hour:02d}"
                            if hour_key in hourly_forecasts:
                                hourly_forecasts[hour_key]['base'] = copy.deepcopy(change_dict)
                                hourly_forecasts[hour_key]['rule'] = 'NORMAL'
                                hourly_forecasts[hour_key]['change'] = {}
                            temp_dt += timedelta(hours=1)
                    
                    elif group.type in ["TEMPO", "BECMG"]:
                        rule = 'TEMPO' if group.type == "TEMPO" else 'BECMG_TRANSITION'
                        temp_dt = change_start
                        while temp_dt < change_end:
                            hour_key = f"{temp_dt.day:02d}{temp_dt.hour:02d}"
                            if hour_key in hourly_forecasts:
                                hourly_forecasts[hour_key]['rule'] = rule
                                hourly_forecasts[hour_key]['change'] = change_dict
                            temp_dt += timedelta(hours=1)
                        
                        if group.type == "BECMG":
                             temp_dt = change_end
                             while temp_dt < end_dt:
                                 hour_key = f"{temp_dt.day:02d}{temp_dt.hour:02d}"
                                 if hour_key in hourly_forecasts:
                                     current_base = hourly_forecasts[hour_key]['base']
                                     updated_base = {**current_base, **change_dict}
                                     hourly_forecasts[hour_key]['base'] = updated_base
                                     
                                     if hourly_forecasts[hour_key]['rule'] == 'BECMG_TRANSITION':
                                         hourly_forecasts[hour_key]['rule'] = 'NORMAL'
                                         hourly_forecasts[hour_key]['change'] = {}
                                 temp_dt += timedelta(hours=1)
            
            parsed_tafs.append({
                'airport': data.station,
                'forecasts': hourly_forecasts,
                'start_dt': start_dt,
                'end_dt': end_dt,
                'validity_str': validity_str_raw or f"{start_dt.strftime('%d%H')}-{end_dt.strftime('%d%H')}"
            })
        except Exception as e:
            print(f"跳过无法解析的TAF报文: {report} - 错误: {e}")
            continue
            
    return parsed_tafs