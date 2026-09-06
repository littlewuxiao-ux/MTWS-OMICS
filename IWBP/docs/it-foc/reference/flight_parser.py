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
            
            # 3. 清空现有航班数据 (与原始程序逻辑一致)
            Flight.objects.all().delete()
            logger.info("已清空现有航班数据")
            
            # 4. 获取机场列表
            airports = self._get_airports(df_filtered)
            logger.info(f"发现 {len(airports)} 个机场")
            
            # 5. 处理每个机场的航班数据
            processed_count = 0
            has_flight_true = []
            has_flight_false = []
            
            for airport in airports:
                try:
                    airport_stats = self._calculate_airport_statistics(df_filtered, airport)
                    
                    # 计算has_flight字段
                    has_flight = any(airport_stats['landing_inflight'][i] > 0 or 
                                   airport_stats['landing_all'][i] > 0 or 
                                   airport_stats['takeoff_all'][i] > 0 
                                   for i in range(0, 48))
                    
                    if self._save_airport_data_silent(airport, airport_stats, has_flight):
                        processed_count += 1
                        # 分类收集机场
                        if has_flight:
                            has_flight_true.append(airport)
                        else:
                            has_flight_false.append(airport)
                except Exception as e:
                    logger.error(f"处理机场 {airport} 数据失败: {str(e)}")
            
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
                'execution_time': execution_time
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
    
    def _calculate_airport_statistics(self, df: pd.DataFrame, airport: str) -> Dict[str, List[int]]:
        """
        计算单个机场的统计数据 - 完全移植原始程序逻辑
        
        Args:
            df: 航班数据
            airport: 机场四字代码
            
        Returns:
            Dict: 航班统计数据
        """
        try:
            # 初始化48个时间段的统计数据
            landing_inflight = [0] * 48
            landing_all = [0] * 48
            takeoff_all = [0] * 48
            
            # 初始化最小时间戳变量（优化：边收集边计算）
            closest_arriving_time = None  # 到达航班的最早起飞时间
            closest_departing_time = None  # 出发航班的最早起飞时间
            closest_landing_time = None  # 到达航班的最近落地时间
            current_time_ms = int(self.current_time.timestamp() * 1000)
            
            # 处理到达航班
            arrival_flights = df[df['arrivalAirport'] == airport]
            for _, row in arrival_flights.iterrows():
                arrival_time = self._get_time_priority(row, 'arrival')
                if arrival_time:
                    slot = self._calculate_time_slot(arrival_time)
                    if 0 <= slot <= 47:
                        landing_all[slot] += 1
                        
                        # 判断是否为着陆中航班（已起飞但未着陆）- 原始程序的关键逻辑
                        if (pd.notna(row['atd']) and str(row['atd']).strip()):
                            landing_inflight[slot] += 1
                        
                        # 边收集边计算：到达航班的最早起飞时间
                        # 跳过已起飞的航班，只使用预计起飞时间（优先级：etd > std）
                        if not (pd.notna(row['atd']) and str(row['atd']).strip()):
                            departure_time_ms = self._get_departure_time_ms(row, include_atd=False)
                            if departure_time_ms:
                                if closest_arriving_time is None or departure_time_ms < closest_arriving_time:
                                    closest_arriving_time = departure_time_ms
                        
                        # 边收集边计算：到达航班的最近落地时间（优先级：eta > sta > pta）
                        landing_time_ms = self._get_arrival_time_ms(row)
                        if landing_time_ms and landing_time_ms > current_time_ms:
                            if closest_landing_time is None or landing_time_ms < closest_landing_time:
                                closest_landing_time = landing_time_ms
            
            # 处理起飞航班
            departure_flights = df[df['departureAirport'] == airport]
            for _, row in departure_flights.iterrows():
                # 如果ATD不为空，说明航班已起飞，跳过该航班
                if (pd.notna(row['atd']) and str(row['atd']).strip()):
                    continue
                    
                departure_time = self._get_time_priority(row, 'departure')
                if departure_time:
                    slot = self._calculate_time_slot(departure_time)
                    if 0 <= slot <= 47:
                        takeoff_all[slot] += 1
                        
                        # 边收集边计算：出发航班的最早起飞时间（优先级：etd > std，不包含atd）
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
            logger.error(f"计算机场{airport}统计数据时发生错误: {e}")
            return {
                'landing_inflight': [0] * 48,
                'landing_all': [0] * 48,
                'takeoff_all': [0] * 48,
                'closest_arriving_time': None,
                'closest_departing_time': None,
                'closest_landing_time': None
            }
    
    def _save_airport_data(self, airport: str, stats: Dict[str, List[int]]) -> bool:
        """
        保存机场航班数据到数据库 - 完全移植原始程序逻辑
        
        Args:
            airport: 机场四字代码
            stats: 航班统计数据
            
        Returns:
            bool: 是否保存成功
        """
        try:
            # 生成48个时间段的航班数据
            flight_data = {}
            for i in range(48):
                inflight = stats['landing_inflight'][i]
                landing = stats['landing_all'][i]
                takeoff = stats['takeoff_all'][i]
                
                # 构建flight字段（三组数据用-拼接，全为0则为空）- 与原始程序完全一致
                if inflight == 0 and landing == 0 and takeoff == 0:
                    flight_data[f'time_{i}_flight'] = ""
                else:
                    flight_data[f'time_{i}_flight'] = f"{inflight}-{landing}-{takeoff}"
            
            # 计算has_flight字段 - 与原始程序完全一致
            has_flight = any(stats['landing_inflight'][i] > 0 or 
                           stats['landing_all'][i] > 0 or 
                           stats['takeoff_all'][i] > 0 
                           for i in range(0, 48))  # time_0到time_47
            
            # 直接插入新数据 (与原始程序逻辑一致)
            flight_data.update({
                'airport_4code': airport,
                'has_flight': has_flight,
            })
            
            Flight.objects.create(**flight_data)
            logger.info(f"成功保存机场 {airport} 的数据，has_flight: {has_flight}")
            return True
            
        except Exception as e:
            logger.error(f"保存机场{airport}数据时发生错误: {e}")
            return False
    
    def _save_airport_data_silent(self, airport: str, stats: Dict[str, List[int]], has_flight: bool) -> bool:
        """
        静默保存机场航班数据到数据库（不输出单个机场日志）
        
        Args:
            airport: 机场四字代码
            stats: 航班统计数据
            has_flight: 是否有航班
            
        Returns:
            bool: 是否保存成功
        """
        try:
            # 生成48个时间段的航班数据
            flight_data = {}
            for i in range(48):
                inflight = stats['landing_inflight'][i]
                landing = stats['landing_all'][i]
                takeoff = stats['takeoff_all'][i]
                
                # 构建flight字段（三组数据用-拼接，全为0则为空）
                if inflight == 0 and landing == 0 and takeoff == 0:
                    flight_data[f'time_{i}_flight'] = ""
                else:
                    flight_data[f'time_{i}_flight'] = f"{inflight}-{landing}-{takeoff}"
            
            # 计算en_route字段：如果任意一个landing_inflight > 0，则为1，否则为0
            en_route = 1 if any(stats['landing_inflight'][i] > 0 for i in range(48)) else 0
            
            # 获取已计算好的最早时间（优化后直接使用结果）
            closest_arriving_time = stats.get('closest_arriving_time')
            closest_departing_time = stats.get('closest_departing_time')
            closest_landing_time = stats.get('closest_landing_time')
            
            # 直接插入新数据
            flight_data.update({
                'airport_4code': airport,
                'has_flight': has_flight,
                'en_route': en_route,
                'closest_departure_time_of_arriving_flight': closest_arriving_time,
                'closest_departure_time_at_this_airport': closest_departing_time,
                'closest_landing_time_of_arriving_flight': closest_landing_time,
            })
            
            Flight.objects.create(**flight_data)
            return True
            
        except Exception as e:
            logger.error(f"保存机场{airport}数据时发生错误: {e}")
            return False
    
    def _update_flight_status(self, success: bool):
        """
        更新航班数据状态
        
        Args:
            success: 是否成功获取数据
        """
        try:
            from django.utils import timezone
            current_time = timezone.now()
            
            # 更新配置中的状态
            settings.MTWS_CONFIG['FLIGHT_DATA_STATUS']['last_attempt_time'] = current_time
            settings.MTWS_CONFIG['FLIGHT_DATA_STATUS']['is_available'] = success
            
            if success:
                settings.MTWS_CONFIG['FLIGHT_DATA_STATUS']['last_success_time'] = current_time
                logger.info(f"航班数据状态更新：成功获取，时间 {current_time}")
            else:
                logger.warning(f"航班数据状态更新：获取失败，时间 {current_time}")
                
        except Exception as e:
            logger.error(f"更新航班数据状态失败: {e}") 