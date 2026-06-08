"""
API视图
提供默认加载数据API和搜索API
严格按照项目规划.md的要求实现
"""

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.db.models import Q
from datetime import datetime, timedelta
import json
import logging

from core.models import AirportInfo, AirportAlertThresholds, Carrier, WeatherAlertLevels, AreaOptions, DataRefreshTimer
from parsers.models import Flight, Metar, Taf, ParseLog
from parsers.parsing_manager import ParsingManager
from utils.time_manager import TimeManager
from utils.alert_calculator import AlertCalculator
from utils.popup_utils import PopupManager
from data_adapters.adapter_factory import AdapterFactory

logger = logging.getLogger('mtws.api')

def check_token_invalid_response(result, time_mode):
    """
    检查解析结果是否因token失效导致失败，如果是则返回401响应
    
    Args:
        result: 解析器返回的结果
        time_mode: 时间模式
        
    Returns:
        JsonResponse with 401 status if token invalid, None otherwise
    """
    if not result.get('success', False) and time_mode == 'current':
        # 检查错误信息中是否包含API请求失败的标识
        message = result.get('message', '')
        if 'API请求失败' in message or '未获取到' in message:
            logger.warning("数据更新失败，可能是token失效")
            return JsonResponse({
                'success': False,
                'error': '认证失效，请重新登录'
            }, status=401)
    return None


def get_cached_area_options():
    """获取区域选项数据"""
    try:
        return {
            'domestic': list(AreaOptions.objects.filter(classification='国内').order_by('sequence').values('area', 'sequence')),
            'international': list(AreaOptions.objects.filter(classification='国际').order_by('sequence').values('area', 'sequence'))
        }
        
    except Exception as e:
        logger.error(f"获取区域选项数据失败: {str(e)}")
        # 返回空的区域选项
        return {
            'domestic': [],
            'international': []
        }


@require_http_methods(["GET"])
def airports_overview(request, time_mode='current'):
    """
    获取机场概览数据API
    根据项目规划.md 4节要求：
    - 航班解析数据中has_flight=True的机场数据
    - 对应的最新3条METAR数据
    - 对应的最新3条有效TAF数据
    - 机场信息和告警阈值表相关字段
    - 航空公司代码
    """
    try:
        # 移除缓存机制，直接从数据库加载最新数据
        
        # 1. 获取有航班的机场
        active_airports = Flight.objects.filter(has_flight=True).values_list('airport_4code', flat=True)
        
        if not active_airports:
            return JsonResponse({
                'success': True,
                'data': {
                    'airports': [],
                    'carriers': list(Carrier.objects.filter(is_active=True).values_list('carrier_code', flat=True)),
                    'timestamp': datetime.now().isoformat()
                }
            })
        
        # 2. 获取机场信息（包括未配置的机场）
        configured_airports = {info.airport_4code: info for info in AirportInfo.objects.filter(
            airport_4code__in=active_airports
        ).select_related()}
        
        # 获取default配置用于未配置的机场
        default_airport_info = AirportInfo.objects.filter(airport_4code='default').first()
        
        # 3. 构建机场数据
        airports_data = []
        for airport_code in active_airports:
            # 获取机场信息，如果未配置则使用default配置
            if airport_code in configured_airports:
                airport = configured_airports[airport_code]
            elif default_airport_info:
                # 使用default配置创建临时机场信息对象
                from copy import deepcopy
                airport = deepcopy(default_airport_info)
                airport.airport_4code = airport_code
                airport.airport_name = f'未配置机场 ({airport_code})'
            else:
                # 如果连default都没有，跳过该机场
                continue
            # 获取最新的航班数据
            flight_data = Flight.objects.filter(
                airport_4code=airport.airport_4code,
                has_flight=True
            ).order_by('-created_at').first()
            
            if not flight_data:
                continue
                
            # 获取最新1条METAR数据（data_status=N 为当前报文，data_status=C 为系统创建的占位行）
            metar_data = Metar.objects.filter(
                airport_4code=airport.airport_4code,
                data_status__in=['N', 'C'],
            ).order_by('-metar_observation_time')[:1]
            
            # 获取当前有效TAF（data_status='N' 或 'C'），取 created_at 最大的1条
            taf_record = Taf.objects.filter(
                airport_4code=airport.airport_4code,
                data_status__in=['N', 'C'],
            ).order_by('-created_at').first()
            taf_data = [taf_record] if taf_record else []
            
            # 构建机场数据
            airport_data = {
                'airport_4code': airport.airport_4code,
                'airport_name': airport.airport_name,
                'area': airport.area,
                'area_code': airport.area_code,
                'classification': airport.classification,
                # 添加联系方式信息
                'forecast_phone': airport.forecast_phone,
                'observation_phone': airport.observation_phone,
                'other_phone': airport.other_phone,
                'flight_data': {
                    'has_flight': flight_data.has_flight,
                    'time_slots': [getattr(flight_data, f'time_{i}_flight') for i in range(48)],
                    'last_updated': flight_data.created_at.isoformat()
                },
                'metar_data': [
                    {
                        'metar_observation_time': metar.metar_observation_time,
                        'metar_type': metar.metar_type,
                        'metar_auto_flag': metar.metar_auto_flag,
                        'metar_wind_direction': metar.metar_wind_direction,
                        'metar_wind_speed_original': metar.metar_wind_speed_original,
                        'metar_wind_speed_val': metar.metar_wind_speed_val,
                        'metar_gust_val': metar.metar_gust_val,
                        'metar_wind_warning': metar.metar_wind_warning,
                        'metar_visibility_original': metar.metar_visibility_original,
                        'metar_visibility_val': metar.metar_visibility_val,
                        'metar_visibility_warning': metar.metar_visibility_warning,
                        'metar_weather': metar.metar_weather,
                        'metar_weather_warning': metar.metar_weather_warning,
                        'metar_weather_pre': metar.metar_weather_pre,
                        'metar_cloud': metar.metar_cloud,
                        'metar_min_cloud_height': metar.metar_min_cloud_height,
                        'metar_cloud_warning': metar.metar_cloud_warning,
                        'metar_temperature': metar.metar_temperature,
                        'metar_temp_val': metar.metar_temp_val,
                        'metar_temperature_warning': metar.metar_temperature_warning,
                        'metar_dew_point': metar.metar_dew_point,
                        'metar_ws_dsc': metar.metar_ws_dsc,
                        'metar_ws_warning': metar.metar_ws_warning,
                        'metar_change_trend': metar.metar_change_trend,
                        'metar_change_trend_warning': metar.metar_change_trend_warning,
                        'metar_rvr_dsc': metar.metar_rvr_dsc,
                        'rvr_min_org': metar.rvr_min_org,
                        'rvr_min_val': metar.rvr_min_val,
                        'metar_rvr_warning': metar.metar_rvr_warning,
                        'metar_ice_flag': metar.metar_ice_flag,
                        'metar_content': metar.metar_content,
                        'metar_warning': metar.metar_warning,
                        'metar_weather_type': metar.metar_weather_type,
                        'data_status': metar.data_status,
                        'created_at': metar.created_at,
                        'sqc': metar.sqc,
                        'import_alert': metar.import_alert,
                        'import_alert_time': metar.import_alert_time,
                        'handle_status': metar.handle_status,
                        'import_alert_handle_time': metar.import_alert_handle_time,
                    } for metar in metar_data
                ],
                'taf_data': [
                    {
                        'id': taf.id,
                        'airport_4code': taf.airport_4code,
                        'whole_validity_period': taf.whole_validity_period,
                        'taf_observation_time': taf.taf_observation_time,
                        'taf_type': taf.taf_type,
                        'taf_content': taf.taf_content,
                        'subject_validity_period_start': taf.subject_validity_period_start,
                        'subject_validity_period_end': taf.subject_validity_period_end,
                        'subject_content': taf.subject_content,
                        'subject_warning': taf.subject_warning,
                        'subject_max_temp1': taf.subject_max_temp1,
                        'subject_max_temp1_time': taf.subject_max_temp1_time,
                        'subject_max_temp1_warning': taf.subject_max_temp1_warning,
                        'subject_max_temp2': taf.subject_max_temp2,
                        'subject_max_temp2_time': taf.subject_max_temp2_time,
                        'subject_max_temp2_warning': taf.subject_max_temp2_warning,
                        'subject_min_temp1': taf.subject_min_temp1,
                        'subject_min_temp1_time': taf.subject_min_temp1_time,
                        'subject_min_temp1_warning': taf.subject_min_temp1_warning,
                        'subject_min_temp2': taf.subject_min_temp2,
                        'subject_min_temp2_time': taf.subject_min_temp2_time,
                        'subject_min_temp2_warning': taf.subject_min_temp2_warning,
                        'change_1_type': taf.change_1_type,
                        'change_1_content_all': taf.change_1_content_all,
                        'change_1_warning': taf.change_1_warning,
                        'change_1_validity_period_start': taf.change_1_validity_period_start,
                        'change_1_validity_period_end': taf.change_1_validity_period_end,
                        'change_2_type': taf.change_2_type,
                        'change_2_content_all': taf.change_2_content_all,
                        'change_2_warning': taf.change_2_warning,
                        'change_2_validity_period_start': taf.change_2_validity_period_start,
                        'change_2_validity_period_end': taf.change_2_validity_period_end,
                        'change_3_type': taf.change_3_type,
                        'change_3_content_all': taf.change_3_content_all,
                        'change_3_warning': taf.change_3_warning,
                        'change_3_validity_period_start': taf.change_3_validity_period_start,
                        'change_3_validity_period_end': taf.change_3_validity_period_end,
                        'change_4_type': taf.change_4_type,
                        'change_4_content_all': taf.change_4_content_all,
                        'change_4_warning': taf.change_4_warning,
                        'change_4_validity_period_start': taf.change_4_validity_period_start,
                        'change_4_validity_period_end': taf.change_4_validity_period_end,
                        'change_5_type': taf.change_5_type,
                        'change_5_content_all': taf.change_5_content_all,
                        'change_5_warning': taf.change_5_warning,
                        'change_5_validity_period_start': taf.change_5_validity_period_start,
                        'change_5_validity_period_end': taf.change_5_validity_period_end,
                        'change_6_type': taf.change_6_type,
                        'change_6_content_all': taf.change_6_content_all,
                        'change_6_warning': taf.change_6_warning,
                        'change_6_validity_period_start': taf.change_6_validity_period_start,
                        'change_6_validity_period_end': taf.change_6_validity_period_end,
                        'change_7_type': taf.change_7_type,
                        'change_7_content_all': taf.change_7_content_all,
                        'change_7_warning': taf.change_7_warning,
                        'change_7_validity_period_start': taf.change_7_validity_period_start,
                        'change_7_validity_period_end': taf.change_7_validity_period_end,
                        'change_8_type': taf.change_8_type,
                        'change_8_content_all': taf.change_8_content_all,
                        'change_8_warning': taf.change_8_warning,
                        'change_8_validity_period_start': taf.change_8_validity_period_start,
                        'change_8_validity_period_end': taf.change_8_validity_period_end,
                        'error_report': taf.error_report,
                        'abnormal_label': taf.abnormal_label,
                        'amd_or_cor': taf.amd_or_cor,
                        'data_status': taf.data_status,
                        'created_at': taf.created_at,
                        'sqc': taf.sqc,
                        'import_alert': taf.import_alert,
                        'import_alert_time': taf.import_alert_time,
                        'handle_status': taf.handle_status,
                        'import_alert_handle_time': taf.import_alert_handle_time,
                    } for taf in taf_data
                ]
            }
            
            # 6. 计算告警结果（所有margin值的预计算）
            try:
                alert_calculator = AlertCalculator(time_mode)
                
                # 获取当前时间范围设置（默认36小时，可以从请求参数获取）
                time_range = 36  # 可以根据需要调整或从参数获取
                
                # 计算所有告警裕度的告警结果
                computed_alerts = alert_calculator.calculate_airport_alerts(airport_data, time_range)
                airport_data['computed_alerts'] = computed_alerts
                
            except Exception as e:
                logger.error(f"计算机场 {airport.airport_4code} 告警失败: {str(e)}")
                # 如果计算失败，提供空的告警结果
                airport_data['computed_alerts'] = alert_calculator._get_empty_alerts() if 'alert_calculator' in locals() else {}
            
            airports_data.append(airport_data)
        
        # 4. 获取航空公司数据
        carriers = list(Carrier.objects.filter(is_active=True).values_list('carrier_code', flat=True))
        
        # 5. 获取区域选项数据（带缓存）
        area_options = get_cached_area_options()
        
        # 获取航班数据状态
        flight_status = settings.MTWS_CONFIG.get('FLIGHT_DATA_STATUS', {
            'last_success_time': None,
            'last_attempt_time': None,
            'is_available': True
        })
        
        # 附带后端解析状态（调度器 + 手动刷新均会写入）
        try:
            from parsers.scheduler import get_parsing_status
            backend_parsing_status = get_parsing_status()
        except Exception:
            backend_parsing_status = {}

        response_data = {
            'success': True,
            'data': {
                'airports': airports_data,
                'carriers': carriers,
                'area_options': area_options,
                'timestamp': datetime.now().isoformat(),
                'flight_status': {
                    'is_available': flight_status.get('is_available', True),
                    'last_success_time': flight_status.get('last_success_time').isoformat() if flight_status.get('last_success_time') else None,
                    'last_attempt_time': flight_status.get('last_attempt_time').isoformat() if flight_status.get('last_attempt_time') else None
                },
                'parsing_status': backend_parsing_status,
            }
        }
        
        # 移除缓存机制，直接返回最新数据
        return JsonResponse(response_data)
        
    except Exception as e:
        logger.error(f"获取机场概览数据失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '获取机场概览数据失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
def airport_history_reports(request, airport_code, time_mode='current'):
    """
    获取机场历史报文API（用于弹窗功能）
    """
    try:
        # 移除缓存机制，直接从API获取最新历史报文数据
        
        # 获取token（仅在current模式下需要）
        token = None
        if time_mode == 'current':
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                token = auth_header[7:]  # 去掉 'Bearer ' 前缀
            else:
                return JsonResponse({
                    'success': False,
                    'error': '未找到认证token，请先登录'
                }, status=401)
        
        # 获取API适配器
        adapter = AdapterFactory.create_adapter(time_mode=time_mode, token=token)
        
        # 调用历史报文接口，增加重试机制
        history_data = None
        max_retries = 3
        for attempt in range(max_retries):
            try:
                history_data = adapter.get_history_reports(airport_code)
                if history_data and (history_data.get('metar_reports') or history_data.get('taf_reports')):
                    break  # 成功获取到数据，退出重试
                elif attempt < max_retries - 1:
                    logger.warning(f"第{attempt + 1}次尝试获取历史报文数据为空，将重试")
                    import time
                    time.sleep(0.5)  # 等待0.5秒后重试
            except Exception as e:
                logger.error(f"第{attempt + 1}次尝试获取历史报文失败: {e}")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(0.5)  # 等待0.5秒后重试
                else:
                    history_data = {'metar_reports': [], 'taf_reports': []}
        
        if not history_data:
            history_data = {'metar_reports': [], 'taf_reports': []}
        
        # 格式化时间戳为可读格式
        def format_timestamp(timestamp):
            if timestamp:
                try:
                    dt = datetime.fromtimestamp(timestamp / 1000)
                    return dt.strftime('%Y-%m-%d %H:%M:%S')
                except:
                    return str(timestamp)
            return ''
        
        # 处理实况报文
        metar_reports = []
        for report in history_data.get('metar_reports', []):
            metar_reports.append({
                'content': report.get('content', ''),
                'receive_time': report.get('receiveTime', 0),
                'receive_time_formatted': format_timestamp(report.get('receiveTime')),
                'wtype': report.get('wtype', '')
            })
        
        # 处理预报报文
        taf_reports = []
        for report in history_data.get('taf_reports', []):
            taf_reports.append({
                'content': report.get('content', ''),
                'receive_time': report.get('receiveTime', 0),
                'receive_time_formatted': format_timestamp(report.get('receiveTime')),
                'wtype': report.get('wtype', '')
            })
        
        response_data = {
            'success': True,
            'data': {
                'airport_code': airport_code,
                'metar_reports': metar_reports,
                'taf_reports': taf_reports,
                'timestamp': datetime.now().isoformat()
            }
        }
        
        # 移除缓存机制，直接返回最新数据
        return JsonResponse(response_data)
        
    except Exception as e:
        logger.error(f"获取机场历史报文失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '获取机场历史报文失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@csrf_exempt
def trigger_parsing(request, time_mode='current'):
    """
    触发解析API - 使用新的顺序解析模式
    先执行航班解析，再根据有航班的机场执行METAR和TAF解析
    """
    try:
        # 解析请求数据
        try:
            data = json.loads(request.body) if request.body else {}
        except json.JSONDecodeError:
            data = {}
        
        # 获取要更新的数据类型
        update_types = data.get('updateTypes', None)

        # 同步 NWP 开关状态到调度器缓存
        nwp_enabled = data.get('nwpEnabled', None)
        if nwp_enabled is not None:
            try:
                from parsers.scheduler import set_nwp_enabled
                set_nwp_enabled(bool(nwp_enabled))
            except Exception:
                pass
        
        # 获取token（仅在current模式下需要）
        token = None
        if time_mode == 'current':
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                token = auth_header[7:]  # 去掉 'Bearer ' 前缀
                # 缓存 token 供后端调度器复用
                try:
                    from parsers.scheduler import set_scheduler_token
                    set_scheduler_token(token)
                except Exception:
                    pass
            else:
                return JsonResponse({
                    'success': False,
                    'error': '未找到认证token，请先登录'
                }, status=401)
        
        # 获取用户代码
        user_code = request.headers.get('X-User-Code')
        
        # 创建解析管理器
        manager = ParsingManager(time_mode, token, user_code)
        
        # 根据是否有updateTypes参数决定调用哪个方法
        if update_types is None:
            # 没有updateTypes参数，使用原始的顺序解析（兼容备份版本行为）
            result = manager.run_sequential_parsing(time_mode=time_mode)
        else:
            # 有updateTypes参数，使用选择性解析
            result = manager.run_selective_parsing(update_types, time_mode=time_mode)

        # 将本次解析结果同步写入内存状态，供轮询接口附带返回
        try:
            from parsers.scheduler import update_parsing_status
            for dt, pr in result.get('parsers', {}).items():
                update_parsing_status(
                    dt,
                    success=pr.get('success', False),
                    message=pr.get('message', '') or ('' if pr.get('success') else '解析失败'),
                )
        except Exception:
            pass

        if result['success']:
            # 检查是否所有解析器都失败且可能是token问题
            parsers = result.get('parsers', {})
            all_failed = all(not parser.get('success', False) for parser in parsers.values())
            total_records = result.get('total_records', 0)
            
            # 如果在current模式下所有解析器都失败且没有获取到任何数据，可能是token失效
            if all_failed and total_records == 0 and time_mode == 'current':
                logger.warning("所有解析器失败且无数据，可能是token失效")
                return JsonResponse({
                    'success': False,
                    'error': '认证失效，请重新登录'
                }, status=401)
            
            return JsonResponse({
                'success': True,
                'message': '解析任务已完成',
                'data': result
            })
        else:
            return JsonResponse({
                'success': False,
                'error': '解析任务执行失败',
                'message': result.get('message', '未知错误'),
                'data': result
            }, status=500)
            
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': '请求数据格式错误'
        }, status=400)
    except Exception as e:
        logger.error(f"触发解析失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '触发解析失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
def get_running_parsers(request, time_mode='current'):
    """
    实时查询当前正在执行或排队中的解析器列表。
    前端在点击刷新前调用此接口判断是否可以触发新一轮解析。
    """
    try:
        from parsers.scheduler import get_running_parsers as _get
        data = _get()
        return JsonResponse({'success': True, 'data': data})
    except Exception as e:
        logger.error(f"查询解析器运行状态失败: {str(e)}")
        return JsonResponse({'success': True, 'data': {'running': [], 'queued': []}})


@require_http_methods(["GET"])
def get_parsing_status(request, time_mode='current'):
    """
    获取解析状态API
    """
    try:
        # 获取最近的解析日志
        latest_logs = ParseLog.objects.order_by('-created_at')[:10]
        
        logs_data = []
        for log in latest_logs:
            logs_data.append({
                'id': log.id,
                'parser_name': log.parser_name,
                'status': log.status,
                'message': log.message,
                'created_at': log.created_at.isoformat()
            })
        
        return JsonResponse({
            'success': True,
            'data': {
                'logs': logs_data,
                'timestamp': datetime.now().isoformat()
            }
        })
        
    except Exception as e:
        logger.error(f"获取解析状态失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '获取解析状态失败',
            'message': str(e)
        }, status=500)


# 鉴权相关API视图（仅用于current模式）
@require_http_methods(["POST"])
@csrf_exempt
def get_qrcode(request, time_mode='current'):
    """
    获取二维码API（仅用于current模式）
    """
    if time_mode != 'current':
        return JsonResponse({
            'success': False,
            'error': '此接口仅用于current模式'
        }, status=400)
    
    try:
        from .cas_login import get_config, get_qrcode
        
        # 获取配置并生成二维码
        config = get_config()
        qr_data = get_qrcode(config)
        
        # 将二维码信息存储到session中
        request.session['qr_id'] = qr_data['qr_id']
        request.session['routing'] = qr_data['routing']
        
        return JsonResponse({
            'success': True,
            'data': {
                'qr_img_base64': qr_data['qr_img_base64'],
                'qr_id': qr_data['qr_id']
            }
        })
        
    except Exception as e:
        logger.error(f"获取二维码失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '获取二维码失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@csrf_exempt 
def check_login_status(request, time_mode='current'):
    """
    检查登录状态API（仅用于current模式）
    """
    if time_mode != 'current':
        return JsonResponse({
            'success': False,
            'error': '此接口仅用于current模式'
        }, status=400)
    
    try:
        from .cas_login import check_scan_status, validate_login, get_config
        
        # 从session中获取二维码信息
        qr_id = request.session.get('qr_id')
        routing = request.session.get('routing')
        
        if not qr_id or not routing:
            return JsonResponse({
                'success': False,
                'error': '请先获取二维码'
            }, status=400)
        
        # 检查扫码状态
        scan_result = check_scan_status(qr_id, routing)
        
        if scan_result.get('success'):
            # 扫码成功，进行登录验证
            config = get_config()
            token = validate_login(config, scan_result)
            
            # 清除二维码信息
            del request.session['qr_id']
            del request.session['routing']
            
            return JsonResponse({
                'success': True,
                'data': {
                    'token': token,
                    'userCode': scan_result.get('userCode')
                }
            })
        else:
            return JsonResponse({
                'success': False,
                'message': '等待扫码'
            })
            
    except Exception as e:
        logger.error(f"检查登录状态失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '检查登录状态失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@csrf_exempt
def logout(request, time_mode='current'):
    """
    登出API（仅用于current模式）
    """
    if time_mode != 'current':
        return JsonResponse({
            'success': False,
            'error': '此接口仅用于current模式'
        }, status=400)
    
    try:
        from .cas_login import logout as cas_logout
        
        # 从请求头获取token
        auth_header = request.headers.get('Authorization')
        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header[7:]  # 去掉 'Bearer ' 前缀
        else:
            return JsonResponse({
                'success': False,
                'error': '未找到有效token'
            }, status=400)
        
        # 调用登出API
        logout_success = cas_logout(token)
        
        return JsonResponse({
            'success': logout_success,
            'message': '登出成功' if logout_success else '登出失败'
        })
        
    except Exception as e:
        logger.error(f"登出失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '登出失败',
            'message': str(e)
        }, status=500)








@require_http_methods(["GET"])
def validate_token_status(request, time_mode='current'):
    """
    验证token状态的轻量级接口
    直接调用外部API验证token有效性
    """
    if time_mode != 'current':
        return JsonResponse({'success': True})  # test模式直接返回成功
    
    # 获取token
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return JsonResponse({
            'success': False,
            'error': '未找到认证token'
        }, status=401)
    
    token = auth_header[7:]
    
    try:
        # 使用一个轻量的API调用验证token
        import requests
        headers = {'token': token, 'Content-Type': 'application/json'}
        
        # 调用航班数据接口验证token（使用最小的时间范围）
        from datetime import datetime, timedelta
        now = datetime.now()
        start_time = now - timedelta(hours=1)
        end_time = now + timedelta(hours=1)
        
        request_data = {
            "startTime": int(start_time.timestamp() * 1000),
            "endTime": int(end_time.timestamp() * 1000),
            "excludeCancel": True,
            "excludeHaveAta": True
        }
        
        response = requests.post(
            'http://sfa-wgw-inn.sf-airlines.com:1080/flight/flightSchedule/getByFlightDate',
            headers=headers,
            json=request_data,
            timeout=10
        )
        
        if response.status_code == 401:
            return JsonResponse({
                'success': False,
                'error': 'Token已失效'
            }, status=401)
        else:
            return JsonResponse({'success': True})
            
    except Exception as e:
        logger.error(f"Token验证失败: {str(e)}")
        # 网络错误等，当作token有效处理
        return JsonResponse({'success': True})


@require_http_methods(["GET"])
def get_timer_configs(request, time_mode='current'):
    """获取定时器配置的API接口"""
    try:
        configs = {}
        for timer in DataRefreshTimer.objects.all():
            configs[timer.data] = {
                'init_time': timer.init_time,
                'interval': timer.interval
            }
        
        # 添加弹窗稍后处理配置
        from django.conf import settings
        popup_snooze_duration = settings.MTWS_CONFIG.get('POPUP_CONFIG', {}).get('SNOOZE_DURATION_MINUTES', 10)
        configs['popup_snooze_duration'] = popup_snooze_duration
        
        return JsonResponse({
            'success': True,
            'data': configs
        })
        
    except Exception as e:
        logger.error(f"获取定时器配置失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '获取定时器配置失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
@csrf_exempt
def get_metar_popups(request, time_mode='current'):
    """
    获取实况弹窗数据
    
    URL参数:
        - time_mode: 时间模式（从URL路径获取）
    
    GET参数:
        - user_code: 用户代码
    """
    try:
        from utils.time_manager import TimeManager
        
        user_code = request.GET.get('user_code', 'default')
        
        # 创建弹窗管理器
        popup_manager = PopupManager(user_code=user_code, time_mode=time_mode)
        
        # 获取未处理的弹窗
        popup_list = popup_manager.get_pending_popups()
        
        # 获取当前时间（毫秒级时间戳）
        current_time_utc = TimeManager.get_current_time_utc(time_mode)
        current_time_ms = int(current_time_utc.timestamp() * 1000)
        
        return JsonResponse({
            'success': True,
            'data': popup_list,
            'current_time': current_time_ms
        })
        
    except Exception as e:
        logger.error(f"获取实况弹窗数据失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '获取实况弹窗数据失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@csrf_exempt
def handle_popup_received(request, time_mode='current'):
    """
    处理弹窗收到操作
    
    URL参数:
        - time_mode: 时间模式（从URL路径获取）
    
    Headers:
        - X-User-Code: 用户代码（current模式需要）
    
    POST参数:
        - sqc: METAR的SQC值
    """
    try:
        data = json.loads(request.body)
        sqc = data.get('sqc')
        
        if not sqc:
            return JsonResponse({
                'success': False,
                'error': '缺少SQC参数'
            }, status=400)
        
        # 获取user_code
        if time_mode == 'test':
            user_code = 'test'
        else:
            user_code = request.headers.get('X-User-Code')
        
        # 处理收到操作
        success = PopupManager.handle_popup_received(sqc, user_code)
        
        if success:
            return JsonResponse({
                'success': True,
                'message': '操作成功'
            })
        else:
            return JsonResponse({
                'success': False,
                'error': '操作失败'
            }, status=400)
        
    except Exception as e:
        logger.error(f"处理弹窗收到操作失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '处理弹窗收到操作失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@csrf_exempt
def handle_popup_batch_ignore(request, time_mode='current'):
    """
    批量忽略弹窗
    
    URL参数:
        - time_mode: 时间模式（从URL路径获取）
    
    Headers:
        - X-User-Code: 用户代码（current模式需要）
    
    POST参数:
        - sqc_list: METAR的SQC列表
    """
    try:
        data = json.loads(request.body)
        sqc_list = data.get('sqc_list', [])
        
        if not sqc_list:
            return JsonResponse({
                'success': False,
                'error': '缺少sqc_list参数'
            }, status=400)
        
        # 获取user_code
        if time_mode == 'test':
            user_code = 'test'
        else:
            user_code = request.headers.get('X-User-Code')
        
        # 批量忽略
        success = PopupManager.handle_popup_batch_ignore(sqc_list, user_code)
        
        if success:
            return JsonResponse({
                'success': True,
                'message': '批量忽略成功'
            })
        else:
            return JsonResponse({
                'success': False,
                'error': '批量忽略失败'
            }, status=400)
        
    except Exception as e:
        logger.error(f"批量忽略弹窗失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '批量忽略弹窗失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@csrf_exempt
def handle_popup_batch_received(request, time_mode='current'):
    """
    批量处理弹窗（收到/去处理）
    
    URL参数:
        - time_mode: 时间模式（从URL路径获取）
    
    Headers:
        - X-User-Code: 用户代码（current模式需要）
    
    POST参数:
        - sqc_list: METAR的SQC列表
    """
    try:
        data = json.loads(request.body)
        sqc_list = data.get('sqc_list', [])
        
        if not sqc_list:
            return JsonResponse({
                'success': False,
                'error': '缺少sqc_list参数'
            }, status=400)
        
        # 获取user_code
        if time_mode == 'test':
            user_code = 'test'
        else:
            user_code = request.headers.get('X-User-Code')
        
        # 批量处理
        success = PopupManager.handle_popup_batch_received(sqc_list, user_code)
        
        if success:
            return JsonResponse({
                'success': True,
                'message': '批量处理成功'
            })
        else:
            return JsonResponse({
                'success': False,
                'error': '批量处理失败'
            }, status=400)
        
    except Exception as e:
        logger.error(f"批量处理弹窗失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '批量处理弹窗失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
@csrf_exempt
def get_popup_settings(request, time_mode='current'):
    """
    获取弹窗设置
    
    URL参数:
        - time_mode: 时间模式（从URL路径获取）
    
    Headers:
        - X-User-Code: 用户代码（current模式需要）
    """
    try:
        from core.models import PopupSettings
        
        # 获取user_code
        if time_mode == 'test':
            user_code = 'test'
        else:
            user_code = request.headers.get('X-User-Code', 'default')
        
        popup_settings = PopupSettings.objects.filter(user_code=user_code).first()

        if not popup_settings:
            default_settings = PopupSettings.objects.filter(user_code='default').first()
            if default_settings:
                popup_settings = PopupSettings.objects.create(
                    user_code=user_code,
                    operation_metar_popup=default_settings.operation_metar_popup,
                    operation_taf_popup=default_settings.operation_taf_popup,
                    operation_NWP_popup=default_settings.operation_NWP_popup,
                    parking_metar_popup=default_settings.parking_metar_popup,
                    parking_taf_popup_other=default_settings.parking_taf_popup_other,
                    parking_NWP_popup=default_settings.parking_NWP_popup,
                    operation_metar_popup_leeway=default_settings.operation_metar_popup_leeway,
                    operation_taf_popup_leeway=default_settings.operation_taf_popup_leeway,
                    operation_NWP_popup_leeway=default_settings.operation_NWP_popup_leeway,
                    operation_metar_popup_level=default_settings.operation_metar_popup_level,
                    operation_taf_popup_level=default_settings.operation_taf_popup_level,
                    operation_NWP_popup_level=default_settings.operation_NWP_popup_level,
                    parking_metar_popup_level=default_settings.parking_metar_popup_level,
                    parking_taf_popup_level=default_settings.parking_taf_popup_level,
                    parking_NWP_popup_level=default_settings.parking_NWP_popup_level,
                    intercept=default_settings.intercept,
                )
            else:
                popup_settings = PopupSettings.objects.create(user_code=user_code)

        if popup_settings:
            return JsonResponse({
                'success': True,
                'data': {
                    'operation_metar_popup': popup_settings.operation_metar_popup,
                    'parking_metar_popup': popup_settings.parking_metar_popup,
                }
            })
        else:
            return JsonResponse({
                'success': False,
                'error': '未找到弹窗设置'
            }, status=404)
    
    except Exception as e:
        logger.error(f"获取弹窗设置失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '获取弹窗设置失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["POST"])
@csrf_exempt
def update_popup_settings(request, time_mode='current'):
    """
    更新弹窗设置
    
    URL参数:
        - time_mode: 时间模式（从URL路径获取）
    
    Headers:
        - X-User-Code: 用户代码（current模式需要）
    
    POST参数:
        - field: 要更新的字段名（operation_metar_popup 或 parking_metar_popup）
        - value: 布尔值（true 或 false）
    """
    try:
        from core.models import PopupSettings
        
        data = json.loads(request.body)
        field = data.get('field')
        value = data.get('value')
        
        if not field or value is None:
            return JsonResponse({
                'success': False,
                'error': '缺少必要参数'
            }, status=400)
        
        # 验证字段名
        if field not in ['operation_metar_popup', 'parking_metar_popup']:
            return JsonResponse({
                'success': False,
                'error': '无效的字段名'
            }, status=400)
        
        # 获取user_code
        if time_mode == 'test':
            user_code = 'test'
        else:
            user_code = request.headers.get('X-User-Code', 'default')
        
        # 尝试直接更新已有行（生成 SQL UPDATE，不依赖主键）
        updated_count = PopupSettings.objects.filter(user_code=user_code).update(**{field: value})

        if updated_count == 0:
            default_settings = PopupSettings.objects.filter(user_code='default').first()
            if default_settings:
                create_data = {
                    'user_code': user_code,
                    'operation_metar_popup': default_settings.operation_metar_popup,
                    'operation_taf_popup': default_settings.operation_taf_popup,
                    'operation_NWP_popup': default_settings.operation_NWP_popup,
                    'parking_metar_popup': default_settings.parking_metar_popup,
                    'parking_taf_popup_other': default_settings.parking_taf_popup_other,
                    'parking_NWP_popup': default_settings.parking_NWP_popup,
                    'operation_metar_popup_leeway': default_settings.operation_metar_popup_leeway,
                    'operation_taf_popup_leeway': default_settings.operation_taf_popup_leeway,
                    'operation_NWP_popup_leeway': default_settings.operation_NWP_popup_leeway,
                    'operation_metar_popup_level': default_settings.operation_metar_popup_level,
                    'operation_taf_popup_level': default_settings.operation_taf_popup_level,
                    'operation_NWP_popup_level': default_settings.operation_NWP_popup_level,
                    'parking_metar_popup_level': default_settings.parking_metar_popup_level,
                    'parking_taf_popup_level': default_settings.parking_taf_popup_level,
                    'parking_NWP_popup_level': default_settings.parking_NWP_popup_level,
                    'intercept': default_settings.intercept,
                }
                create_data[field] = value
                PopupSettings.objects.create(**create_data)
            else:
                PopupSettings.objects.create(user_code=user_code, **{field: value})

        # 重新查询以获取最新值返回给前端
        popup_settings = PopupSettings.objects.filter(user_code=user_code).first()
        
        return JsonResponse({
            'success': True,
            'message': '更新成功',
            'data': {
                'operation_metar_popup': popup_settings.operation_metar_popup,
                'parking_metar_popup': popup_settings.parking_metar_popup,
            }
        })
    
    except Exception as e:
        logger.error(f"更新弹窗设置失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '更新弹窗设置失败',
            'message': str(e)
        }, status=500)


@require_http_methods(["GET"])
def airport_extra_info(request, airport_code, time_mode='current'):
    """
    获取机场额外信息API（日出日落时间、跑道信息）
    """
    try:
        import requests
        from suntime import Sun
        
        # 调用aviationweather.gov API获取机场信息
        api_url = f"https://aviationweather.gov/api/data/airport?ids={airport_code}&format=json"
        
        try:
            response = requests.get(api_url, timeout=10)
            response.raise_for_status()
            airport_data = response.json()
            
            if not airport_data or len(airport_data) == 0:
                return JsonResponse({
                    'success': False,
                    'error': '未找到机场信息'
                })
            
            airport_info = airport_data[0]
            lat = airport_info.get('lat')
            lon = airport_info.get('lon')
            runways = airport_info.get('runways', [])
            
            # 计算日出日落时间
            sunrise_time = None
            sunset_time = None
            
            if lat is not None and lon is not None:
                try:
                    sun = Sun(lat, lon)
                    current_date = datetime.now().date()
                    sunrise = sun.get_sunrise_time(current_date)
                    sunset = sun.get_sunset_time(current_date)
                    
                    # 转换为北京时间并格式化为HH:MM
                    sunrise_time = sunrise.strftime('%H:%M')
                    sunset_time = sunset.strftime('%H:%M')
                except Exception as e:
                    logger.warning(f"计算日出日落时间失败: {str(e)}")
            
            # 提取跑道信息
            runway_ids = [runway.get('id', '') for runway in runways if runway.get('id')]
            
            return JsonResponse({
                'success': True,
                'data': {
                    'sunrise': sunrise_time,
                    'sunset': sunset_time,
                    'runways': runway_ids
                }
            })
            
        except requests.RequestException as e:
            logger.error(f"请求aviationweather.gov API失败: {str(e)}")
            return JsonResponse({
                'success': False,
                'error': 'API请求失败'
            })
    
    except Exception as e:
        logger.error(f"获取机场额外信息失败: {str(e)}")
        return JsonResponse({
            'success': False,
            'error': '获取机场信息失败',
            'message': str(e)
        }, status=500)


# ==============================================================================
# 实况入库异常告警 API
# ==============================================================================

@require_http_methods(["GET"])
def get_import_alerts(request, time_mode):
    """
    获取实况入库告警列表（分页）。
    未处理：data_status IN ('N','C') 且 import_alert='Y' 且 import_alert_handle_time IS NULL。
    已处理：import_alert='Y' 且 import_alert_handle_time IS NOT NULL（含已改为 H 的自动处理行）。
    排序：未处理在前，已处理在后，均按 import_alert_time 降序。
    """
    try:
        PAGE_SIZE = 10
        MAX_PAGES = 10

        try:
            page = max(1, int(request.GET.get('page', 1)))
        except (ValueError, TypeError):
            page = 1

        unhandled = list(
            Metar.objects.filter(
                data_status__in=['N', 'C'],
                import_alert='Y',
                import_alert_handle_time__isnull=True,
            ).order_by('-import_alert_time')
        )
        handled = list(
            Metar.objects.filter(
                import_alert='Y',
                import_alert_handle_time__isnull=False,
            ).order_by('-import_alert_time')
        )

        total_unhandled = len(unhandled)
        sorted_alerts = (unhandled + handled)[: MAX_PAGES * PAGE_SIZE]

        total_count = len(sorted_alerts)
        total_pages = max(1, (total_count + PAGE_SIZE - 1) // PAGE_SIZE)
        total_pages = min(total_pages, MAX_PAGES)
        page = min(page, total_pages)

        start = (page - 1) * PAGE_SIZE
        page_alerts = sorted_alerts[start: start + PAGE_SIZE]

        def _fmt(m):
            return {
                'sqc': m.sqc,
                'airport_4code': m.airport_4code,
                'metar_type': m.metar_type or 'METAR',
                'import_alert_time': m.import_alert_time,
                'metar_observation_time': m.metar_observation_time,
                'created_at': m.created_at,
                'handle_status': m.handle_status if m.handle_status is not None else '',
                'import_alert_handle_time': m.import_alert_handle_time,
            }

        return JsonResponse({
            'success': True,
            'alerts': [_fmt(m) for m in page_alerts],
            'total_unhandled': total_unhandled,
            'total_pages': total_pages,
            'current_page': page,
        })

    except Exception as e:
        logger.error(f"获取实况入库告警列表失败: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e),
            'alerts': [],
            'total_unhandled': 0,
            'total_pages': 1,
            'current_page': 1,
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def handle_import_alert(request, time_mode):
    """
    处理实况入库告警：通过 sqc 定位 metar 行，写入 import_alert_handle_time 和 handle_status。
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, Exception):
        return JsonResponse({'success': False, 'error': '请求数据格式错误'}, status=400)

    sqc = data.get('sqc')
    import_alert_handle_time = data.get('import_alert_handle_time')
    handle_status = data.get('handle_status', '')

    if not sqc:
        return JsonResponse({'success': False, 'error': '缺少 sqc 标识'}, status=400)

    try:
        metar = Metar.objects.get(sqc=sqc)
        metar.import_alert_handle_time = import_alert_handle_time
        metar.handle_status = handle_status
        metar.save(update_fields=['import_alert_handle_time', 'handle_status'])
        return JsonResponse({'success': True})
    except Metar.DoesNotExist:
        return JsonResponse({'success': False, 'error': '告警记录不存在'}, status=404)
    except Exception as e:
        logger.error(f"处理告警失败: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


def get_taf_import_alerts(request, time_mode):
    """
    获取预报入库告警列表（分页）。
    未处理：data_status IN ('N','C') 且 import_alert='Y' 且 import_alert_handle_time IS NULL。
    已处理：import_alert='Y' 且 import_alert_handle_time IS NOT NULL（含 H 行自动处理记录）。
    排序：未处理在前，已处理在后，均按 created_at 降序。
    taf_type 字段由 airport_info.taf_init_time 决定：6→FT，3→FC，其他→TAF。
    """
    try:
        PAGE_SIZE = 10
        MAX_PAGES = 10

        try:
            page = max(1, int(request.GET.get('page', 1)))
        except (ValueError, TypeError):
            page = 1

        unhandled = list(
            Taf.objects.filter(
                data_status__in=['N', 'C'],
                import_alert='Y',
                import_alert_handle_time__isnull=True,
            ).order_by('-created_at')
        )
        handled = list(
            Taf.objects.filter(
                import_alert='Y',
                import_alert_handle_time__isnull=False,
            ).order_by('-created_at')
        )

        total_unhandled = len(unhandled)
        sorted_alerts = (unhandled + handled)[: MAX_PAGES * PAGE_SIZE]

        # 批量查询 airport_info.taf_init_time 用于生成 taf_type
        airport_codes = list({t.airport_4code for t in sorted_alerts})
        init_time_map = {
            a.airport_4code: a.taf_init_time
            for a in AirportInfo.objects.filter(airport_4code__in=airport_codes).only(
                'airport_4code', 'taf_init_time'
            )
        }

        def _taf_type(airport_code):
            init_t = init_time_map.get(airport_code)
            if init_t == 6:
                return 'FT'
            elif init_t == 3:
                return 'FC'
            return 'TAF'

        total_count = len(sorted_alerts)
        total_pages = max(1, (total_count + PAGE_SIZE - 1) // PAGE_SIZE)
        total_pages = min(total_pages, MAX_PAGES)
        page = min(page, total_pages)

        start = (page - 1) * PAGE_SIZE
        page_alerts = sorted_alerts[start: start + PAGE_SIZE]

        def _fmt(t):
            return {
                'sqc': t.sqc,
                'airport_4code': t.airport_4code,
                'taf_type': _taf_type(t.airport_4code),
                'import_alert_time': t.import_alert_time,
                'taf_observation_time': t.taf_observation_time,
                'created_at': t.created_at,
                'handle_status': t.handle_status if t.handle_status is not None else '',
                'import_alert_handle_time': t.import_alert_handle_time,
            }

        return JsonResponse({
            'success': True,
            'alerts': [_fmt(t) for t in page_alerts],
            'total_unhandled': total_unhandled,
            'total_pages': total_pages,
            'current_page': page,
        })

    except Exception as e:
        logger.error(f"获取预报入库告警列表失败: {e}")
        return JsonResponse({
            'success': False,
            'error': str(e),
            'alerts': [],
            'total_unhandled': 0,
            'total_pages': 1,
            'current_page': 1,
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def handle_taf_import_alert(request, time_mode):
    """
    处理预报入库告警：通过 sqc 定位 taf 行，写入 import_alert_handle_time 和 handle_status。
    """
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, Exception):
        return JsonResponse({'success': False, 'error': '请求数据格式错误'}, status=400)

    sqc = data.get('sqc')
    import_alert_handle_time = data.get('import_alert_handle_time')
    handle_status = data.get('handle_status', '')

    if not sqc:
        return JsonResponse({'success': False, 'error': '缺少 sqc 标识'}, status=400)

    try:
        taf = Taf.objects.get(sqc=sqc)
        taf.import_alert_handle_time = import_alert_handle_time
        taf.handle_status = handle_status
        taf.save(update_fields=['import_alert_handle_time', 'handle_status'])
        return JsonResponse({'success': True})
    except Taf.DoesNotExist:
        return JsonResponse({'success': False, 'error': '告警记录不存在'}, status=404)
    except Exception as e:
        logger.error(f"处理TAF告警失败: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def get_nwp_data(request, time_mode='current'):
    """
    返回当前模块级 NWP 缓存数据。
    数据由 NwpParser.fetch_and_filter() 在解析时写入，
    前端在 NWP 温度辅助功能开启时轮询此接口。
    """
    try:
        from parsers.NWP import get_nwp_cache, get_nwp_last_updated
        return JsonResponse({
            'success': True,
            'data': get_nwp_cache(),
            'last_updated': get_nwp_last_updated(),
        })
    except Exception as e:
        logger.error(f"获取NWP数据失败: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@require_http_methods(["GET"])
def get_airport_flight_status(request, time_mode='current'):
    """
    批量获取所有机场的5项实况状态（供地图模式Tooltip使用）
    返回: { airport_4code: { closest_departure_time_of_arriving_flight, closest_landing_time_of_arriving_flight,
                              closest_departure_time_at_this_airport, en_route, has_parking } }
    """
    try:
        from core.models import AircraftParkingInfo

        flights = Flight.objects.all()

        parking_airports = set()
        latest_parking = AircraftParkingInfo.objects.order_by('-parse_time').first()
        if latest_parking and latest_parking.airport_4code:
            parking_list = latest_parking.airport_4code
            if isinstance(parking_list, str):
                parking_list = json.loads(parking_list)
            if isinstance(parking_list, list):
                parking_airports = set(parking_list)

        result = {}
        for flight in flights:
            code = flight.airport_4code
            result[code] = {
                'closest_departure_time_of_arriving_flight': flight.closest_departure_time_of_arriving_flight,
                'closest_landing_time_of_arriving_flight': flight.closest_landing_time_of_arriving_flight,
                'closest_departure_time_at_this_airport': flight.closest_departure_time_at_this_airport,
                'en_route': bool(flight.en_route) if flight.en_route is not None else False,
                'has_parking': code in parking_airports,
            }

        return JsonResponse({'success': True, 'data': result})

    except Exception as e:
        logger.error(f"获取机场实况状态失败: {str(e)}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)
