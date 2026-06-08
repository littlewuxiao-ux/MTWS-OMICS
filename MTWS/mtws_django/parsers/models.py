"""
解析数据模型
包括航班、METAR、TAF报文解析后的数据表
"""

from django.db import models
from django.utils import timezone


class Flight(models.Model):
    """航班数据表 - 根据项目规划.md 3.1节要求"""
    
    # 机场标识
    airport_4code = models.CharField(max_length=4, verbose_name='机场四字代码')
    
    # 是否有航班
    has_flight = models.BooleanField(default=False, verbose_name='是否有航班')
    
    # 48个时间段的航班数据字段 - time_[0]_flight 至 time_[47]_flight
    time_0_flight = models.TextField(blank=True, null=True, verbose_name='时间段0航班')
    time_1_flight = models.TextField(blank=True, null=True, verbose_name='时间段1航班')
    time_2_flight = models.TextField(blank=True, null=True, verbose_name='时间段2航班')
    time_3_flight = models.TextField(blank=True, null=True, verbose_name='时间段3航班')
    time_4_flight = models.TextField(blank=True, null=True, verbose_name='时间段4航班')
    time_5_flight = models.TextField(blank=True, null=True, verbose_name='时间段5航班')
    time_6_flight = models.TextField(blank=True, null=True, verbose_name='时间段6航班')
    time_7_flight = models.TextField(blank=True, null=True, verbose_name='时间段7航班')
    time_8_flight = models.TextField(blank=True, null=True, verbose_name='时间段8航班')
    time_9_flight = models.TextField(blank=True, null=True, verbose_name='时间段9航班')
    time_10_flight = models.TextField(blank=True, null=True, verbose_name='时间段10航班')
    time_11_flight = models.TextField(blank=True, null=True, verbose_name='时间段11航班')
    time_12_flight = models.TextField(blank=True, null=True, verbose_name='时间段12航班')
    time_13_flight = models.TextField(blank=True, null=True, verbose_name='时间段13航班')
    time_14_flight = models.TextField(blank=True, null=True, verbose_name='时间段14航班')
    time_15_flight = models.TextField(blank=True, null=True, verbose_name='时间段15航班')
    time_16_flight = models.TextField(blank=True, null=True, verbose_name='时间段16航班')
    time_17_flight = models.TextField(blank=True, null=True, verbose_name='时间段17航班')
    time_18_flight = models.TextField(blank=True, null=True, verbose_name='时间段18航班')
    time_19_flight = models.TextField(blank=True, null=True, verbose_name='时间段19航班')
    time_20_flight = models.TextField(blank=True, null=True, verbose_name='时间段20航班')
    time_21_flight = models.TextField(blank=True, null=True, verbose_name='时间段21航班')
    time_22_flight = models.TextField(blank=True, null=True, verbose_name='时间段22航班')
    time_23_flight = models.TextField(blank=True, null=True, verbose_name='时间段23航班')
    time_24_flight = models.TextField(blank=True, null=True, verbose_name='时间段24航班')
    time_25_flight = models.TextField(blank=True, null=True, verbose_name='时间段25航班')
    time_26_flight = models.TextField(blank=True, null=True, verbose_name='时间段26航班')
    time_27_flight = models.TextField(blank=True, null=True, verbose_name='时间段27航班')
    time_28_flight = models.TextField(blank=True, null=True, verbose_name='时间段28航班')
    time_29_flight = models.TextField(blank=True, null=True, verbose_name='时间段29航班')
    time_30_flight = models.TextField(blank=True, null=True, verbose_name='时间段30航班')
    time_31_flight = models.TextField(blank=True, null=True, verbose_name='时间段31航班')
    time_32_flight = models.TextField(blank=True, null=True, verbose_name='时间段32航班')
    time_33_flight = models.TextField(blank=True, null=True, verbose_name='时间段33航班')
    time_34_flight = models.TextField(blank=True, null=True, verbose_name='时间段34航班')
    time_35_flight = models.TextField(blank=True, null=True, verbose_name='时间段35航班')
    time_36_flight = models.TextField(blank=True, null=True, verbose_name='时间段36航班')
    time_37_flight = models.TextField(blank=True, null=True, verbose_name='时间段37航班')
    time_38_flight = models.TextField(blank=True, null=True, verbose_name='时间段38航班')
    time_39_flight = models.TextField(blank=True, null=True, verbose_name='时间段39航班')
    time_40_flight = models.TextField(blank=True, null=True, verbose_name='时间段40航班')
    time_41_flight = models.TextField(blank=True, null=True, verbose_name='时间段41航班')
    time_42_flight = models.TextField(blank=True, null=True, verbose_name='时间段42航班')
    time_43_flight = models.TextField(blank=True, null=True, verbose_name='时间段43航班')
    time_44_flight = models.TextField(blank=True, null=True, verbose_name='时间段44航班')
    time_45_flight = models.TextField(blank=True, null=True, verbose_name='时间段45航班')
    time_46_flight = models.TextField(blank=True, null=True, verbose_name='时间段46航班')
    time_47_flight = models.TextField(blank=True, null=True, verbose_name='时间段47航班')
    
    # 新增字段
    en_route = models.IntegerField(blank=True, null=True, verbose_name='是否在航线上')
    closest_departure_time_of_arriving_flight = models.BigIntegerField(blank=True, null=True, verbose_name='到达航班的最早起飞时间')
    closest_departure_time_at_this_airport = models.BigIntegerField(blank=True, null=True, verbose_name='本机场的最早起飞时间')
    closest_landing_time_of_arriving_flight = models.BigIntegerField(blank=True, null=True, verbose_name='到达航班的最近落地时间')
    
    # 系统字段
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    class Meta:
        db_table = 'flight'
        verbose_name = '航班数据'
        verbose_name_plural = '航班数据'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['airport_4code']),
            models.Index(fields=['has_flight']),
            models.Index(fields=['created_at']),
        ]
        
    def __str__(self):
        return f"Flight {self.airport_4code} - Has: {self.has_flight}"
    
    def get_flight_fields(self):
        """获取所有航班时间段字段的值"""
        fields = []
        for i in range(48):
            field_name = f'time_{i}_flight'
            value = getattr(self, field_name, None)
            fields.append(value)
        return fields


class Metar(models.Model):
    """METAR数据表 - 根据项目规划.md 3.2节要求"""
    
    # 机场标识
    airport_4code = models.CharField(max_length=4, verbose_name='机场四字代码')
    
    # SQC字段作为主键（全局唯一）
    sqc = models.CharField(max_length=50, primary_key=True, verbose_name='SQC标识')
    
    # METAR报文解析结果 - 按照项目规划.md 3.2节严格定义
    metar_type = models.CharField(max_length=10, blank=True, null=True, verbose_name='metar报文类型')
    metar_auto_flag = models.CharField(max_length=10, blank=True, null=True, verbose_name='自动报标签')
    metar_wind_direction = models.CharField(max_length=10, blank=True, null=True, verbose_name='风向')
    metar_wind_speed_original = models.CharField(max_length=20, blank=True, null=True, verbose_name='原始报文的风速')
    metar_wind_speed_val = models.FloatField(blank=True, null=True, verbose_name='平均风速值')
    metar_gust_val = models.FloatField(blank=True, null=True, verbose_name='阵风值')
    metar_wind_warning = models.CharField(max_length=1, blank=True, null=True, 
                                         choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                         verbose_name='风速告警')
    metar_visibility_original = models.CharField(max_length=20, blank=True, null=True, verbose_name='原始报文能见度')
    metar_visibility_val = models.IntegerField(blank=True, null=True, verbose_name='能见度值')
    metar_visibility_warning = models.CharField(max_length=1, blank=True, null=True,
                                               choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                               verbose_name='能见度告警级别')
    metar_weather = models.CharField(max_length=50, blank=True, null=True, verbose_name='天气现象')
    metar_weather_warning = models.CharField(max_length=1, blank=True, null=True,
                                            choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                            verbose_name='天气现象告警级别')
    metar_weather_pre = models.CharField(max_length=50, blank=True, null=True, verbose_name='近时天气')
    metar_cloud = models.CharField(max_length=50, blank=True, null=True, verbose_name='云组')
    metar_min_cloud_height = models.IntegerField(blank=True, null=True, verbose_name='最低云层高度')
    metar_cloud_warning = models.CharField(max_length=1, blank=True, null=True,
                                          choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                          verbose_name='云组告警级别')
    metar_temperature = models.CharField(max_length=10, blank=True, null=True, verbose_name='温度')
    metar_temp_val = models.FloatField(blank=True, null=True, verbose_name='温度值')
    metar_temperature_warning = models.CharField(max_length=1, blank=True, null=True,
                                                choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                verbose_name='温度告警级别')
    metar_dew_point = models.CharField(max_length=10, blank=True, null=True, verbose_name='露点温度')
    metar_ws_dsc = models.CharField(max_length=50, blank=True, null=True, verbose_name='风切变')
    metar_change_trend = models.CharField(max_length=100, blank=True, null=True, verbose_name='变化组')
    metar_change_trend_warning = models.CharField(max_length=1, blank=True, null=True,
                                                choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                verbose_name='变化组告警级别')
    metar_rvr_dsc = models.CharField(max_length=50, blank=True, null=True, verbose_name='跑道视程')
    metar_rvr_warning = models.CharField(max_length=1, blank=True, null=True,
                                        choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                        verbose_name='跑道视程告警')
    metar_ws_warning = models.CharField(max_length=1, blank=True, null=True,
                                       choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                       verbose_name='风切变告警')
    metar_content = models.TextField(blank=True, null=True, verbose_name='metar原文')
    metar_observation_time = models.BigIntegerField(blank=True, null=True, verbose_name='发布时间')
    metar_ice_flag = models.CharField(max_length=10, blank=True, null=True, verbose_name='积冰条件标签')
    metar_warning = models.CharField(max_length=1, blank=True, null=True, default='N',
                                   choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                   verbose_name='实况综合告警级别')
    
    # 上一份METAR的SQC标识
    last_metar_sqc = models.BigIntegerField(blank=True, null=True, verbose_name='上一份METAR的SQC标识')
    
    # 弹窗类型标记
    operation_metar_popup = models.BooleanField(blank=True, null=True, verbose_name='运行类弹窗')
    parking_metar_popup = models.BooleanField(blank=True, null=True, verbose_name='停场类弹窗')
    
    # 系统字段
    created_at = models.BigIntegerField(verbose_name='创建时间戳')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    # 弹窗相关字段
    user_code = models.CharField(max_length=12, blank=True, null=True, verbose_name='用户代码')
    popup = models.CharField(max_length=1, blank=True, null=True, verbose_name='是否弹窗')
    popup_time = models.BigIntegerField(blank=True, null=True, verbose_name='弹窗时间')
    popup_handle_time = models.BigIntegerField(blank=True, null=True, verbose_name='弹窗处理时间')
    handling_user_code = models.CharField(max_length=12, blank=True, null=True, verbose_name='处理用户代码')
    handling_method = models.CharField(max_length=15, blank=True, null=True, verbose_name='处理方式')
    metar_weather_type = models.TextField(blank=True, null=True, verbose_name='天气类型字典')
    data_status = models.CharField(
        max_length=1, blank=True, null=True,
        choices=[('N', '当前'), ('H', '历史'), ('C', '系统创建')],
        verbose_name='数据状态'
    )
    rvr_min_org = models.IntegerField(blank=True, null=True, verbose_name='RVR最小值原始')
    rvr_min_val = models.IntegerField(blank=True, null=True, verbose_name='RVR最小值')
    intercept = models.CharField(max_length=1, blank=True, null=True, verbose_name='拦截标识')
    operation_metar_popup_leeway = models.IntegerField(blank=True, null=True, verbose_name='运行区METAR弹窗余量')
    operation_metar_popup_level = models.CharField(max_length=1, blank=True, null=True, verbose_name='运行区METAR弹窗级别')
    parking_metar_popup_level = models.CharField(max_length=1, blank=True, null=True, verbose_name='停场METAR弹窗级别')

    # 入库告警字段
    import_alert = models.CharField(max_length=1, blank=True, null=True, verbose_name='入库告警标记')
    import_alert_time = models.BigIntegerField(blank=True, null=True, verbose_name='入库告警时间戳')
    handle_status = models.CharField(max_length=100, blank=True, null=True, verbose_name='告警处理状态')
    import_alert_handle_time = models.BigIntegerField(blank=True, null=True, verbose_name='告警处理时间戳')

    class Meta:
        db_table = 'metar'
        verbose_name = 'METAR数据'
        verbose_name_plural = 'METAR数据'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['airport_4code', '-created_at']),
            models.Index(fields=['metar_observation_time']),
            models.Index(fields=['metar_content']),
        ]
        
    def __str__(self):
        return f"METAR {self.airport_4code} - {self.metar_observation_time}"


class Taf(models.Model):
    """TAF数据表 - 根据项目规划.md 3.3节要求"""
    
    # 机场标识
    airport_4code = models.CharField(max_length=4, verbose_name='机场四字代码')
    
    # SQC字段用于去重
    sqc = models.CharField(max_length=50, verbose_name='SQC标识', db_index=True)
    
    # TAF报文解析结果 - 按照项目规划.md 3.3节严格定义
    whole_validity_period = models.CharField(max_length=20, blank=True, null=True, verbose_name='整体预报有效期')
    taf_observation_time = models.BigIntegerField(blank=True, null=True, verbose_name='发布时间')
    taf_type = models.CharField(max_length=10, blank=True, null=True, verbose_name='taf报文类型')
    taf_content = models.TextField(blank=True, null=True, verbose_name='taf原文')
    
    # 主预报字段
    subject_validity_period_start = models.CharField(max_length=10, blank=True, null=True, verbose_name='主预报起始时间')
    subject_validity_period_end = models.CharField(max_length=10, blank=True, null=True, verbose_name='主预报截至时间')
    subject_content = models.TextField(blank=True, null=True, verbose_name='主预报原文')
    subject_warning = models.CharField(max_length=1, blank=True, null=True,
                                      choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                      verbose_name='主预报告警等级')
    
    # 主预报详细字段（按原始程序添加）
    subject_wind_speed_mps = models.IntegerField(blank=True, null=True, verbose_name='主预报风速(m/s)')
    subject_gust_mps = models.IntegerField(blank=True, null=True, verbose_name='主预报阵风(m/s)')
    subject_wind_warning = models.CharField(max_length=1, blank=True, null=True,
                                           choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                           verbose_name='主预报风组告警')
    subject_visibility_m = models.IntegerField(blank=True, null=True, verbose_name='主预报能见度(m)')
    subject_visibility_warning = models.CharField(max_length=1, blank=True, null=True,
                                                 choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                 verbose_name='主预报能见度告警')
    subject_weather1 = models.CharField(max_length=20, blank=True, null=True, verbose_name='主预报天气现象1')
    subject_weather2 = models.CharField(max_length=20, blank=True, null=True, verbose_name='主预报天气现象2')
    subject_weather3 = models.CharField(max_length=20, blank=True, null=True, verbose_name='主预报天气现象3')
    subject_weather4 = models.CharField(max_length=20, blank=True, null=True, verbose_name='主预报天气现象4')
    subject_weather5 = models.CharField(max_length=20, blank=True, null=True, verbose_name='主预报天气现象5')
    subject_weather_warning = models.CharField(max_length=1, blank=True, null=True,
                                              choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                              verbose_name='主预报天气现象告警')
    subject_cloud_min = models.IntegerField(blank=True, null=True, verbose_name='主预报最低云高')
    subject_cloud_warning = models.CharField(max_length=1, blank=True, null=True,
                                            choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                            verbose_name='主预报云组告警')
    
    # 主预报温度字段
    subject_max_temp1 = models.CharField(max_length=10, blank=True, null=True, verbose_name='第1个最高温度')
    subject_max_temp1_time = models.CharField(max_length=10, blank=True, null=True, verbose_name='第1个最高温度所在时间')
    subject_max_temp1_warning = models.CharField(max_length=1, blank=True, null=True,
                                                choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                verbose_name='第1个最高温度告警等级')
    subject_max_temp2 = models.CharField(max_length=10, blank=True, null=True, verbose_name='第2个最高温度')
    subject_max_temp2_time = models.CharField(max_length=10, blank=True, null=True, verbose_name='第2个最高温度所在时间')
    subject_max_temp2_warning = models.CharField(max_length=1, blank=True, null=True,
                                                choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                verbose_name='第2个最高温度告警等级')
    subject_min_temp1 = models.CharField(max_length=10, blank=True, null=True, verbose_name='第1个最低温度')
    subject_min_temp1_time = models.CharField(max_length=10, blank=True, null=True, verbose_name='第1个最低温度所在时间')
    subject_min_temp1_warning = models.CharField(max_length=1, blank=True, null=True,
                                                choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                verbose_name='第1个最低温度告警等级')
    subject_min_temp2 = models.CharField(max_length=10, blank=True, null=True, verbose_name='第2个最低温度')
    subject_min_temp2_time = models.CharField(max_length=10, blank=True, null=True, verbose_name='第2个最低温度所在时间')
    subject_min_temp2_warning = models.CharField(max_length=1, blank=True, null=True,
                                                choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                verbose_name='第2个最低温度告警等级')
    
    # 变化组字段 - change_[i]_* 其中[i]为1-8
    change_1_type = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组1的类型')
    change_1_content_all = models.TextField(blank=True, null=True, verbose_name='变化组1的原文')
    change_1_warning = models.CharField(max_length=1, blank=True, null=True,
                                       choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                       verbose_name='变化组1的告警等级')
    change_1_validity_period_start = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组1的起始时间')
    change_1_validity_period_end = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组1的截止时间')
    
    # 变化组1详细字段
    change_1_wind_speed_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组1风速(m/s)')
    change_1_gust_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组1阵风(m/s)')
    change_1_wind_warning = models.CharField(max_length=1, blank=True, null=True,
                                            choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                            verbose_name='变化组1风组告警')
    change_1_visibility_m = models.IntegerField(blank=True, null=True, verbose_name='变化组1能见度(m)')
    change_1_visibility_warning = models.CharField(max_length=1, blank=True, null=True,
                                                  choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                  verbose_name='变化组1能见度告警')
    change_1_weather1 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组1天气现象1')
    change_1_weather2 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组1天气现象2')
    change_1_weather3 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组1天气现象3')
    change_1_weather4 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组1天气现象4')
    change_1_weather5 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组1天气现象5')
    change_1_weather_warning = models.CharField(max_length=1, blank=True, null=True,
                                               choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                               verbose_name='变化组1天气现象告警')
    change_1_cloud_min = models.IntegerField(blank=True, null=True, verbose_name='变化组1最低云高')
    change_1_cloud_warning = models.CharField(max_length=1, blank=True, null=True,
                                             choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                             verbose_name='变化组1云组告警')
    
    change_2_type = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组2的类型')
    change_2_content_all = models.TextField(blank=True, null=True, verbose_name='变化组2的原文')
    change_2_warning = models.CharField(max_length=1, blank=True, null=True,
                                       choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                       verbose_name='变化组2的告警等级')
    change_2_validity_period_start = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组2的起始时间')
    change_2_validity_period_end = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组2的截止时间')
    
    # 变化组2详细字段
    change_2_wind_speed_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组2风速(m/s)')
    change_2_gust_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组2阵风(m/s)')
    change_2_wind_warning = models.CharField(max_length=1, blank=True, null=True,
                                            choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                            verbose_name='变化组2风组告警')
    change_2_visibility_m = models.IntegerField(blank=True, null=True, verbose_name='变化组2能见度(m)')
    change_2_visibility_warning = models.CharField(max_length=1, blank=True, null=True,
                                                  choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                  verbose_name='变化组2能见度告警')
    change_2_weather1 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组2天气现象1')
    change_2_weather2 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组2天气现象2')
    change_2_weather3 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组2天气现象3')
    change_2_weather4 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组2天气现象4')
    change_2_weather5 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组2天气现象5')
    change_2_weather_warning = models.CharField(max_length=1, blank=True, null=True,
                                               choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                               verbose_name='变化组2天气现象告警')
    change_2_cloud_min = models.IntegerField(blank=True, null=True, verbose_name='变化组2最低云高')
    change_2_cloud_warning = models.CharField(max_length=1, blank=True, null=True,
                                             choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                             verbose_name='变化组2云组告警')
    
    change_3_type = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组3的类型')
    change_3_content_all = models.TextField(blank=True, null=True, verbose_name='变化组3的原文')
    change_3_warning = models.CharField(max_length=1, blank=True, null=True,
                                       choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                       verbose_name='变化组3的告警等级')
    change_3_validity_period_start = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组3的起始时间')
    change_3_validity_period_end = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组3的截止时间')
    
    # 变化组3详细字段
    change_3_wind_speed_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组3风速(m/s)')
    change_3_gust_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组3阵风(m/s)')
    change_3_wind_warning = models.CharField(max_length=1, blank=True, null=True,
                                            choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                            verbose_name='变化组3风组告警')
    change_3_visibility_m = models.IntegerField(blank=True, null=True, verbose_name='变化组3能见度(m)')
    change_3_visibility_warning = models.CharField(max_length=1, blank=True, null=True,
                                                  choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                  verbose_name='变化组3能见度告警')
    change_3_weather1 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组3天气现象1')
    change_3_weather2 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组3天气现象2')
    change_3_weather3 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组3天气现象3')
    change_3_weather4 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组3天气现象4')
    change_3_weather5 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组3天气现象5')
    change_3_weather_warning = models.CharField(max_length=1, blank=True, null=True,
                                               choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                               verbose_name='变化组3天气现象告警')
    change_3_cloud_min = models.IntegerField(blank=True, null=True, verbose_name='变化组3最低云高')
    change_3_cloud_warning = models.CharField(max_length=1, blank=True, null=True,
                                             choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                             verbose_name='变化组3云组告警')
    
    change_4_type = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组4的类型')
    change_4_content_all = models.TextField(blank=True, null=True, verbose_name='变化组4的原文')
    change_4_warning = models.CharField(max_length=1, blank=True, null=True,
                                       choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                       verbose_name='变化组4的告警等级')
    change_4_validity_period_start = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组4的起始时间')
    change_4_validity_period_end = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组4的截止时间')
    
    # 变化组4详细字段
    change_4_wind_speed_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组4风速(m/s)')
    change_4_gust_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组4阵风(m/s)')
    change_4_wind_warning = models.CharField(max_length=1, blank=True, null=True,
                                            choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                            verbose_name='变化组4风组告警')
    change_4_visibility_m = models.IntegerField(blank=True, null=True, verbose_name='变化组4能见度(m)')
    change_4_visibility_warning = models.CharField(max_length=1, blank=True, null=True,
                                                  choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                  verbose_name='变化组4能见度告警')
    change_4_weather1 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组4天气现象1')
    change_4_weather2 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组4天气现象2')
    change_4_weather3 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组4天气现象3')
    change_4_weather4 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组4天气现象4')
    change_4_weather5 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组4天气现象5')
    change_4_weather_warning = models.CharField(max_length=1, blank=True, null=True,
                                               choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                               verbose_name='变化组4天气现象告警')
    change_4_cloud_min = models.IntegerField(blank=True, null=True, verbose_name='变化组4最低云高')
    change_4_cloud_warning = models.CharField(max_length=1, blank=True, null=True,
                                             choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                             verbose_name='变化组4云组告警')
    
    change_5_type = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组5的类型')
    change_5_content_all = models.TextField(blank=True, null=True, verbose_name='变化组5的原文')
    change_5_warning = models.CharField(max_length=1, blank=True, null=True,
                                       choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                       verbose_name='变化组5的告警等级')
    change_5_validity_period_start = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组5的起始时间')
    change_5_validity_period_end = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组5的截止时间')
    
    # 变化组5详细字段
    change_5_wind_speed_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组5风速(m/s)')
    change_5_gust_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组5阵风(m/s)')
    change_5_wind_warning = models.CharField(max_length=1, blank=True, null=True,
                                            choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                            verbose_name='变化组5风组告警')
    change_5_visibility_m = models.IntegerField(blank=True, null=True, verbose_name='变化组5能见度(m)')
    change_5_visibility_warning = models.CharField(max_length=1, blank=True, null=True,
                                                  choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                  verbose_name='变化组5能见度告警')
    change_5_weather1 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组5天气现象1')
    change_5_weather2 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组5天气现象2')
    change_5_weather3 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组5天气现象3')
    change_5_weather4 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组5天气现象4')
    change_5_weather5 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组5天气现象5')
    change_5_weather_warning = models.CharField(max_length=1, blank=True, null=True,
                                               choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                               verbose_name='变化组5天气现象告警')
    change_5_cloud_min = models.IntegerField(blank=True, null=True, verbose_name='变化组5最低云高')
    change_5_cloud_warning = models.CharField(max_length=1, blank=True, null=True,
                                             choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                             verbose_name='变化组5云组告警')
    
    change_6_type = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组6的类型')
    change_6_content_all = models.TextField(blank=True, null=True, verbose_name='变化组6的原文')
    change_6_warning = models.CharField(max_length=1, blank=True, null=True,
                                       choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                       verbose_name='变化组6的告警等级')
    change_6_validity_period_start = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组6的起始时间')
    change_6_validity_period_end = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组6的截止时间')
    
    # 变化组6详细字段
    change_6_wind_speed_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组6风速(m/s)')
    change_6_gust_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组6阵风(m/s)')
    change_6_wind_warning = models.CharField(max_length=1, blank=True, null=True,
                                            choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                            verbose_name='变化组6风组告警')
    change_6_visibility_m = models.IntegerField(blank=True, null=True, verbose_name='变化组6能见度(m)')
    change_6_visibility_warning = models.CharField(max_length=1, blank=True, null=True,
                                                  choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                  verbose_name='变化组6能见度告警')
    change_6_weather1 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组6天气现象1')
    change_6_weather2 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组6天气现象2')
    change_6_weather3 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组6天气现象3')
    change_6_weather4 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组6天气现象4')
    change_6_weather5 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组6天气现象5')
    change_6_weather_warning = models.CharField(max_length=1, blank=True, null=True,
                                               choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                               verbose_name='变化组6天气现象告警')
    change_6_cloud_min = models.IntegerField(blank=True, null=True, verbose_name='变化组6最低云高')
    change_6_cloud_warning = models.CharField(max_length=1, blank=True, null=True,
                                             choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                             verbose_name='变化组6云组告警')
    
    change_7_type = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组7的类型')
    change_7_content_all = models.TextField(blank=True, null=True, verbose_name='变化组7的原文')
    change_7_warning = models.CharField(max_length=1, blank=True, null=True,
                                       choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                       verbose_name='变化组7的告警等级')
    change_7_validity_period_start = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组7的起始时间')
    change_7_validity_period_end = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组7的截止时间')
    
    # 变化组7详细字段
    change_7_wind_speed_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组7风速(m/s)')
    change_7_gust_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组7阵风(m/s)')
    change_7_wind_warning = models.CharField(max_length=1, blank=True, null=True,
                                            choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                            verbose_name='变化组7风组告警')
    change_7_visibility_m = models.IntegerField(blank=True, null=True, verbose_name='变化组7能见度(m)')
    change_7_visibility_warning = models.CharField(max_length=1, blank=True, null=True,
                                                  choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                  verbose_name='变化组7能见度告警')
    change_7_weather1 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组7天气现象1')
    change_7_weather2 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组7天气现象2')
    change_7_weather3 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组7天气现象3')
    change_7_weather4 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组7天气现象4')
    change_7_weather5 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组7天气现象5')
    change_7_weather_warning = models.CharField(max_length=1, blank=True, null=True,
                                               choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                               verbose_name='变化组7天气现象告警')
    change_7_cloud_min = models.IntegerField(blank=True, null=True, verbose_name='变化组7最低云高')
    change_7_cloud_warning = models.CharField(max_length=1, blank=True, null=True,
                                             choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                             verbose_name='变化组7云组告警')
    
    change_8_type = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组8的类型')
    change_8_content_all = models.TextField(blank=True, null=True, verbose_name='变化组8的原文')
    change_8_warning = models.CharField(max_length=1, blank=True, null=True,
                                       choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                       verbose_name='变化组8的告警等级')
    change_8_validity_period_start = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组8的起始时间')
    change_8_validity_period_end = models.CharField(max_length=10, blank=True, null=True, verbose_name='变化组8的截止时间')
    
    # 变化组8详细字段
    change_8_wind_speed_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组8风速(m/s)')
    change_8_gust_mps = models.IntegerField(blank=True, null=True, verbose_name='变化组8阵风(m/s)')
    change_8_wind_warning = models.CharField(max_length=1, blank=True, null=True,
                                            choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                            verbose_name='变化组8风组告警')
    change_8_visibility_m = models.IntegerField(blank=True, null=True, verbose_name='变化组8能见度(m)')
    change_8_visibility_warning = models.CharField(max_length=1, blank=True, null=True,
                                                  choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                                  verbose_name='变化组8能见度告警')
    change_8_weather1 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组8天气现象1')
    change_8_weather2 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组8天气现象2')
    change_8_weather3 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组8天气现象3')
    change_8_weather4 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组8天气现象4')
    change_8_weather5 = models.CharField(max_length=20, blank=True, null=True, verbose_name='变化组8天气现象5')
    change_8_weather_warning = models.CharField(max_length=1, blank=True, null=True,
                                               choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                               verbose_name='变化组8天气现象告警')
    change_8_cloud_min = models.IntegerField(blank=True, null=True, verbose_name='变化组8最低云高')
    change_8_cloud_warning = models.CharField(max_length=1, blank=True, null=True,
                                             choices=[('R', '红色'), ('Y', '黄色'), ('G', '绿色'), ('N', '无告警')],
                                             verbose_name='变化组8云组告警')
    
    # 修正/更正标识
    amd_or_cor = models.CharField(max_length=3, blank=True, null=True, verbose_name='修正或更正标识')
    
    # 其他字段
    error_report = models.TextField(blank=True, null=True, verbose_name='错误报告')
    abnormal_label = models.CharField(max_length=20, blank=True, null=True, verbose_name='异常标签')

    # 数据状态与入库告警字段
    data_status = models.CharField(max_length=1, blank=True, null=True, verbose_name='数据状态')
    import_alert = models.CharField(max_length=1, blank=True, null=True, verbose_name='入库告警标记')
    import_alert_time = models.BigIntegerField(blank=True, null=True, verbose_name='入库告警时间戳')
    handle_status = models.CharField(max_length=100, blank=True, null=True, verbose_name='告警处理状态')
    import_alert_handle_time = models.BigIntegerField(blank=True, null=True, verbose_name='告警处理时间戳')

    # 系统字段
    created_at = models.BigIntegerField(verbose_name='创建时间戳（毫秒）')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    class Meta:
        db_table = 'taf'
        verbose_name = 'TAF数据'
        verbose_name_plural = 'TAF数据'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['airport_4code', '-created_at']),
            models.Index(fields=['taf_observation_time']),
            models.Index(fields=['taf_content']),
            models.Index(fields=['whole_validity_period']),
        ]
        
    def __str__(self):
        return f"TAF {self.airport_4code} - {self.taf_observation_time}"


class ParseLog(models.Model):
    """解析日志表"""
    
    PARSE_TYPE_CHOICES = [
        ('flight', '航班解析'),
        ('metar', 'METAR解析'),
        ('taf', 'TAF解析'),
    ]
    
    STATUS_CHOICES = [
        ('success', '成功'),
        ('error', '错误'),
        ('warning', '警告'),
    ]
    
    parse_type = models.CharField(max_length=10, choices=PARSE_TYPE_CHOICES, verbose_name='解析类型')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, verbose_name='状态')
    message = models.TextField(blank=True, null=True, verbose_name='消息')
    record_count = models.IntegerField(default=0, verbose_name='处理记录数')
    error_count = models.IntegerField(default=0, verbose_name='错误记录数')
    execution_time = models.FloatField(blank=True, null=True, verbose_name='执行时间（秒）')
    
    # 时间戳
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    
    class Meta:
        db_table = 'parse_log'
        verbose_name = '解析日志'
        verbose_name_plural = '解析日志'
        ordering = ['-created_at']
        
    def __str__(self):
        return f"{self.get_parse_type_display()} - {self.get_status_display()} - {self.created_at}"
