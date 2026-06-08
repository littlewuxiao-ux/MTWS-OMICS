"""
弹窗工具类
处理实况弹窗的判断和数据写入逻辑
"""

import json
import logging
from typing import Dict, List, Optional, Tuple
from django.conf import settings
from django.utils import timezone
from django.db.models import Max

from core.models import PopupSettings, AirportInfo, AircraftParkingInfo, WeatherTypeInfo
from parsers.models import Metar, Flight

logger = logging.getLogger('mtws.popup')


class PopupManager:
    """弹窗管理器"""
    
    # 告警等级优先级
    ALERT_PRIORITY = {'R': 4, 'Y': 3, 'G': 2, 'N': 1}
    
    def __init__(self, user_code: str, time_mode: str = 'current'):
        """
        初始化弹窗管理器
        
        Args:
            user_code: 用户代码
            time_mode: 时间模式
        """
        self.user_code = user_code
        self.time_mode = time_mode
        self.settings = self._load_popup_settings()
        self.parking_weather_types = settings.MTWS_CONFIG['POPUP_CONFIG']['PARKING_WEATHER_TYPES']
        self.popup_validity_hours = settings.MTWS_CONFIG['POPUP_CONFIG']['POPUP_VALIDITY_HOURS']
    
    def _load_popup_settings(self) -> Optional[PopupSettings]:
        """
        加载弹窗配置
        
        Returns:
            PopupSettings对象或None
        """
        try:
            # 根据时间模式确定user_code
            if self.time_mode == 'test':
                lookup_user_code = 'test'
            else:
                lookup_user_code = self.user_code
            
            # 查询用户配置
            popup_settings = PopupSettings.objects.filter(user_code=lookup_user_code).first()
            
            # 如果没有用户配置，使用default配置
            if not popup_settings:
                popup_settings = PopupSettings.objects.filter(user_code='default').first()
            
            return popup_settings
        except Exception as e:
            logger.error(f"加载弹窗配置失败: {e}")
            return None
    
    @staticmethod
    def _check_alert_level(actual_level: str, required_level: str) -> bool:
        """
        检查告警等级是否满足要求
        
        Args:
            actual_level: 实际告警等级
            required_level: 要求的告警等级
            
        Returns:
            是否满足要求
        """
        actual_priority = PopupManager.ALERT_PRIORITY.get(actual_level, 0)
        required_priority = PopupManager.ALERT_PRIORITY.get(required_level, 0)
        return actual_priority >= required_priority
    
    def _check_operation_metar_alert(self, metar: Metar, required_level: str) -> bool:
        """
        检查运行类METAR告警条件
        
        Args:
            metar: METAR对象
            required_level: 要求的告警等级
            
        Returns:
            是否满足告警条件
        """
        # 检查各项告警等级
        alert_fields = [
            metar.metar_wind_warning,
            metar.metar_visibility_warning,
            metar.metar_cloud_warning,
            metar.metar_temperature_warning,
            metar.metar_change_trend_warning,
            metar.metar_rvr_warning,
        ]
        
        for alert_level in alert_fields:
            if alert_level and self._check_alert_level(alert_level, required_level):
                return True
        
        # 检查天气类型告警
        if metar.metar_weather_type:
            try:
                weather_types = json.loads(metar.metar_weather_type) if isinstance(metar.metar_weather_type, str) else metar.metar_weather_type
                for weather_code, alert_level in weather_types.items():
                    if self._check_alert_level(alert_level, required_level):
                        return True
            except Exception as e:
                logger.warning(f"解析天气类型告警失败: {e}")
        
        return False
    
    def _check_operation_time_condition(self, metar: Metar, threshold_hours: int) -> bool:
        """
        检查运行类时间条件
        
        Args:
            metar: METAR对象
            threshold_hours: 时间阈值(小时)
            
        Returns:
            是否满足时间条件
        """
        try:
            # 查询对应机场的flight记录
            flight = Flight.objects.filter(airport_4code=metar.airport_4code).first()
            
            if not flight:
                return False
            
            # 获取最小起飞时间
            min_departure_time = min(
                flight.closest_departure_time_of_arriving_flight or float('inf'),
                flight.closest_departure_time_at_this_airport or float('inf')
            )
            
            if min_departure_time == float('inf'):
                return False
            
            # 计算时间差（取绝对值）
            time_diff = abs(metar.metar_observation_time - min_departure_time)
            threshold_ms = threshold_hours * 3600000
            
            return time_diff <= threshold_ms
            
        except Exception as e:
            logger.error(f"检查时间条件失败: {e}")
            return False
    
    def _check_parking_metar_alert(self, metar: Metar, required_level: str) -> bool:
        """
        检查停场类METAR告警条件
        
        Args:
            metar: METAR对象
            required_level: 要求的告警等级
            
        Returns:
            是否满足告警条件
        """
        # 检查风告警
        if metar.metar_wind_warning and self._check_alert_level(metar.metar_wind_warning, required_level):
            return True
        
        # 检查温度告警(仅当温度<-20时)
        if metar.metar_temperature is not None and metar.metar_temperature < -20:
            if metar.metar_temperature_warning and self._check_alert_level(metar.metar_temperature_warning, required_level):
                return True
        
        # 检查特定天气类型告警
        if metar.metar_weather_type:
            try:
                weather_types = json.loads(metar.metar_weather_type) if isinstance(metar.metar_weather_type, str) else metar.metar_weather_type
                for weather_code, alert_level in weather_types.items():
                    if weather_code in self.parking_weather_types:
                        if self._check_alert_level(alert_level, required_level):
                            return True
            except Exception as e:
                logger.warning(f"解析天气类型告警失败: {e}")
        
        return False
    
    @staticmethod
    def _check_parking_condition(airport_4code: str) -> bool:
        """
        检查停场条件
        
        Args:
            airport_4code: 机场四字代码
            
        Returns:
            是否满足停场条件
        """
        try:
            # 获取最新的停场信息
            latest_parking = AircraftParkingInfo.objects.order_by('-parse_time').first()
            
            if not latest_parking:
                return False
            
            # 解析机场列表
            parking_airports = json.loads(latest_parking.airport_4code) if isinstance(latest_parking.airport_4code, str) else latest_parking.airport_4code
            
            return airport_4code in parking_airports
            
        except Exception as e:
            logger.error(f"检查停场条件失败: {e}")
            return False
    
    def check_popup_conditions(self, metar: Metar) -> Tuple[bool, str]:
        """
        检查是否需要弹窗
        
        Args:
            metar: METAR对象
            
        Returns:
            (是否弹窗, 弹窗类型: 'operation'/'parking'/'both')
        """
        if not self.settings:
            return False, ''
        
        operation_popup = False
        parking_popup = False
        
        # 获取flight数据
        flight = Flight.objects.filter(airport_4code=metar.airport_4code).first()
        en_route = bool(flight.en_route) if flight else False
        
        # 检查运行类弹窗：告警 AND (时间 OR en_route)
        if self.settings.operation_metar_popup:
            alert_met = self._check_operation_metar_alert(metar, self.settings.operation_metar_popup_level)
            time_met = self._check_operation_time_condition(metar, self.settings.operation_metar_popup_leeway)
            if alert_met and (time_met or en_route):
                operation_popup = True
        
        # 检查停场类弹窗：告警 AND (停场 OR en_route)
        if self.settings.parking_metar_popup:
            alert_met = self._check_parking_metar_alert(metar, self.settings.parking_metar_popup_level)
            parking_met = self._check_parking_condition(metar.airport_4code)
            if alert_met and (parking_met or en_route):
                parking_popup = True
        
        # 确定弹窗类型
        if operation_popup and parking_popup:
            return True, 'both'
        elif operation_popup:
            return True, 'operation'
        elif parking_popup:
            return True, 'parking'
        else:
            return False, ''
    
    def get_pending_popups(self) -> List[Dict]:
        """
        获取未处理的弹窗列表
        
        Returns:
            弹窗数据列表
        """
        try:
            from utils.time_manager import TimeManager
            
            # 查询popup为Y且popup_handle_time为空的记录
            popups = Metar.objects.filter(
                popup='Y',
                popup_handle_time__isnull=True
            ).order_by('-metar_observation_time')
            
            # 获取当前时间戳（毫秒）
            current_time_utc = TimeManager.get_current_time_utc(self.time_mode)
            current_time_ms = int(current_time_utc.timestamp() * 1000)
            
            # 计算弹窗有效期阈值（毫秒）
            validity_threshold_ms = self.popup_validity_hours * 3600000
            
            result = []
            for metar in popups:
                # 判断弹窗时间是否在有效期内
                if metar.popup_time:
                    time_diff = current_time_ms - metar.popup_time
                    if time_diff > validity_threshold_ms:
                        # 超过有效期，跳过该弹窗
                        continue
                # 获取机场信息
                airport_info = AirportInfo.objects.filter(airport_4code=metar.airport_4code).first()
                
                # 获取航班信息
                flight = Flight.objects.filter(airport_4code=metar.airport_4code).first()
                en_route = bool(flight.en_route) if flight else False
                closest_departure_time_of_arriving_flight = flight.closest_departure_time_of_arriving_flight if flight else None
                closest_landing_time_of_arriving_flight = flight.closest_landing_time_of_arriving_flight if flight else None
                closest_departure_time_at_this_airport = flight.closest_departure_time_at_this_airport if flight else None
                
                # 获取停场信息
                has_parking = False
                latest_parking = AircraftParkingInfo.objects.order_by('-parse_time').first()
                if latest_parking and latest_parking.airport_4code:
                    parking_list = latest_parking.airport_4code
                    if isinstance(parking_list, str):
                        parking_list = json.loads(parking_list)
                    has_parking = (metar.airport_4code in parking_list)
                
                # 解析天气类型数据，添加中文名称
                metar_weather_type = {}
                metar_weather_type_cn = {}
                if metar.metar_weather_type:
                    try:
                        if isinstance(metar.metar_weather_type, str):
                            metar_weather_type = json.loads(metar.metar_weather_type)
                        else:
                            metar_weather_type = metar.metar_weather_type
                        
                        # 获取天气类型中文名称
                        for weather_code, alert_level in metar_weather_type.items():
                            weather_info = WeatherTypeInfo.objects.filter(weather_type_code=weather_code).first()
                            if weather_info:
                                metar_weather_type_cn[weather_code] = {
                                    'alert_level': alert_level,
                                    'cn_name': weather_info.description_cn or weather_code
                                }
                    except:
                        metar_weather_type = {}
                        metar_weather_type_cn = {}
                
                # 获取该机场过去72小时的历史METAR数据（用于图表显示）
                metar_data = []
                history_start_time = metar.metar_observation_time - 72 * 3600000  # 72小时前
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
                    'metar_warning': metar.metar_warning or 'N',
                    'metar_wind_warning': metar.metar_wind_warning or 'N',
                    'metar_visibility_warning': metar.metar_visibility_warning or 'N',
                    'metar_rvr_warning': metar.metar_rvr_warning or 'N',
                    'metar_cloud_warning': metar.metar_cloud_warning or 'N',
                    'metar_temperature_warning': metar.metar_temperature_warning or 'N',
                    'metar_ws_warning': metar.metar_ws_warning or 'N',
                    'metar_change_trend_warning': metar.metar_change_trend_warning or 'N',
                    'metar_weather_type': metar_weather_type_cn,
                    'metar_data': metar_data,  # 添加历史数据
                }
                result.append(popup_data)
            
            return result
            
        except Exception as e:
            logger.error(f"获取弹窗列表失败: {e}")
            return []
    
    @staticmethod
    def handle_popup_received(sqc: int, user_code: str = None) -> bool:
        """
        处理弹窗收到操作
        
        Args:
            sqc: METAR的sqc值
            user_code: 处理用户代码
            
        Returns:
            是否处理成功
        """
        try:
            # 更新metar表的popup_handle_time, handling_user_code, handling_method
            current_time_ms = int(timezone.now().timestamp() * 1000)
            
            updated_count = Metar.objects.filter(sqc=sqc).update(
                popup_handle_time=current_time_ms,
                handling_user_code=user_code,
                handling_method='handle'
            )
            
            if updated_count > 0:
                logger.info(f"弹窗已处理: sqc={sqc}, popup_handle_time={current_time_ms}, handling_user_code={user_code}")
                return True
            else:
                logger.warning(f"未找到对应的弹窗记录: sqc={sqc}")
                return False
                
        except Exception as e:
            logger.error(f"处理弹窗收到操作失败: {e}")
            return False
    
    @staticmethod
    def handle_popup_batch_ignore(sqc_list: list, user_code: str = None) -> bool:
        """
        批量忽略弹窗
        
        Args:
            sqc_list: METAR的sqc列表
            user_code: 处理用户代码
            
        Returns:
            是否处理成功
        """
        try:
            if not sqc_list:
                return False
            
            current_time_ms = int(timezone.now().timestamp() * 1000)
            
            # 批量更新
            updated_count = Metar.objects.filter(sqc__in=sqc_list).update(
                popup_handle_time=current_time_ms,
                handling_user_code=user_code,
                handling_method='ignore'
            )
            
            logger.info(f"批量忽略弹窗: 更新{updated_count}条记录, User={user_code}")
            return True
            
        except Exception as e:
            logger.error(f"批量忽略弹窗失败: {e}")
            return False
    
    @staticmethod
    def handle_popup_batch_received(sqc_list: list, user_code: str = None) -> bool:
        """
        批量处理弹窗（收到/去处理）
        
        Args:
            sqc_list: METAR的sqc列表
            user_code: 处理用户代码
            
        Returns:
            是否处理成功
        """
        try:
            if not sqc_list:
                return False
            
            current_time_ms = int(timezone.now().timestamp() * 1000)
            
            # 批量更新
            updated_count = Metar.objects.filter(sqc__in=sqc_list).update(
                popup_handle_time=current_time_ms,
                handling_user_code=user_code,
                handling_method='handle'
            )
            
            logger.info(f"批量处理弹窗: 更新{updated_count}条记录, User={user_code}")
            return True
            
        except Exception as e:
            logger.error(f"批量处理弹窗失败: {e}")
            return False
