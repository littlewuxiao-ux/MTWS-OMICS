"""
核心数据模型
包括机场信息、告警配置、航空公司等基础数据表
"""

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator



class AirportInfo(models.Model):
    """机场信息表"""
    
    airport_4code = models.CharField(max_length=4, primary_key=True, verbose_name='机场四字代码')
    airport_3code = models.CharField(max_length=3, blank=True, null=True, verbose_name='机场三字代码')
    airport_name = models.CharField(max_length=100, blank=True, null=True, verbose_name='机场名称')
    classification = models.CharField(max_length=50, blank=True, null=True, verbose_name='性质')
    
    # 区域信息
    area = models.CharField(max_length=20, blank=True, null=True, verbose_name='区域')
    area_code = models.CharField(max_length=10, blank=True, null=True, verbose_name='区号')
    
    # 联系方式
    forecast_phone = models.CharField(max_length=100, blank=True, null=True, verbose_name='预报电话')
    observation_phone = models.CharField(max_length=100, blank=True, null=True, verbose_name='观测电话')
    other_phone = models.CharField(max_length=100, blank=True, null=True, verbose_name='其他电话')
    
    # TAF相关配置字段
    taf_init_time = models.SmallIntegerField(default=1, verbose_name='TAF初始时间')
    import_check_interval = models.SmallIntegerField(default=20, verbose_name='TAF平均延迟')
    taf_max_delay = models.SmallIntegerField(blank=True, null=True, default=30, verbose_name='TAF最大延迟')
    
    # 预留字段
    extraInfo4 = models.TextField(blank=True, null=True, verbose_name='预留字段4')
    extraInfo5 = models.TextField(blank=True, null=True, verbose_name='预留字段5')
    extraInfo6 = models.TextField(blank=True, null=True, verbose_name='预留字段6')
    
    # 修订历史
    revision_history = models.TextField(blank=True, null=True, verbose_name='修订历史')
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    class Meta:
        db_table = 'airport_info'
        verbose_name = '机场信息'
        verbose_name_plural = '机场信息'
        
    def __str__(self):
        return f"{self.airport_4code} - {self.airport_name or '未知机场'}"


class AirportAlertThresholds(models.Model):
    """机场告警阈值表"""
    
    airport_4code = models.CharField(max_length=4, primary_key=True, verbose_name='机场四字代码')
    
    # 能见度告警阈值（单位：米）
    visibility_m_red = models.PositiveIntegerField(default=800, verbose_name='能见度红色告警值')
    visibility_m_yellow = models.PositiveIntegerField(default=1600, verbose_name='能见度黄色告警值')
    visibility_m_green = models.PositiveIntegerField(default=2000, verbose_name='能见度绿色告警值')
    
    # RVR告警阈值（单位：米）
    rvr_m_red = models.PositiveIntegerField(blank=True, null=True, verbose_name='RVR红色告警值')
    rvr_m_yellow = models.PositiveIntegerField(blank=True, null=True, verbose_name='RVR黄色告警值')
    rvr_m_green = models.PositiveIntegerField(blank=True, null=True, verbose_name='RVR绿色告警值')
    
    # 云高告警阈值（单位：百英尺）
    cloud_min_red = models.PositiveIntegerField(default=2, verbose_name='云高红色告警值')
    cloud_min_yellow = models.PositiveIntegerField(default=5, verbose_name='云高黄色告警值')
    cloud_min_green = models.PositiveIntegerField(default=10, verbose_name='云高绿色告警值')
    
    # 平均风速告警阈值（单位：米/秒）
    average_wind_speed_mps_red = models.PositiveIntegerField(default=12, verbose_name='平均风红色告警值')
    average_wind_speed_mps_yellow = models.PositiveIntegerField(default=8, verbose_name='平均风黄色告警值')
    average_wind_speed_mps_green = models.PositiveIntegerField(default=5, verbose_name='平均风绿色告警值')
    
    # 阵风告警阈值（单位：米/秒）
    gust_mps_red = models.PositiveIntegerField(default=17, verbose_name='阵风红色告警值')
    gust_mps_yellow = models.PositiveIntegerField(default=13, verbose_name='阵风黄色告警值')
    gust_mps_green = models.PositiveIntegerField(default=10, verbose_name='阵风绿色告警值')
    
    # 温度告警阈值（单位：摄氏度）
    temperature_cold_red = models.IntegerField(default=-30, verbose_name='低温红色告警值')
    temperature_cold_yellow = models.IntegerField(default=-27, verbose_name='低温黄色告警值')
    temperature_cold_green = models.IntegerField(default=-25, verbose_name='低温绿色告警值')
    temperature_hot_red = models.PositiveIntegerField(default=40, verbose_name='高温红色告警值')
    temperature_hot_yellow = models.PositiveIntegerField(default=37, verbose_name='高温黄色告警值')
    temperature_hot_green = models.PositiveIntegerField(default=35, verbose_name='高温绿色告警值')
    
    # 跑道视程告警阈值（单位：米）
    rvr_m_red = models.PositiveIntegerField(blank=True, null=True, verbose_name='RVR红色告警值')
    rvr_m_yellow = models.PositiveIntegerField(blank=True, null=True, verbose_name='RVR黄色告警值')
    rvr_m_green = models.PositiveIntegerField(blank=True, null=True, verbose_name='RVR绿色告警值')
    
    # 修订历史
    revision_history = models.TextField(blank=True, null=True, verbose_name='修订历史')
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    class Meta:
        db_table = 'airport_alert_thresholds'
        verbose_name = '机场告警阈值'
        verbose_name_plural = '机场告警阈值'
        
    def __str__(self):
        return f"{self.airport_4code} - 告警阈值"


class AreaOptions(models.Model):
    """区域选项表"""
    
    id = models.AutoField(primary_key=True, verbose_name='ID')
    classification = models.CharField(max_length=10, verbose_name='分类')
    sequence = models.PositiveIntegerField(verbose_name='排序')
    area = models.CharField(max_length=20, verbose_name='区域名称')
    
    class Meta:
        db_table = 'area_options'
        verbose_name = '区域选项'
        verbose_name_plural = '区域选项'
        ordering = ['classification', 'sequence']
        
    def __str__(self):
        return f"{self.classification} - {self.area}"


class WeatherAlertLevels(models.Model):
    """天气现象告警等级表"""
    
    ALERT_LEVEL_CHOICES = [
        ('R', '红色告警'),
        ('Y', '黄色告警'),
        ('G', '绿色告警'),
    ]
    
    weather = models.CharField(max_length=20, verbose_name='天气现象代码')
    alert_level = models.CharField(max_length=1, choices=ALERT_LEVEL_CHOICES, verbose_name='告警等级')
    type1 = models.CharField(max_length=1, blank=True, null=True, verbose_name='天气类型1')
    type2 = models.CharField(max_length=1, blank=True, null=True, verbose_name='天气类型2')
    type3 = models.CharField(max_length=1, blank=True, null=True, verbose_name='天气类型3')
    description = models.CharField(max_length=100, blank=True, null=True, verbose_name='描述')
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    class Meta:
        db_table = 'weather_alert_levels'
        verbose_name = '天气现象告警等级'
        verbose_name_plural = '天气现象告警等级'
        unique_together = [['weather', 'alert_level']]  # 同一天气现象不能有重复的告警等级
        
    def __str__(self):
        return f"{self.weather} - {self.get_alert_level_display()}"


class Carrier(models.Model):
    """航空公司信息表"""
    
    carrier_code = models.CharField(max_length=2, unique=True, verbose_name='航空公司二字代码')
    carrier_name = models.CharField(max_length=100, blank=True, null=True, verbose_name='航空公司名称')
    is_active = models.BooleanField(default=True, verbose_name='是否启用')
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    class Meta:
        db_table = 'carrier'
        verbose_name = '航空公司'
        verbose_name_plural = '航空公司'
        
    def __str__(self):
        return f"{self.carrier_code} - {self.carrier_name or '未知航空公司'}"


class SystemConfig(models.Model):
    """系统配置表"""
    
    CONFIG_TYPE_CHOICES = [
        ('data_retention', '数据保留配置'),
        ('auto_refresh', '自动刷新配置'),
        ('data_source', '数据源配置'),
    ]
    
    config_type = models.CharField(max_length=20, choices=CONFIG_TYPE_CHOICES, verbose_name='配置类型')
    config_key = models.CharField(max_length=50, verbose_name='配置键')
    config_value = models.TextField(verbose_name='配置值')
    description = models.CharField(max_length=200, blank=True, null=True, verbose_name='描述')
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    class Meta:
        db_table = 'system_config'
        verbose_name = '系统配置'
        verbose_name_plural = '系统配置'
        unique_together = [['config_type', 'config_key']]
        
    def __str__(self):
        return f"{self.get_config_type_display()} - {self.config_key}"


class DataRefreshTimer(models.Model):
    """数据刷新定时器配置表"""
    
    DATA_TYPE_CHOICES = [
        ('metar', '实况数据'),
        ('taf', '预报数据'),
        ('flight', '航班数据'),
    ]
    
    data = models.CharField(max_length=10, choices=DATA_TYPE_CHOICES, unique=True, verbose_name='数据类型')
    init_time = models.FloatField(verbose_name='起始时间(分钟)', help_text='支持小数，如2.5表示2分30秒')
    interval = models.FloatField(verbose_name='更新间隔(分钟)', help_text='支持小数，如2.5表示每2分30秒更新一次')
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    class Meta:
        db_table = 'data_refresh_timer'
        verbose_name = '数据刷新定时器配置'
        verbose_name_plural = '数据刷新定时器配置'
        
    def __str__(self):
        return f"{self.get_data_display()} - 起始:{self.init_time}分 间隔:{self.interval}分"



class AircraftParkingInfo(models.Model):
    """飞机停场信息表"""
    
    airport_4code = models.JSONField(verbose_name='停场机场列表', help_text='存储有飞机停场的机场代码列表')
    parse_time = models.BigIntegerField(blank=True, null=True, verbose_name='解析时间戳')
    
    class Meta:
        db_table = 'aircraft_parking_info'
        verbose_name = '飞机停场信息'
        verbose_name_plural = '飞机停场信息'
        ordering = ['-parse_time']  # 按解析时间倒序排列
        indexes = [
            models.Index(fields=['airport_4code']),
            models.Index(fields=['parse_time']),
            models.Index(fields=['airport_4code', 'parse_time']),  # 复合索引
        ]
    
    def __str__(self):
        return f"{self.airport_4code} - {self.parse_time}"


class PopupSettings(models.Model):
    """弹窗设置表"""
    
    user_code = models.CharField(max_length=12, unique=True, verbose_name='用户代码')
    
    # 运行区弹窗开关（布尔值）
    operation_metar_popup = models.BooleanField(default=False, verbose_name='运行区METAR弹窗')
    operation_taf_popup = models.BooleanField(default=False, verbose_name='运行区TAF弹窗')
    operation_NWP_popup = models.BooleanField(default=False, verbose_name='运行区NWP弹窗')
    
    # 停场区弹窗开关（布尔值）
    parking_metar_popup = models.BooleanField(default=False, verbose_name='停场METAR弹窗')
    parking_taf_popup_other = models.BooleanField(default=False, verbose_name='停场TAF弹窗其他')
    parking_NWP_popup = models.BooleanField(default=False, verbose_name='停场NWP弹窗')
    
    # 运行区告警余量（2位整数）
    operation_metar_popup_leeway = models.IntegerField(blank=True, null=True, verbose_name='运行区METAR弹窗余量')
    operation_taf_popup_leeway = models.IntegerField(blank=True, null=True, verbose_name='运行区TAF弹窗余量')
    operation_NWP_popup_leeway = models.IntegerField(blank=True, null=True, verbose_name='运行区NWP弹窗余量')
    
    # 弹窗级别（1位英文字符）
    operation_metar_popup_level = models.CharField(max_length=1, blank=True, null=True, verbose_name='运行区METAR弹窗级别')
    operation_taf_popup_level = models.CharField(max_length=1, blank=True, null=True, verbose_name='运行区TAF弹窗级别')
    operation_NWP_popup_level = models.CharField(max_length=1, blank=True, null=True, verbose_name='运行区NWP弹窗级别')
    parking_metar_popup_level = models.CharField(max_length=1, blank=True, null=True, verbose_name='停场METAR弹窗级别')
    parking_taf_popup_level = models.CharField(max_length=1, blank=True, null=True, verbose_name='停场TAF弹窗级别')
    parking_NWP_popup_level = models.CharField(max_length=1, blank=True, null=True, verbose_name='停场NWP弹窗级别')
    
    # 拦截标识（1位英文字符）
    intercept = models.CharField(max_length=1, blank=True, null=True, verbose_name='拦截标识')
    
    class Meta:
        db_table = 'popup_settings'
        verbose_name = '弹窗设置'
        verbose_name_plural = '弹窗设置'
    
    def __str__(self):
        return f"{self.user_code} - 弹窗设置"


class WeatherTypeInfo(models.Model):
    """天气类型信息表"""
    
    weather_type_code = models.CharField(max_length=1, verbose_name='天气类型代码')
    description_cn = models.CharField(max_length=10, blank=True, null=True, verbose_name='中文说明')
    description_en = models.CharField(max_length=20, blank=True, null=True, verbose_name='英文说明')
    
    class Meta:
        db_table = 'weather_type_info'
        verbose_name = '天气类型信息'
        verbose_name_plural = '天气类型信息'
    
    def __str__(self):
        return f"{self.weather_type_code} - {self.description_cn or self.description_en or ''}"


class AirportLocation(models.Model):
    """
    机场地理坐标表
    坐标来源：airport_loc.csv，导入时已将 DMS 格式转换为十进制度数。
    供 NWP 解析器等需要机场坐标的模块使用。
    """
    airport_4code = models.CharField(
        max_length=4, primary_key=True, verbose_name='机场四字代码'
    )
    latitude = models.FloatField(verbose_name='纬度（十进制度）')
    longitude = models.FloatField(verbose_name='经度（十进制度）')
    airport_name = models.CharField(
        max_length=100, blank=True, null=True, verbose_name='机场名称'
    )

    class Meta:
        db_table = 'airport_location'
        verbose_name = '机场坐标'
        verbose_name_plural = '机场坐标'

    def __str__(self):
        return f'{self.airport_4code} ({self.latitude:.4f}, {self.longitude:.4f})'


class WxmsgImportAlert(models.Model):
    """气象报文入库告警及处理记录表"""
    
    airport_4code = models.CharField(max_length=4, verbose_name='机场四字代码')
    msg_type = models.CharField(max_length=10, verbose_name='报文类型')
    alert_time = models.BigIntegerField(verbose_name='告警时间戳(毫秒)')
    handle_status = models.CharField(max_length=50, blank=True, null=True, verbose_name='处理状态')
    last_created_at = models.BigIntegerField(blank=True, null=True, verbose_name='上一份报文创建时间戳(毫秒)')
    last_metar_observation_time = models.BigIntegerField(blank=True, null=True, verbose_name='上一份报文观测时间戳(毫秒)')
    handle_time = models.BigIntegerField(blank=True, null=True, verbose_name='处理时间戳(毫秒)')
    
    class Meta:
        db_table = 'wxmsg_import_alert'
        verbose_name = '气象报文入库告警'
        verbose_name_plural = '气象报文入库告警'
        ordering = ['-alert_time']
    
    def __str__(self):
        return f"{self.airport_4code} - {self.msg_type} - {self.alert_time}"
