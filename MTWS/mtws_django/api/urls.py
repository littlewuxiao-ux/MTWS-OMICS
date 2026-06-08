"""
API应用URL配置
提供REST API接口，支持不同时间模式
"""

from django.urls import path
from . import views
from .airport_extra_views import airport_extra_info, airport_coords

app_name = 'api'

urlpatterns = [
    # 默认数据API（用于页面初始化）
    path('airports/overview/', views.airports_overview, name='airports_overview'),
    
    # 单个机场数据API
    path('airport/<str:airport_code>/history-reports/', views.airport_history_reports, name='airport_history_reports'),
    path('airport/<str:airport_code>/extra-info/', airport_extra_info, name='airport_extra_info'),
    
    # 解析控制API
    path('trigger-parsing/', views.trigger_parsing, name='trigger_parsing'),
    path('parsing-status/', views.get_parsing_status, name='get_parsing_status'),
    path('running-parsers/', views.get_running_parsers, name='get_running_parsers'),
    
    # 鉴权相关API（仅用于current模式）
    path('auth/get-qrcode/', views.get_qrcode, name='get_qrcode'),
    path('auth/check-login/', views.check_login_status, name='check_login_status'),
    path('auth/logout/', views.logout, name='logout'),
    
    
    # Token验证API
    path('validate-token/', views.validate_token_status, name='validate_token_status'),
    
    # 定时器配置API
    path('timer-configs/', views.get_timer_configs, name='get_timer_configs'),
    
    # 弹窗API
    path('metar-popups/', views.get_metar_popups, name='get_metar_popups'),
    path('popup-received/', views.handle_popup_received, name='handle_popup_received'),
    path('popup-batch-ignore/', views.handle_popup_batch_ignore, name='handle_popup_batch_ignore'),
    path('popup-batch-received/', views.handle_popup_batch_received, name='handle_popup_batch_received'),
    path('popup-settings/', views.get_popup_settings, name='get_popup_settings'),
    path('popup-settings/update/', views.update_popup_settings, name='update_popup_settings'),

    # 实况入库告警API
    path('import-alerts/', views.get_import_alerts, name='get_import_alerts'),
    path('import-alerts/handle/', views.handle_import_alert, name='handle_import_alert'),

    # 预报入库告警API
    path('taf-import-alerts/', views.get_taf_import_alerts, name='get_taf_import_alerts'),
    path('taf-import-alerts/handle/', views.handle_taf_import_alert, name='handle_taf_import_alert'),

    # NWP 数值预报温度数据
    path('nwp-data/', views.get_nwp_data, name='get_nwp_data'),

    # 地图告警：机场坐标批量接口
    path('airport-coords/', airport_coords, name='airport_coords'),

    # 地图告警：机场实况状态批量接口（Tooltip用）
    path('airport-flight-status/', views.get_airport_flight_status, name='airport_flight_status'),
] 