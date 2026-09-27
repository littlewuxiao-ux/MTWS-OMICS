"""
航班解析器
完全移植原始mtws_01_flight解析.py的核心逻辑，适配Django框架
"""

import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import logging

from django.utils import timezone
from django.conf import settings
from core.models import Carrier
from parsers.models import Flight
from data_adapters.adapter_factory import AdapterFactory
from utils.time_manager import TimeManager
from utils.marks_alert_calculator import (
    default_warning,
    event_identity,
    normalize_warning,
    warning_is_ready,
)

logger = logging.getLogger('mtws.parsers')


class FlightParser:
    """航班解析器类 - 完全移植原始程序逻辑"""
    
    def __init__(self, time_mode='current', token=None):
        """
        初始化航班解析器
        
        Args:
            time_mode: 时间模式，'current' 或 'test'
            token: current模式下的认证token
        """
        self.time_mode = time_mode
        self.token = token
        
        # 设置当前时间
        self.current_time = TimeManager.get_current_time_local(time_mode)
            
        logger.info(f"航班解析器初始化完成，时间模式: {time_mode}, 当前时间: {self.current_time}")
    
    def parse_and_save(self):
        """
        解析并保存航班数据（与解析管理器接口保持一致）
        
        Returns:
            Dict: 解析结果统计
        """
        return self.parse_flight_data()
    
    def parse_flight_data(self):
        """
        解析航班数据的主入口方法
        
        Returns:
            Dict: 解析结果统计
        """
        logger.info("开始解析航班数据")
        start_time = datetime.now()
        
        try:
            # 1. 获取数据适配器并读取数据
            adapter = AdapterFactory.create_adapter(time_mode=self.time_mode, token=self.token)
            df = adapter.get_flight_data()
            
            if df.empty:
                logger.warning("未获取到航班数据，保留原有数据")
                # 更新状态：数据不可用，但保留原有数据
                self._update_flight_status(success=False)
                return {'success': False, 'message': '未获取到航班数据', 'record_count': 0, 'data_preserved': True}
            
            logger.info(f"获取到航班原始数据 {len(df)} 行")
            
            # 2. 过滤航班数据 (移植原始程序的过滤逻辑)
            df_filtered = self._filter_flight_data(df)
            logger.info(f"过滤后航班数据 {len(df_filtered)} 行")

            old_by_airport = {}
            for row in Flight.objects.all().order_by('created_at'):
                old_by_airport[row.airport_4code] = row

            airports = self._get_airports(df_filtered)
            logger.info(f"发现 {len(airports)} 个机场")

            processed_count = 0
            has_flight_true = []
            has_flight_false = []
            marks_full_airports = []
            marks_changed_keys = {}
            new_airports = set()

            for airport in airports:
                try:
                    events = self._build_airport_events(df_filtered, airport)
                    flags = self._marks_airport_flags(events)
                    has_flight = flags['has_flight']
                    old = old_by_airport.get(airport)
                    # 格点恢复：改为
                    #   airport_stats = self._calculate_airport_statistics(df_filtered, airport)
                    #   time_slots = self._build_time_slots(airport_stats)
                    time_slots = old.as_time_slots() if old else [''] * 48
                    en_route = flags['en_route']
                    closest_arr = flags['closest_arr_link']
                    closest_dep = flags['closest_dep_at']
                    closest_lnd = flags['closest_lnd_at']
                    old_events = old.as_events() if old else []
                    events, full_recalc, changed_keys = self._merge_event_warnings(old_events, events)
                    stats_changed = (
                        old is None
                        or old.has_flight != has_flight
                        or old.as_time_slots() != time_slots
                        or old.en_route != en_route
                        or old.closest_departure_time_of_arriving_flight != closest_arr
                        or old.closest_departure_time_at_this_airport != closest_dep
                        or old.closest_landing_time_of_arriving_flight != closest_lnd
                    )
                    if stats_changed or events != old_events:
                        if self._upsert_airport_data(
                            old, airport, has_flight, time_slots, events, en_route,
                            closest_arr, closest_dep, closest_lnd,
                        ):
                            processed_count += 1
                    else:
                        processed_count += 1

                    new_airports.add(airport)
                    if full_recalc:
                        marks_full_airports.append(airport)
                    elif changed_keys:
                        marks_changed_keys[airport] = changed_keys

                    if has_flight:
                        has_flight_true.append(airport)
                    else:
                        has_flight_false.append(airport)
                except Exception as e:
                    logger.error(f"处理机场 {airport} 数据失败: {str(e)}")

            stale = set(old_by_airport.keys()) - new_airports
            if stale:
                Flight.objects.filter(airport_4code__in=stale).delete()
                logger.info(f"已删除无数据机场航班行: {sorted(stale)}")
            
            # 输出简化的日志
            current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            logger.info(f"航班数据更新完成 - {current_time}")
            if has_flight_true:
                logger.info(f"has_flight: True - {has_flight_true}")
            if has_flight_false:
                logger.info(f"has_flight: False - {has_flight_false}")
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            # 更新状态：数据获取成功
            self._update_flight_status(success=True)
            
            result = {
                'success': True,
                'message': f'航班数据解析完成',
                'record_count': processed_count,
                'execution_time': execution_time,
                'marks_full_airports': marks_full_airports,
                'marks_changed_keys': marks_changed_keys,
            }
            
            logger.info(f"航班数据解析完成，处理 {processed_count} 个机场，耗时 {execution_time:.2f} 秒")
            return result
            
        except Exception as e:
            execution_time = (datetime.now() - start_time).total_seconds()
            logger.error(f"航班数据解析失败: {str(e)}")
            return {
                'success': False,
                'message': f'航班数据解析失败: {str(e)}',
                'record_count': 0,
                'execution_time': execution_time
            }
    
    def _filter_flight_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        过滤航班数据 - 修改后的过滤逻辑
        
        Args:
            df: 原始航班数据
            
        Returns:
            DataFrame: 过滤后的航班数据
        """
        # 1. 获取启用的航空公司代码
        enabled_carriers = self._get_enabled_carriers()
        
        # 筛选条件: carrier字段与航空公司表相同的航班信息
        if 'carrier' in df.columns and enabled_carriers:
            final_condition = df['carrier'].isin(enabled_carriers)
            logger.info(f"筛选条件（承运人匹配）: {final_condition.sum()} 行")
        else:
            if 'carrier' not in df.columns:
                logger.warning("API数据中未找到'carrier'字段")
            if not enabled_carriers:
                logger.warning("没有启用的航空公司")
            # 如果没有carrier字段或没有启用的航空公司，则不过滤任何数据
            final_condition = pd.Series([True] * len(df))
        
        filtered_df = df[final_condition].copy()
        
        logger.info(f"筛选后航班数据: {len(filtered_df)} 行")
        
        if filtered_df.empty:
            logger.warning("筛选后没有符合条件的航班数据")
        
        return filtered_df
    
    def _get_enabled_carriers(self) -> List[str]:
        """
        获取启用的航空公司代码（带缓存）
        
        Returns:
            List[str]: 启用的航空公司代码列表
        """
        try:
            return list(Carrier.objects.filter(is_active=True).values_list('carrier_code', flat=True))
            
        except Exception as e:
            logger.error(f"获取启用的航空公司代码失败: {str(e)}")
            return []
    
    def _get_airports(self, df: pd.DataFrame) -> List[str]:
        """
        从航班数据中提取机场列表
        
        Args:
            df: 航班数据
            
        Returns:
            List[str]: 机场四字代码列表
        """
        # 获取所有起飞机场和到达机场
        departure_airports = set(df['departureAirport'].dropna().tolist())
        arrival_airports = set(df['arrivalAirport'].dropna().tolist())
        
        # 合并并去重
        all_airports = list(departure_airports | arrival_airports)
        all_airports = [airport for airport in all_airports if airport and str(airport).strip()]
        
        logger.info(f"统计到的机场数量: {len(all_airports)}")
        logger.info(f"机场列表: {all_airports}")
        
        return all_airports
    
    def _get_time_priority(self, row: pd.Series, time_type: str) -> Optional[datetime]:
        """
        根据优先级获取时间，空值跳过 - 修改为使用英文字段名
        
        Args:
            row: 航班数据行
            time_type: 时间类型 ('arrival', 'departure')
            
        Returns:
            datetime: 解析后的时间
        """
        try:
            if time_type == 'arrival':
                # 到达时间优先级：eta > sta > pta
                time_fields = ['eta', 'sta', 'pta']
            else:  # departure
                # 起飞时间优先级：etd > std > ptd（移除atd，只统计未起飞航班）
                time_fields = ['etd', 'std', 'ptd']
            
            for field in time_fields:
                if field in row and pd.notna(row[field]) and str(row[field]).strip():
                    time_str = str(row[field]).strip()
                    if time_str:
                        # 尝试解析时间戳（毫秒级）
                        try:
                            # 将毫秒级时间戳转换为北京时间（与current_time保持一致）
                            timestamp_ms = float(time_str)
                            timestamp_s = timestamp_ms / 1000
                            utc_time = datetime.utcfromtimestamp(timestamp_s)
                            beijing_time = utc_time + timedelta(hours=8)
                            return beijing_time
                        except (ValueError, OSError):
                            continue
            
            return None
            
        except Exception as e:
            logger.error(f"获取时间优先级时发生错误: {e}")
            return None
    
    def _get_departure_time_ms(self, row: pd.Series, include_atd: bool = True) -> Optional[int]:
        """
        获取航班的起飞时间毫秒级时间戳
        
        Args:
            row: 航班数据行
            include_atd: 是否包含atd字段
            
        Returns:
            int: 毫秒级时间戳，None表示无有效时间
        """
        try:
            if include_atd:
                # 到达航班：优先级 atd > etd > std
                time_fields = ['atd', 'etd', 'std']
            else:
                # 出发航班：优先级 etd > std（不包含atd）
                time_fields = ['etd', 'std']
            
            for field in time_fields:
                if field in row and pd.notna(row[field]) and str(row[field]).strip():
                    time_str = str(row[field]).strip()
                    if time_str:
                        try:
                            # 返回毫秒级时间戳
                            timestamp_ms = int(float(time_str))
                            return timestamp_ms
                        except (ValueError, OSError):
                            continue
            
            return None
            
        except Exception as e:
            logger.error(f"获取起飞时间毫秒级时间戳时发生错误: {e}")
            return None
    
    def _get_arrival_time_ms(self, row: pd.Series) -> Optional[int]:
        """
        获取航班的落地时间毫秒级时间戳
        
        Args:
            row: 航班数据行
            
        Returns:
            int: 毫秒级时间戳，None表示无有效时间
        """
        try:
            # 落地时间优先级：eta > sta > pta
            time_fields = ['eta', 'sta', 'pta']
            
            for field in time_fields:
                if field in row and pd.notna(row[field]) and str(row[field]).strip():
                    time_str = str(row[field]).strip()
                    if time_str:
                        try:
                            timestamp_ms = int(float(time_str))
                            return timestamp_ms
                        except (ValueError, OSError):
                            continue
            
            return None
            
        except Exception as e:
            logger.error(f"获取落地时间毫秒级时间戳时发生错误: {e}")
            return None
    
    def _calculate_time_slot(self, flight_time: datetime) -> int:
        """
        计算时间段索引 - 完全移植原始程序逻辑
        
        时间段计算逻辑：
        - 当前时间：2025-5-10 11:25:00
        - 当前时间整点：2025-5-10 11:00:00
        - 航班时间整点：例如 2025-5-10 15:30:00 → 2025-5-10 15:00:00
        - 时间差：15:00 - 11:00 = 4小时
        - 返回索引：4 (即 time_4)
        
        Args:
            flight_time: 航班时间
            
        Returns:
            int: 时间段索引 (0-47)，-1表示超出范围
        """
        try:
            # 计算当前时间的整点时刻
            current_hour = self.current_time.replace(minute=0, second=0, microsecond=0)
            
            # 计算航班时间的整点时刻
            flight_hour = flight_time.replace(minute=0, second=0, microsecond=0)
            
            # 计算时间差（以小时为单位）
            time_diff = flight_hour - current_hour
            hours_diff = int(time_diff.total_seconds() / 3600)
            
            # 返回时间段索引（0-47）
            if 0 <= hours_diff <= 47:
                return hours_diff
            else:
                return -1  # 超出范围
                
        except Exception as e:
            logger.error(f"计算时间段时发生错误: {e}")
            return -1
    
    def _has_field(self, row: pd.Series, field: str) -> bool:
        """字段是否有有效值。"""
        if field not in row:
            return False
        val = row[field]
        if pd.isna(val):
            return False
        return bool(str(val).strip())

    def _field_ms(self, row: pd.Series, field: str) -> Optional[int]:
        """读取单个毫秒时间戳字段。"""
        if not self._has_field(row, field):
            return None
        try:
            return int(float(str(row[field]).strip()))
        except (ValueError, OSError, TypeError):
            return None

    def _pick_ms(self, row: pd.Series, fields: List[str]) -> Optional[int]:
        """按优先级取第一个有效毫秒时间戳。"""
        for field in fields:
            ms = self._field_ms(row, field)
            if ms is not None:
                return ms
        return None

    def _other_payload(self, row: pd.Series) -> Dict:
        """悬停用明细字段。"""
        keys = [
            'flightId', 'flightDate', 'flightNo', 'acType', 'acReg',
            'departureAirport', 'arrivalAirport',
            'ptd', 'pta', 'std', 'sta', 'etd', 'eta', 'atd', 'ata',
            'blockOut', 'closeDoorTime',
        ]
        other = {}
        for key in keys:
            if key not in row:
                other[key] = None
                continue
            val = row[key]
            if pd.isna(val) or str(val).strip() == '':
                other[key] = None
            else:
                if key in ('ptd', 'pta', 'std', 'sta', 'etd', 'eta', 'atd', 'ata',
                           'blockOut', 'closeDoorTime', 'flightDate'):
                    try:
                        other[key] = int(float(str(val).strip()))
                    except (ValueError, TypeError):
                        other[key] = str(val).strip()
                else:
                    other[key] = str(val).strip()
        return other

    def _event_window_ms(self) -> tuple:
        """events 写入窗口：[now-2h, now+48h]，分钟精度。"""
        now = self.current_time.replace(second=0, microsecond=0)
        start = now - timedelta(hours=2)
        end = now + timedelta(hours=48)
        return int(start.timestamp() * 1000), int(end.timestamp() * 1000)

    def _build_airport_events(self, df: pd.DataFrame, airport: str) -> list:
        """构建本机场 marks 用 events 列表（按 at 升序）。"""
        events = []
        win_start, win_end = self._event_window_ms()
        now_ms = int(self.current_time.replace(second=0, microsecond=0).timestamp() * 1000)

        def append_event(kind: str, at_ms: Optional[int], link_ms: Optional[int], row: pd.Series):
            if at_ms is None:
                return
            if at_ms < win_start or at_ms > win_end:
                return
            carrier = None
            if self._has_field(row, 'carrier'):
                carrier = str(row['carrier']).strip()
            flight_id = None
            if self._has_field(row, 'flightId'):
                flight_id = str(row['flightId']).strip()
            events.append({
                'at': at_ms,
                'link': link_ms,
                'kind': kind,
                'carrier': carrier,
                'flightId': flight_id,
                'warning': default_warning(),
                'other': self._other_payload(row),
            })

        arrival_flights = df[df['arrivalAirport'] == airport]
        for _, row in arrival_flights.iterrows():
            has_atd = self._has_field(row, 'atd')
            has_ata = self._has_field(row, 'ata')
            link_ms = self._pick_ms(row, ['atd', 'etd', 'std', 'ptd'])
            if has_ata:
                append_event('lnd', self._field_ms(row, 'ata'), link_ms, row)
            else:
                land_ms = self._pick_ms(row, ['eta', 'sta', 'pta'])
                if land_ms is not None and land_ms < now_ms:
                    # oen=已起飞超时未落；oar=对方未起且落地时刻已过
                    append_event('oen' if has_atd else 'oar', land_ms, link_ms, row)
                elif has_atd:
                    append_event('enr', land_ms, link_ms, row)
                else:
                    append_event('arr', land_ms, link_ms, row)

        departure_flights = df[df['departureAirport'] == airport]
        for _, row in departure_flights.iterrows():
            at_ms = self._pick_ms(row, ['atd', 'etd', 'std', 'ptd'])
            link_ms = self._pick_ms(row, ['eta', 'sta', 'pta'])
            has_atd = self._has_field(row, 'atd')
            has_ata = self._has_field(row, 'ata')
            if has_atd and has_ata:
                kind = 'dst'
            elif has_atd:
                kind = 'off'
            elif at_ms is not None and at_ms < now_ms:
                kind = 'odp'  # 本场超时未起（原 no_dep）
            else:
                kind = 'dep'
            append_event(kind, at_ms, link_ms, row)

        events.sort(key=lambda e: (e['at'], e['kind']))
        return events

    def _marks_airport_flags(self, events: list) -> Dict:
        """由本机场 events 汇总入库字段（不再用 48 格 slots）。

        kind：arr=未起未到；enr=已起未到；lnd=本场已落地；
        oar=对方未起且落地已过；oen=已起且落地已过未落地；
        dep=本场未起；off=本场已起对方未落；dst=本场已起对方已落；
        odp=本场超时未起。
        has_flight：仅 off/lnd/dst 则为假。en_route：有 enr 或 oen。
        """
        idle = {'off', 'lnd', 'dst'}
        has_flight = False
        en_route = 0
        closest_arr_link = None
        closest_lnd_at = None
        closest_dep_at = None
        for ev in events or []:
            if not isinstance(ev, dict):
                continue
            kind = ev.get('kind')
            if kind not in idle:
                has_flight = True
            if kind in ('enr', 'oen'):
                en_route = 1
            if kind in ('arr', 'oar'):
                link = ev.get('link')
                if link is not None and (closest_arr_link is None or link < closest_arr_link):
                    closest_arr_link = link
            if kind in ('enr', 'arr', 'oen', 'oar'):
                at = ev.get('at')
                if at is not None and (closest_lnd_at is None or at < closest_lnd_at):
                    closest_lnd_at = at
            if kind in ('dep', 'odp'):
                at = ev.get('at')
                if at is not None and (closest_dep_at is None or at < closest_dep_at):
                    closest_dep_at = at
        return {
            'has_flight': has_flight,
            'en_route': en_route,
            'closest_arr_link': closest_arr_link,
            'closest_lnd_at': closest_lnd_at,
            'closest_dep_at': closest_dep_at,
        }

    def _merge_event_warnings(self, old_events: list, new_events: list):
        """沿用未变航班的 warning；返回 (events, 是否全场重算, 变化键列表)。"""
        old_map = {}
        for ev in old_events or []:
            if isinstance(ev, dict):
                old_map[event_identity(ev)] = ev
        changed_keys = []
        if not old_map:
            return new_events, True, []
        for ev in new_events:
            key = event_identity(ev)
            old = old_map.get(key)
            if (
                old
                and old.get('at') == ev.get('at')
                and old.get('kind') == ev.get('kind')
                and warning_is_ready(old.get('warning'))
            ):
                ev['warning'] = normalize_warning(old.get('warning'))
            else:
                ev['warning'] = default_warning()
                changed_keys.append(key)
        return new_events, False, changed_keys

    def _upsert_airport_data(
        self, old, airport, has_flight, time_slots, events, en_route,
        closest_arr, closest_dep, closest_lnd,
    ) -> bool:
        try:
            fields = {
                'has_flight': has_flight,
                'time_slots': time_slots,
                'events': events or [],
                'en_route': en_route,
                'closest_departure_time_of_arriving_flight': closest_arr,
                'closest_departure_time_at_this_airport': closest_dep,
                'closest_landing_time_of_arriving_flight': closest_lnd,
            }
            if old and old.pk is not None:
                for k, v in fields.items():
                    setattr(old, k, v)
                old.save()
                extras = Flight.objects.filter(airport_4code=airport).exclude(pk=old.pk)
                if extras.exists():
                    extras.delete()
            elif old:
                Flight.objects.filter(airport_4code=airport).update(**fields)
            else:
                Flight.objects.create(airport_4code=airport, **fields)
            return True
        except Exception as e:
            logger.error(f'保存机场{airport}数据时发生错误: {e}')
            return False

    def _calculate_airport_statistics(self, df: pd.DataFrame, airport: str) -> Dict[str, List[int]]:
        """格点 48 格统计。恢复格点显示时由 parse 热路径重新调用；当前不调用。"""
        try:
            landing_inflight = [0] * 48
            landing_all = [0] * 48
            takeoff_all = [0] * 48
            closest_arriving_time = None
            closest_departing_time = None
            closest_landing_time = None
            current_time_ms = int(self.current_time.timestamp() * 1000)

            arrival_flights = df[df['arrivalAirport'] == airport]
            for _, row in arrival_flights.iterrows():
                if self._has_field(row, 'ata'):
                    continue
                arrival_time = self._get_time_priority(row, 'arrival')
                if arrival_time:
                    slot = self._calculate_time_slot(arrival_time)
                    if 0 <= slot <= 47:
                        landing_all[slot] += 1
                        if self._has_field(row, 'atd'):
                            landing_inflight[slot] += 1
                        if not self._has_field(row, 'atd'):
                            departure_time_ms = self._get_departure_time_ms(row, include_atd=False)
                            if departure_time_ms:
                                if closest_arriving_time is None or departure_time_ms < closest_arriving_time:
                                    closest_arriving_time = departure_time_ms
                        landing_time_ms = self._get_arrival_time_ms(row)
                        if landing_time_ms and landing_time_ms > current_time_ms:
                            if closest_landing_time is None or landing_time_ms < closest_landing_time:
                                closest_landing_time = landing_time_ms

            departure_flights = df[df['departureAirport'] == airport]
            for _, row in departure_flights.iterrows():
                if self._has_field(row, 'atd'):
                    continue
                departure_time = self._get_time_priority(row, 'departure')
                if departure_time:
                    slot = self._calculate_time_slot(departure_time)
                    if 0 <= slot <= 47:
                        takeoff_all[slot] += 1
                        departure_time_ms = self._get_departure_time_ms(row, include_atd=False)
                        if departure_time_ms:
                            if closest_departing_time is None or departure_time_ms < closest_departing_time:
                                closest_departing_time = departure_time_ms

            return {
                'landing_inflight': landing_inflight,
                'landing_all': landing_all,
                'takeoff_all': takeoff_all,
                'closest_arriving_time': closest_arriving_time,
                'closest_departing_time': closest_departing_time,
                'closest_landing_time': closest_landing_time
            }
        except Exception as e:
            logger.error(f'计算机场{airport}统计数据时发生错误: {e}')
            return {
                'landing_inflight': [0] * 48,
                'landing_all': [0] * 48,
                'takeoff_all': [0] * 48,
                'closest_arriving_time': None,
                'closest_departing_time': None,
                'closest_landing_time': None
            }

    def _build_time_slots(self, stats: Dict[str, List[int]]) -> list:
        """由 48 格统计生成 time_slots。恢复格点时与 _calculate_airport_statistics 一起调用；当前不调用。"""
        time_slots = []
        for i in range(48):
            inflight = stats['landing_inflight'][i]
            landing = stats['landing_all'][i]
            takeoff = stats['takeoff_all'][i]
            if inflight == 0 and landing == 0 and takeoff == 0:
                time_slots.append('')
            else:
                time_slots.append(f'{inflight}-{landing}-{takeoff}')
        return time_slots

    def _save_airport_data(self, airport: str, stats: Dict[str, List[int]], events: list = None) -> bool:
        """保存机场航班数据到数据库。"""
        try:
            flags = self._marks_airport_flags(events or [])
            Flight.objects.create(
                airport_4code=airport,
                has_flight=flags['has_flight'],
                time_slots=self._build_time_slots(stats),
                events=events or [],
                en_route=flags['en_route'],
                closest_departure_time_of_arriving_flight=flags['closest_arr_link'],
                closest_departure_time_at_this_airport=flags['closest_dep_at'],
                closest_landing_time_of_arriving_flight=flags['closest_lnd_at'],
            )
            logger.info(f'成功保存机场 {airport} 的数据，has_flight: {flags["has_flight"]}')
            return True
        except Exception as e:
            logger.error(f'保存机场{airport}数据时发生错误: {e}')
            return False

    def _save_airport_data_silent(self, airport: str, stats: Dict[str, List[int]], has_flight: bool, events: list = None) -> bool:
        """静默保存机场航班数据到数据库。"""
        try:
            flags = self._marks_airport_flags(events or [])
            Flight.objects.create(
                airport_4code=airport,
                has_flight=flags['has_flight'],
                time_slots=self._build_time_slots(stats),
                events=events or [],
                en_route=flags['en_route'],
                closest_departure_time_of_arriving_flight=flags['closest_arr_link'],
                closest_departure_time_at_this_airport=flags['closest_dep_at'],
                closest_landing_time_of_arriving_flight=flags['closest_lnd_at'],
            )
            return True
        except Exception as e:
            logger.error(f'保存机场{airport}数据时发生错误: {e}')
            return False

    def _update_flight_status(self, success: bool):
        """更新航班数据状态。"""
        try:
            from django.utils import timezone
            current_time = timezone.now()
            settings.MTWS_CONFIG['FLIGHT_DATA_STATUS']['last_attempt_time'] = current_time
            settings.MTWS_CONFIG['FLIGHT_DATA_STATUS']['is_available'] = success
            if success:
                settings.MTWS_CONFIG['FLIGHT_DATA_STATUS']['last_success_time'] = current_time
                logger.info(f'航班数据状态更新：成功获取，时间 {current_time}')
            else:
                logger.warning(f'航班数据状态更新：获取失败，时间 {current_time}')
        except Exception as e:
            logger.error(f'更新航班数据状态失败: {e}')
