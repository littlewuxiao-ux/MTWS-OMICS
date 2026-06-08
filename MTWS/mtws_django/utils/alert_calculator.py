"""
航班告警计算工具模块
完整实现前端的告警计算逻辑，支持所有告警裕度值的预计算
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from utils.time_manager import TimeManager

logger = logging.getLogger('mtws.alert_calculator')


class AlertCalculator:
    """航班告警计算器"""
    
    def __init__(self, time_mode='current'):
        self.time_mode = time_mode
        
    def calculate_airport_alerts(self, airport_data: Dict, time_range: int = 36) -> Dict:
        """
        计算机场所有告警裕度的告警结果
        
        Args:
            airport_data: 机场数据，包含flight_data, metar_data, taf_data
            time_range: 时间范围，36或48小时
            
        Returns:
            Dict: 所有margin值的告警计算结果
        """
        try:
            flight_data = airport_data.get('flight_data', {})
            metar_data = airport_data.get('metar_data', [])
            taf_data = airport_data.get('taf_data', [])
            
            # 获取当前时间
            current_time = self._get_current_time()
            
            # 计算所有margin值(0-4)的告警结果
            computed_alerts = {}
            
            for margin in range(5):  # 0, 1, 2, 3, 4
                margin_results = self._calculate_margin_alerts(
                    margin, flight_data, metar_data, taf_data, 
                    current_time, time_range
                )
                computed_alerts[f'margin_{margin}'] = margin_results
                
            return computed_alerts
            
        except Exception as e:
            logger.error(f"计算机场告警失败: {str(e)}")
            return self._get_empty_alerts()
    
    def _calculate_margin_alerts(self, margin: int, flight_data: Dict, 
                                metar_data: List, taf_data: List, 
                                current_time: datetime, time_range: int) -> Dict:
        """计算指定margin值的告警结果 - 使用范围优先架构"""
        
        time_slots = flight_data.get('time_slots', [])
        
        # 初始化每个时段的告警结果为'N'
        alert_results = ['N'] * time_range
        # TAF独立告警结果（不含实况，用于地图内圆着色）
        taf_only_results = ['N'] * time_range
        
        # 1. 应用实况告警（仅写入综合结果）
        self._apply_metar_alerts(alert_results, margin, time_slots, metar_data, time_range)
        
        # 2. 应用TAF预报告警（同时写入综合结果和TAF独立结果）
        if taf_data and len(taf_data) > 0:
            taf = taf_data[0]
            
            # 2.1 应用主体预报告警
            self._apply_taf_subject_alerts(alert_results, margin, time_slots, taf, current_time, time_range)
            self._apply_taf_subject_alerts(taf_only_results, margin, time_slots, taf, current_time, time_range)
            
            # 2.2 应用变化组告警
            for change_index in range(1, 9):  # 1-8个变化组
                self._apply_taf_change_alerts(alert_results, margin, time_slots, taf, change_index, current_time, time_range)
                self._apply_taf_change_alerts(taf_only_results, margin, time_slots, taf, change_index, current_time, time_range)
            
            # 2.3 应用BECMG区间告警
            self._apply_becmg_interval_alerts(alert_results, margin, time_slots, taf, current_time, time_range)
            self._apply_becmg_interval_alerts(taf_only_results, margin, time_slots, taf, current_time, time_range)
            
            # 2.4 应用温度告警
            self._apply_temperature_alerts(alert_results, margin, time_slots, taf, current_time, time_range)
            self._apply_temperature_alerts(taf_only_results, margin, time_slots, taf, current_time, time_range)
        
        # 计算综合最高告警等级
        max_alert_level = 'N'
        for i in range(time_range):
            flight_info = time_slots[i] if i < len(time_slots) else ''
            if self._has_flight(flight_info) and self._is_higher_alert(alert_results[i], max_alert_level):
                max_alert_level = alert_results[i]
        
        # 计算TAF独立最高告警等级（外圆内圆着色用）
        taf_highest_alert = 'N'
        for i in range(time_range):
            flight_info = time_slots[i] if i < len(time_slots) else ''
            if self._has_flight(flight_info) and self._is_higher_alert(taf_only_results[i], taf_highest_alert):
                taf_highest_alert = taf_only_results[i]
        
        # 判断实况是否覆盖到航班（外圆闪烁条件用）
        metar_has_flight = False
        if metar_data and len(metar_data) > 0:
            metar_entry = metar_data[0]
            metar_warning = (metar_entry.get('metar_warning', 'N') if isinstance(metar_entry, dict)
                             else getattr(metar_entry, 'metar_warning', 'N'))
            if metar_warning and metar_warning != 'N':
                end_idx = min(margin, time_range - 1)
                for i in range(0, end_idx + 1):
                    flight_info = time_slots[i] if i < len(time_slots) else ''
                    if self._has_flight(flight_info):
                        metar_has_flight = True
                        break
        
        return {
            'highest_alert': max_alert_level,
            'taf_highest_alert': taf_highest_alert,
            'metar_has_flight': metar_has_flight,
            'time_slots': alert_results
        }
    
    def _apply_metar_alerts(self, alert_results: List, margin: int, time_slots: List, 
                           metar_data: List, time_range: int):
        """应用实况告警 - 告警裕度为[n]时，判断time_0到time_[n]范围内的航班"""
        if not metar_data or len(metar_data) == 0:
            return
        
        # 实况有效范围：time_0 到 time_[margin]
        start_index = 0
        end_index = min(margin, time_range - 1)
        
        # 检查范围内是否有航班
        has_flight_in_range = False
        for i in range(start_index, end_index + 1):
            flight_info = time_slots[i] if i < len(time_slots) else ''
            if self._has_flight(flight_info):
                has_flight_in_range = True
                break
        
        # 如果范围内有航班，应用实况告警到所有有航班的时段
        if has_flight_in_range:
            latest_metar = metar_data[0]
            metar_warning = latest_metar.get('metar_warning', 'N')
            
            for i in range(start_index, end_index + 1):
                flight_info = time_slots[i] if i < len(time_slots) else ''
                if self._has_flight(flight_info):
                    # 应用更高优先级的告警
                    if self._is_higher_alert(metar_warning, alert_results[i]):
                        alert_results[i] = metar_warning
    
    def _apply_taf_subject_alerts(self, alert_results: List, margin: int, time_slots: List,
                                 taf: Dict, current_time: datetime, time_range: int):
        """应用TAF主体预报告警"""
        if not taf.get('subject_validity_period_start') or not taf.get('subject_validity_period_end'):
            return
        
        # 计算扩展后的时间范围
        start_time = taf['subject_validity_period_start']
        end_time = taf['subject_validity_period_end']
        subject_warning = taf.get('subject_warning', 'N')
        
        if subject_warning == 'N':
            return
        
        # 计算扩展时间范围对应的时段索引
        time_range_indices = self._calculate_extended_time_range(start_time, end_time, margin, current_time)
        if time_range_indices is None:
            return
        
        start_index = max(0, time_range_indices['start_index'])
        end_index = min(time_range - 1, time_range_indices['end_index'])
        
        # 检查范围内是否有航班
        has_flight_in_range = False
        for i in range(start_index, end_index + 1):
            flight_info = time_slots[i] if i < len(time_slots) else ''
            if self._has_flight(flight_info):
                has_flight_in_range = True
                break
        
        # 如果范围内有航班，应用预报告警到所有有航班的时段
        if has_flight_in_range:
            for i in range(start_index, end_index + 1):
                flight_info = time_slots[i] if i < len(time_slots) else ''
                if self._has_flight(flight_info):
                    # 应用更高优先级的告警
                    if self._is_higher_alert(subject_warning, alert_results[i]):
                        alert_results[i] = subject_warning
    
    def _apply_taf_change_alerts(self, alert_results: List, margin: int, time_slots: List,
                                taf: Dict, change_index: int, current_time: datetime, time_range: int):
        """应用TAF变化组告警"""
        change_start = taf.get(f'change_{change_index}_validity_period_start')
        change_end = taf.get(f'change_{change_index}_validity_period_end')
        change_warning = taf.get(f'change_{change_index}_warning')
        
        if not change_start or not change_end or not change_warning or change_warning == 'N':
            return
        
        # 计算扩展时间范围对应的时段索引
        time_range_indices = self._calculate_extended_time_range(change_start, change_end, margin, current_time)
        if time_range_indices is None:
            return
        
        start_index = max(0, time_range_indices['start_index'])
        end_index = min(time_range - 1, time_range_indices['end_index'])
        
        # 检查范围内是否有航班
        has_flight_in_range = False
        for i in range(start_index, end_index + 1):
            flight_info = time_slots[i] if i < len(time_slots) else ''
            if self._has_flight(flight_info):
                has_flight_in_range = True
                break
        
        # 如果范围内有航班，应用变化组告警到所有有航班的时段
        if has_flight_in_range:
            for i in range(start_index, end_index + 1):
                flight_info = time_slots[i] if i < len(time_slots) else ''
                if self._has_flight(flight_info):
                     # 应用更高优先级的告警
                     if self._is_higher_alert(change_warning, alert_results[i]):
                         alert_results[i] = change_warning
    
    def _apply_becmg_interval_alerts(self, alert_results: List, margin: int, time_slots: List,
                                    taf: Dict, current_time: datetime, time_range: int):
         """应用BECMG区间告警：在BECMG变化组前的预报段结束到BECMG开始之间的区间"""
         try:
             # 1. 找到所有BECMG变化组
             becmg_groups = []
             for i in range(1, 9):  # 1-8个变化组
                 change_type = taf.get(f'change_{i}_type')
                 change_start = taf.get(f'change_{i}_validity_period_start')
                 change_warning = taf.get(f'change_{i}_warning')
                 
                 if change_type == 'BECMG' and change_start and change_warning:
                     becmg_groups.append({
                         'index': i,
                         'start_time': change_start,
                         'warning': change_warning
                     })
             
             if not becmg_groups:
                 return
             
             # 2. 为每个BECMG变化组处理区间告警
             for becmg in becmg_groups:
                 # 2.1 找到BECMG前面最近的预报段结束时间
                 preceding_end_time = self._find_preceding_forecast_end(taf, becmg['index'])
                 if not preceding_end_time:
                     continue
                 
                 # 2.2 找到前面预报段的告警等级
                 preceding_warning = self._find_preceding_forecast_warning(taf, becmg['index'])
                 if not preceding_warning:
                     continue
                 
                 # 2.3 确定区间告警等级（取两者较高值）
                 interval_warning = becmg['warning']
                 if self._is_higher_alert(preceding_warning, interval_warning):
                     interval_warning = preceding_warning
                 
                 if interval_warning == 'N':
                     continue
                 
                 # 2.4 计算时间区间对应的时段索引（不扩展告警裕度）
                 time_range_indices = self._calculate_becmg_interval_time_range(
                     preceding_end_time, becmg['start_time'], current_time
                 )
                 if time_range_indices is None:
                     continue
                 
                 start_index = max(0, time_range_indices['start_index'])
                 end_index = min(time_range - 1, time_range_indices['end_index'])
                 
                 # 2.5 检查范围内是否有航班
                 has_flight_in_range = False
                 for i in range(start_index, end_index + 1):
                     flight_info = time_slots[i] if i < len(time_slots) else ''
                     if self._has_flight(flight_info):
                         has_flight_in_range = True
                         break
                 
                 # 2.6 如果范围内有航班，应用区间告警到所有有航班的时段
                 if has_flight_in_range:
                     for i in range(start_index, end_index + 1):
                         flight_info = time_slots[i] if i < len(time_slots) else ''
                         if self._has_flight(flight_info):
                             # 应用更高优先级的告警
                             if self._is_higher_alert(interval_warning, alert_results[i]):
                                 alert_results[i] = interval_warning
                                 
         except Exception as e:
             logger.error(f"应用BECMG区间告警失败: {str(e)}")
     
    def _find_preceding_forecast_end(self, taf: Dict, becmg_index: int) -> Optional[str]:
        """找到BECMG变化组前面最近的预报段的结束时间 - 基于序号距离的简化逻辑"""
        try:
            # 获取BECMG的开始时间用于时间校验
            becmg_start = taf.get(f'change_{becmg_index}_validity_period_start')
            if not becmg_start:
                return None
            
            # 在序号小于BECMG的范围内查找最近的FROM或BECMG变化组
            for i in range(becmg_index - 1, 0, -1):  # 从becmg_index-1向1递减
                change_type = taf.get(f'change_{i}_type')
                change_end = taf.get(f'change_{i}_validity_period_end')
                
                # 只考虑FROM和BECMG变化组（排除TEMPO和PROB）
                if change_type in ['FROM', 'BECMG'] and change_end:
                    # 时间校验：结束时间必须早于或等于BECMG开始时间
                    if self._is_time_before_or_equal(change_end, becmg_start):
                        return change_end
                    # 如果时间校验不通过，继续向前查找
            
            # 如果没有找到符合时间条件的FROM或BECMG变化组，使用主体预报的结束时间
            return taf.get('subject_validity_period_end')
            
        except Exception as e:
            logger.error(f"查找前置预报段结束时间失败: {str(e)}")
            return None
     
    def _find_preceding_forecast_warning(self, taf: Dict, becmg_index: int) -> Optional[str]:
        """找到BECMG变化组前面最近的预报段的告警等级 - 基于序号距离的简化逻辑"""
        try:
            # 获取BECMG的开始时间用于时间校验
            becmg_start = taf.get(f'change_{becmg_index}_validity_period_start')
            if not becmg_start:
                return None
            
            # 在序号小于BECMG的范围内查找最近的FROM或BECMG变化组
            for i in range(becmg_index - 1, 0, -1):  # 从becmg_index-1向1递减
                change_type = taf.get(f'change_{i}_type')
                change_end = taf.get(f'change_{i}_validity_period_end')
                change_warning = taf.get(f'change_{i}_warning')
                
                # 只考虑FROM和BECMG变化组（排除TEMPO和PROB）
                if change_type in ['FROM', 'BECMG'] and change_end and change_warning:
                    # 时间校验：结束时间必须早于或等于BECMG开始时间
                    if self._is_time_before_or_equal(change_end, becmg_start):
                        return change_warning
                    # 如果时间校验不通过，继续向前查找
            
            # 如果没有找到符合时间条件的FROM或BECMG变化组，使用主体预报的告警等级
            return taf.get('subject_warning')
            
        except Exception as e:
            logger.error(f"查找前置预报段告警等级失败: {str(e)}")
            return None
     
    def _is_time_before_or_equal(self, time1: str, time2: str) -> bool:
        """
        判断time1是否早于或等于time2（DDHH格式时间比较）
        
        专门针对航空气象数据的时间比较，智能处理跨日和跨月情况
        支持5天内数据的完全覆盖，包括月末到月初的跨月场景
        
        设计原理：
        - 航空气象数据时间跨度通常在5天内
        - DDHH格式只包含日期和小时，不包含月份信息
        - 通过日期差值判断是否跨月：差值>15天认为是跨月
        - 15天阈值为5天内数据提供充足的安全边界
        
        覆盖能力：
        - 3天内数据：100%覆盖
        - 5天内数据：100%覆盖
        - 支持所有月末月初跨月场景（如本月28日-下月3日）
        
        Args:
            time1: DDHH格式时间字符串（如'0606'表示6日06时）
            time2: DDHH格式时间字符串（如'0611'表示6日11时）
            
        Returns:
            bool: True表示time1早于或等于time2，False表示time1晚于time2
            
        Examples:
            正常同月：'0606' vs '0611' → True (6日06时 <= 6日11时)
            正常跨日：'0523' vs '0611' → True (5日23时 <= 6日11时)
            跨月情况：'0106' vs '3023' → False (下月1日06时 > 本月30日23时)
            5天跨月：'2823' vs '0305' → True (本月28日23时 < 下月3日05时)
        """
        try:
            # 输入验证：确保时间格式正确
            if not time1 or not time2 or len(time1) != 4 or len(time2) != 4:
                return False
            
            # 解析DDHH格式：前两位是日期，后两位是小时
            day1, hour1 = int(time1[:2]), int(time1[2:4])
            day2, hour2 = int(time2[:2]), int(time2[2:4])
            
            # 核心算法：基于日期差值判断是否跨月
            # 计算两个日期的绝对差值
            day_diff = abs(day1 - day2)
            
            # 跨月判断逻辑：日期差值大于15天认为是跨月情况
            # 原理：5天内的数据不可能有超过15天的日期差，除非跨月
            # 15天阈值为5天内数据提供充足安全边界
            # 例如：本月30日 vs 下月1日，差值=29>15，判定为跨月
            if day_diff > 15:
                # 跨月情况处理：较小的日期数字对应下个月
                if day1 < day2:
                    # day1较小 → day1是下个月，day2是本月
                    # 例如：'0106'(下月1日) vs '3023'(本月30日)
                    # 实际时间关系：下月1日 > 本月30日 → 返回False
                    return False
                else:
                    # day2较小 → day2是下个月，day1是本月  
                    # 例如：'3023'(本月30日) vs '0106'(下月1日)
                    # 实际时间关系：本月30日 < 下月1日 → 返回True
                    return True
            else:
                # 同月情况处理：按正常日期时间顺序比较
                if day1 < day2:
                    # day1 < day2：不同日期，day1较早
                    return True
                elif day1 > day2:
                    # day1 > day2：不同日期，day1较晚
                    return False
                else:
                    # day1 == day2：同一天，比较小时
                    return hour1 <= hour2
                
        except Exception as e:
            # 异常处理：记录错误日志并返回False作为安全默认值
            logger.error(f"时间比较失败: {time1} vs {time2}, {str(e)}")
            return False
     
    def _calculate_becmg_interval_time_range(self, start_time: str, end_time: str,
                                           current_time: datetime) -> Optional[Dict]:
         """计算BECMG区间时间范围对应的time_[i]索引 - 不扩展告警裕度，使用统一的DDHH偏移算法"""
         try:
             if not start_time or not end_time or len(start_time) != 4 or len(end_time) != 4:
                 return None
             
             # 使用统一的DDHH偏移计算
             start_offset = self._calculate_ddhh_offset(start_time, current_time)
             end_offset = self._calculate_ddhh_offset(end_time, current_time)
             
             if start_offset is None or end_offset is None:
                 return None
             
             # 不扩展告警裕度 - 直接使用原始时间范围
             # 边界限制：time_0到time_47 (48小时范围)
             start_index = max(0, min(47, start_offset))
             end_index = max(0, min(47, end_offset))
             
             return {'start_index': start_index, 'end_index': end_index}
             
         except Exception as e:
             logger.error(f"计算BECMG区间时间范围失败: {str(e)}")
             return None
     
    def _apply_temperature_alerts(self, alert_results: List, margin: int, time_slots: List,
                                 taf: Dict, current_time: datetime, time_range: int):
        """应用温度告警"""
        temp_fields = [
            ('subject_max_temp1_time', 'subject_max_temp1_warning'),
            ('subject_max_temp2_time', 'subject_max_temp2_warning'),
            ('subject_min_temp1_time', 'subject_min_temp1_warning'),
            ('subject_min_temp2_time', 'subject_min_temp2_warning')
        ]
        
        for time_field, warning_field in temp_fields:
            temp_time = taf.get(time_field)
            temp_warning = taf.get(warning_field)
            
            if not temp_time or not temp_warning or temp_warning == 'N':
                continue
            
            # 计算温度时间范围：T - [margin] - 1 到 T + [margin]
            time_range_indices = self._calculate_temperature_extended_time_range(temp_time, margin, current_time)
            if time_range_indices is None:
                continue
            
            start_index = max(0, time_range_indices['start_index'])
            end_index = min(time_range - 1, time_range_indices['end_index'])
            
            # 检查范围内是否有航班
            has_flight_in_range = False
            for i in range(start_index, end_index + 1):
                flight_info = time_slots[i] if i < len(time_slots) else ''
                if self._has_flight(flight_info):
                    has_flight_in_range = True
                    break
            
            # 如果范围内有航班，应用温度告警到所有有航班的时段
            if has_flight_in_range:
                for i in range(start_index, end_index + 1):
                    flight_info = time_slots[i] if i < len(time_slots) else ''
                    if self._has_flight(flight_info):
                        # 应用更高优先级的告警
                        if self._is_higher_alert(temp_warning, alert_results[i]):
                            alert_results[i] = temp_warning
    
    def _calculate_flight_alert_level(self, time_slot_index: int, margin: int,
                                    taf_data: List, metar_data: List,
                                    flight_data: Dict, current_time: datetime) -> str:
        """计算航班告警级别 - 完整实现前端逻辑"""
        
        if not flight_data or not flight_data.get('time_slots'):
            return 'N'
        
        # 检查当前时段是否有航班
        flight_info = flight_data['time_slots'][time_slot_index] if time_slot_index < len(flight_data['time_slots']) else ''
        if not self._has_flight(flight_info):
            return 'N'
        
        alert_levels = []
        
        # 1. 实况告警判断
        metar_alert_level = self._calculate_metar_alert(time_slot_index, margin, metar_data, current_time)
        if metar_alert_level and metar_alert_level != 'N':
            alert_levels.append(metar_alert_level)
        
        # 2. 预报告警判断：检查主体预报和变化组
        if taf_data and len(taf_data) > 0:
            taf = taf_data[0]
            
            # 2.1 主体预报告警
            subject_alert_level = self._calculate_taf_subject_alert(time_slot_index, margin, taf, current_time)
            if subject_alert_level and subject_alert_level != 'N':
                alert_levels.append(subject_alert_level)
            
            # 2.2 变化组告警
            for i in range(1, 9):  # 1-8个变化组
                change_alert_level = self._calculate_taf_change_alert(time_slot_index, margin, taf, i, current_time)
                if change_alert_level and change_alert_level != 'N':
                    alert_levels.append(change_alert_level)
            
            # 3. 温度告警判断
            temp_alert_level = self._calculate_temperature_alert(time_slot_index, margin, taf, current_time)
            if temp_alert_level and temp_alert_level != 'N':
                alert_levels.append(temp_alert_level)
        
        return self._get_max_alert_from_list(alert_levels)
    
    def _calculate_metar_alert(self, time_slot_index: int, margin: int, 
                              metar_data: List, current_time: datetime) -> str:
        """1. 实况告警判断"""
        if not metar_data or len(metar_data) == 0:
            return 'N'
        
        # 实况有效时间范围：time_0 到 time_[margin]
        start_index = 0
        end_index = margin
        
        # 检查当前航班时段是否在实况影响范围内
        if time_slot_index >= start_index and time_slot_index <= end_index:
            latest_metar = metar_data[0]
            return latest_metar.get('metar_warning', 'N')
        
        return 'N'
    
    def _calculate_taf_subject_alert(self, time_slot_index: int, margin: int,
                                   taf: Dict, current_time: datetime) -> str:
        """2. 主体预报告警判断"""
        if not taf.get('subject_validity_period_start') or not taf.get('subject_validity_period_end'):
            return 'N'
        
        # 计算扩展后的时间范围对应的 time_[i]_flight 索引
        time_range = self._calculate_taf_time_range(
            taf['subject_validity_period_start'],
            taf['subject_validity_period_end'],
            margin,
            current_time
        )
        
        # TAF主体预报时间范围计算完成
        
        if time_range['start_index'] == -1 or time_range['end_index'] == -1:
            return 'N'
        
        # 检查当前航班时段是否在主体预报影响范围内
        if time_slot_index >= time_range['start_index'] and time_slot_index <= time_range['end_index']:
            return taf.get('subject_warning', 'N')
        
        return 'N'
    
    def _calculate_taf_change_alert(self, time_slot_index: int, margin: int,
                                  taf: Dict, change_index: int, current_time: datetime) -> str:
        """3. 变化组告警判断"""
        change_start = taf.get(f'change_{change_index}_validity_period_start')
        change_end = taf.get(f'change_{change_index}_validity_period_end')
        change_warning = taf.get(f'change_{change_index}_warning')
        
        if not change_start or not change_end or not change_warning:
            return 'N'
        
        # 计算扩展后的时间范围对应的 time_[i]_flight 索引
        time_range = self._calculate_taf_time_range(change_start, change_end, margin, current_time)
        
        if time_range['start_index'] == -1 or time_range['end_index'] == -1:
            return 'N'
        
        # 检查当前航班时段是否在变化组影响范围内
        if time_slot_index >= time_range['start_index'] and time_slot_index <= time_range['end_index']:
            return change_warning
        
        return 'N'
    
    def _calculate_temperature_alert(self, time_slot_index: int, margin: int,
                                   taf: Dict, current_time: datetime) -> str:
        """4. 温度告警判断"""
        temp_times = [
            {'time': taf.get('subject_max_temp1_time'), 'warning': taf.get('subject_max_temp1_warning')},
            {'time': taf.get('subject_max_temp2_time'), 'warning': taf.get('subject_max_temp2_warning')},
            {'time': taf.get('subject_min_temp1_time'), 'warning': taf.get('subject_min_temp1_warning')},
            {'time': taf.get('subject_min_temp2_time'), 'warning': taf.get('subject_min_temp2_warning')}
        ]
        
        alert_levels = []
        
        for temp in temp_times:
            if temp['time'] and temp['warning'] and temp['warning'] != 'N':
                # 计算温度时间扩展后的范围：T-[n]-1 到 T+[n]
                time_range = self._calculate_temperature_time_range(temp['time'], margin, current_time)
                
                if time_range['start_index'] != -1 and time_range['end_index'] != -1:
                    # 检查当前航班时段是否在温度影响范围内
                    if time_slot_index >= time_range['start_index'] and time_slot_index <= time_range['end_index']:
                        alert_levels.append(temp['warning'])
        
        return self._get_max_alert_from_list(alert_levels)
    
    def _calculate_ddhh_offset(self, time_str: str, current_time: datetime) -> Optional[int]:
        """
        计算DDHH格式时间相对当前时间的小时偏移 - 与前端calculateDDHHOffset完全一致
        
        专门针对航空气象数据的时间偏移计算，智能处理跨日和跨月情况
        支持5天内数据的完全覆盖，包括月末到月初的跨月场景
        
        Args:
            time_str: DDHH格式时间字符串（如'0606'表示6日06时）
            current_time: 当前UTC时间对象
            
        Returns:
            int: 相对当前时间的小时偏移，失败返回None
        """
        try:
            if not time_str or len(time_str) != 4:
                return None
            
            # 解析DDHH格式：前两位是日期，后两位是小时
            target_day = int(time_str[:2])
            target_hour = int(time_str[2:4])
            current_day = current_time.day
            current_hour = current_time.hour
            
            # 核心算法：基于日期差值判断是否跨月
            # 计算两个日期的绝对差值
            day_diff = abs(target_day - current_day)
            
            # 跨月判断逻辑：日期差值大于15天认为是跨月情况
            # 原理：5天内的数据不可能有超过15天的日期差，除非跨月
            # 15天阈值为5天内数据提供充足安全边界
            if day_diff > 15:
                # 跨月情况处理：较小的日期数字对应下个月
                if target_day < current_day:
                    # target是下个月：计算当前月剩余天数 + target天数
                    # 使用UTC时间确保一致性
                    from calendar import monthrange
                    current_month_days = monthrange(current_time.year, current_time.month)[1]
                    remaining_days = current_month_days - current_day
                    return (remaining_days + target_day) * 24 + (target_hour - current_hour)
                else:
                    # target是上个月：计算负偏移
                    prev_month = current_time.month - 1 if current_time.month > 1 else 12
                    prev_year = current_time.year if current_time.month > 1 else current_time.year - 1
                    prev_month_days = monthrange(prev_year, prev_month)[1]
                    target_to_month_end = prev_month_days - target_day
                    return -(target_to_month_end + current_day) * 24 + (target_hour - current_hour)
            else:
                # 同月情况处理：直接按日期差计算
                return (target_day - current_day) * 24 + (target_hour - current_hour)
                
        except Exception as e:
            logger.error(f"计算DDHH偏移失败: {time_str}, {str(e)}")
            return None

    def _calculate_extended_time_range(self, start_time: str, end_time: str,
                                      margin: int, current_time: datetime) -> Optional[Dict]:
        """计算扩展时间范围对应的time_[i]索引 - 使用统一的DDHH偏移算法"""
        try:
            if not start_time or not end_time or len(start_time) != 4 or len(end_time) != 4:
                return None
            
            # 使用统一的DDHH偏移计算
            start_offset = self._calculate_ddhh_offset(start_time, current_time)
            end_offset = self._calculate_ddhh_offset(end_time, current_time)
            
            if start_offset is None or end_offset is None:
                return None
            
            # 扩展时间范围：减去/加上告警裕度
            expanded_start_offset = start_offset - margin
            expanded_end_offset = end_offset + margin
            
            # 边界限制：time_0到time_47 (48小时范围)
            start_index = max(0, min(47, expanded_start_offset))
            end_index = max(0, min(47, expanded_end_offset))
            
            return {'start_index': start_index, 'end_index': end_index}
            
        except Exception as e:
            logger.error(f"计算扩展时间范围失败: {str(e)}")
            return None
    
    def _calculate_temperature_extended_time_range(self, temp_time: str, margin: int,
                                                  current_time: datetime) -> Optional[Dict]:
        """计算温度扩展时间范围：T - [margin] - 1 到 T + [margin] - 使用统一的DDHH偏移算法"""
        try:
            if not temp_time or len(temp_time) != 4:
                return None
            
            # 使用统一的DDHH偏移计算
            temp_offset = self._calculate_ddhh_offset(temp_time, current_time)
            
            if temp_offset is None:
                return None
            
            # 温度扩展范围：T - margin - 1 到 T + margin
            expanded_start_offset = temp_offset - margin - 1
            expanded_end_offset = temp_offset + margin
            
            # 边界限制：time_0到time_47 (48小时范围)
            start_index = max(0, min(47, expanded_start_offset))
            end_index = max(0, min(47, expanded_end_offset))
            
            return {'start_index': start_index, 'end_index': end_index}
            
        except Exception as e:
            logger.error(f"计算温度时间范围失败: {str(e)}")
            return None
    
    def _add_hours_to_ddhh(self, ddhh_time: str, hours: int) -> Optional[str]:
        """对DDHH格式时间进行小时加减运算，正确处理跨日"""
        try:
            if not ddhh_time or len(ddhh_time) != 4:
                return None
            
            day = int(ddhh_time[:2])
            hour = int(ddhh_time[2:4])
            
            # 加上小时数
            total_hours = hour + hours
            
            # 处理跨日情况
            while total_hours < 0:
                total_hours += 24
                day -= 1
            
            while total_hours >= 24:
                total_hours -= 24
                day += 1
            
            # 处理跨月情况（简单处理，假设1-31日）
            if day < 1:
                day = 31  # 简化处理，实际应该根据月份判断
            elif day > 31:
                day = 1   # 简化处理，实际应该根据月份判断
            
            # 格式化返回
            return f"{day:02d}{total_hours:02d}"
            
        except Exception as e:
            logger.error(f"DDHH时间运算失败: {ddhh_time} + {hours}小时, {str(e)}")
            return None
    
    def _calculate_temperature_time_range(self, temp_time: str, margin: int, 
                                        current_time: datetime) -> Dict:
        """计算温度时间扩展后的范围：T-[n]-1 到 T+[n]"""
        try:
            temp_dt = self._parse_taf_time(temp_time, current_time)
            if not temp_dt:
                return {'start_index': -1, 'end_index': -1}
            
            # 温度告警的特殊扩展规则：T-[margin]-1 到 T+[margin]
            extended_start = temp_dt - timedelta(hours=margin + 1)
            extended_end = temp_dt + timedelta(hours=margin)
            
            start_index = self._time_to_index(extended_start, current_time)
            end_index = self._time_to_index(extended_end, current_time)
            
            return {'start_index': start_index, 'end_index': end_index}
            
        except Exception as e:
            logger.error(f"计算温度时间范围失败: {str(e)}")
            return {'start_index': -1, 'end_index': -1}
    
    def _parse_taf_time(self, taf_time: str, current_time: datetime) -> Optional[datetime]:
        """解析TAF时间格式 (DDHH 或 DDHHMM)"""
        try:
            if not taf_time:
                return None
            
            # 支持4位(DDHH)和6位(DDHHMM)格式
            if len(taf_time) == 4:
                day = int(taf_time[:2])
                hour = int(taf_time[2:4])
                minute = 0
            elif len(taf_time) == 6:
                day = int(taf_time[:2])
                hour = int(taf_time[2:4])
                minute = int(taf_time[4:6])
            else:
                return None
            
            # 构造完整的datetime对象
            target_dt = current_time.replace(day=day, hour=hour, minute=minute, second=0, microsecond=0)
            
            # 处理跨月情况 - 选择距离当前时间最近的月份
            # 考虑上个月、当前月、下个月三种情况
            current_month = current_time.replace(day=day, hour=hour, minute=minute, second=0, microsecond=0)
            
            # 上个月
            if current_month.month == 1:
                prev_month = current_month.replace(year=current_month.year - 1, month=12)
            else:
                prev_month = current_month.replace(month=current_month.month - 1)
            
            # 下个月
            if current_month.month == 12:
                next_month = current_month.replace(year=current_month.year + 1, month=1)
            else:
                next_month = current_month.replace(month=current_month.month + 1)
            
            # 计算三个时间点到当前时间的距离
            current_diff = abs((current_month - current_time).total_seconds())
            prev_diff = abs((prev_month - current_time).total_seconds())
            next_diff = abs((next_month - current_time).total_seconds())
            
            # 选择距离最近的时间
            if prev_diff <= current_diff and prev_diff <= next_diff:
                target_dt = prev_month
            elif next_diff <= current_diff and next_diff <= prev_diff:
                target_dt = next_month
            else:
                target_dt = current_month
            
            return target_dt
            
        except Exception as e:
            logger.error(f"解析TAF时间失败: {taf_time}, {str(e)}")
            return None
    
    def _time_to_index(self, target_time: datetime, current_time: datetime) -> int:
        """将时间转换为time_[i]索引"""
        try:
            # 计算时间差（小时）
            time_diff = (target_time - current_time).total_seconds() / 3600
            
            # 转换为索引（向下取整）
            index = int(time_diff)
            
            # 确保索引在有效范围内
            if index < 0:
                return 0
            elif index >= 48:  # 最大支持48小时
                return 47
            else:
                return index
                
        except Exception as e:
            logger.error(f"时间转换索引失败: {str(e)}")
            return -1
    
    def _has_flight(self, flight_info: str) -> bool:
        """检查是否有航班"""
        if not flight_info:
            return False
        
        flight_info = str(flight_info).strip()
        return flight_info != '' and flight_info.lower() not in ['none', 'null']
    
    def _is_higher_alert(self, alert1: str, alert2: str) -> bool:
        """比较告警等级优先级：R > Y > G > N"""
        priority = {'R': 4, 'Y': 3, 'G': 2, 'N': 1}
        return priority.get(alert1, 1) > priority.get(alert2, 1)
    
    def _get_max_alert_from_list(self, alerts: List[str]) -> str:
        """从告警级别列表中获取最高级别"""
        if not alerts or len(alerts) == 0:
            return 'N'
        
        max_alert = 'N'
        for alert in alerts:
            if self._is_higher_alert(alert, max_alert):
                max_alert = alert
        
        return max_alert
    
    def _get_current_time(self) -> datetime:
        """获取当前时间"""
        if self.time_mode == 'current':
            return TimeManager.get_current_time_utc('current')
        else:
            return TimeManager.get_current_time_utc('test')
    
    def _get_empty_alerts(self) -> Dict:
        """获取空的告警结果"""
        empty_alerts = {}
        for margin in range(5):
            empty_alerts[f'margin_{margin}'] = {
                'highest_alert': 'N',
                'time_slots': ['N'] * 48  # 默认48个时段
            }
        return empty_alerts
