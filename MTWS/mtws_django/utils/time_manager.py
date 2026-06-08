"""
统一时间管理器
处理不同时间模式和时区转换
"""

from datetime import datetime, timedelta, timezone as dt_timezone
from django.conf import settings
from django.utils import timezone
import logging

logger = logging.getLogger('mtws.utils')


class TimeManager:
    """统一时间管理器"""
    
    @staticmethod
    def get_test_time_utc():
        """
        获取测试模式的UTC时间
        
        Returns:
            datetime: UTC时间对象（aware datetime）
        """
        try:
            time_str = settings.MTWS_CONFIG['TIME_MODES']['test']['fixed_time_utc']
            naive_dt = datetime.fromisoformat(time_str)
            # 将 naive datetime 转换为 aware datetime（UTC时区）
            return naive_dt.replace(tzinfo=dt_timezone.utc)
        except (KeyError, ValueError) as e:
            logger.error(f"获取测试时间配置失败: {e}")
            # 返回默认测试时间（aware datetime）
            naive_dt = datetime(2025, 5, 10, 3, 25, 0)
            return naive_dt.replace(tzinfo=dt_timezone.utc)
    
    @staticmethod
    def get_test_time_beijing():
        """
        获取测试模式的北京时间
        
        Returns:
            datetime: 北京时间对象（naive datetime）
        """
        utc_time = TimeManager.get_test_time_utc()
        beijing_time = utc_time + timedelta(hours=8)
        # 移除时区信息，返回 naive datetime（与 datetime.now() 一致）
        return beijing_time.replace(tzinfo=None)
    
    @staticmethod
    def get_current_time_utc(time_mode='current'):
        """
        根据时间模式获取UTC时间
        
        Args:
            time_mode: 时间模式，'current' 或 'test'
            
        Returns:
            datetime: UTC时间对象（aware datetime）
        """
        if time_mode == 'test':
            return TimeManager.get_test_time_utc()
        else:
            return timezone.now()
    
    @staticmethod
    def get_current_time_beijing(time_mode='current'):
        """
        根据时间模式获取北京时间
        
        Args:
            time_mode: 时间模式，'current' 或 'test'
            
        Returns:
            datetime: 北京时间对象
        """
        if time_mode == 'test':
            return TimeManager.get_test_time_beijing()
        else:
            return datetime.now()
    
    @staticmethod
    def get_current_time_local(time_mode='current'):
        """
        根据时间模式获取本地时间（与get_current_time_beijing相同）
        
        Args:
            time_mode: 时间模式，'current' 或 'test'
            
        Returns:
            datetime: 本地时间对象
        """
        return TimeManager.get_current_time_beijing(time_mode)
    
    @staticmethod
    def get_test_time_timestamp():
        """
        获取测试时间的时间戳（毫秒）
        
        Returns:
            int: 时间戳（毫秒）
        """
        utc_time = TimeManager.get_test_time_utc()
        return int(utc_time.timestamp() * 1000)
    
    @staticmethod
    def get_test_time_iso_string():
        """
        获取测试时间的ISO字符串格式（用于前端）
        
        Returns:
            str: ISO格式时间字符串
        """
        utc_time = TimeManager.get_test_time_utc()
        return utc_time.strftime('%Y-%m-%dT%H:%M:%SZ')

