"""
后端定时解析调度器
使用 APScheduler 按 DataRefreshTimer 配置独立定时执行解析，
解析频次与前端客户端数量无关。

token 缓存机制：
- current 模式下，external API 需要用户 token 认证
- 首次由前端手动刷新（刷新按钮或页面加载）时，trigger_parsing 视图
  会调用 set_scheduler_token() 将 token 存入此模块
- 后续调度任务复用该缓存 token，直到下次手动刷新覆盖
"""

import logging
import sys
import threading
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger('mtws.scheduler')

_scheduler_token: Optional[str] = None
_scheduler_started: bool = False
_nwp_enabled: bool = False

# 内存中记录最近一次解析结果（调度器 和 手动刷新 均会更新）
# success: None=尚未运行, True=成功, False=失败
# time: 最近一次成功解析的 ISO 时间字符串
# message: 失败时的错误描述
_parsing_status: dict = {
    'metar':  {'success': None, 'time': None, 'message': ''},
    'taf':    {'success': None, 'time': None, 'message': ''},
    'flight': {'success': None, 'time': None, 'message': ''},
}

# 实时执行状态：'idle' | 'queued' | 'running' | 'done'
# 供前端查询是否有解析程序正在运行或排队
_parser_exec_lock = threading.Lock()
_parser_exec_status: dict = {
    'flight':           'idle',
    'metar':            'idle',
    'taf':              'idle',
    'aircraft_parking': 'idle',
    'nwp':              'idle',
}


def update_parsing_status(data_type: str, success: bool, message: str = '') -> None:
    """更新指定数据类型的解析状态（调度器任务和 trigger_parsing 视图均调用此函数）"""
    if data_type not in _parsing_status:
        return
    _parsing_status[data_type]['success'] = success
    _parsing_status[data_type]['message'] = message
    if success:
        _parsing_status[data_type]['time'] = datetime.now().isoformat()


def get_parsing_status() -> dict:
    """返回所有数据类型的解析状态快照（供 overview 接口附加到响应中）"""
    return {k: dict(v) for k, v in _parsing_status.items()}


def set_parser_exec_status(data_type: str, status: str) -> None:
    """更新指定解析器的实时执行状态（running/queued/done/idle）"""
    with _parser_exec_lock:
        if data_type in _parser_exec_status:
            _parser_exec_status[data_type] = status


def get_running_parsers() -> dict:
    """返回当前正在执行或排队中的解析器列表，供前端查询是否可以触发刷新"""
    with _parser_exec_lock:
        running = [k for k, v in _parser_exec_status.items() if v == 'running']
        queued  = [k for k, v in _parser_exec_status.items() if v == 'queued']
    return {'running': running, 'queued': queued}


def set_scheduler_token(token: str) -> None:
    """缓存 token，供后台调度任务使用（由 trigger_parsing 视图调用）"""
    global _scheduler_token
    if token:
        _scheduler_token = token


def get_scheduler_token() -> Optional[str]:
    return _scheduler_token


def set_nwp_enabled(enabled: bool) -> None:
    """缓存 NWP 温度辅助开关状态（由 trigger_parsing 视图调用）"""
    global _nwp_enabled
    _nwp_enabled = bool(enabled)


def get_nwp_enabled() -> bool:
    return _nwp_enabled


def _run_parsing_job(update_types: list, time_mode: str) -> None:
    """APScheduler 调用的解析任务主函数"""
    from parsers.parsing_manager import ParsingManager

    token = _scheduler_token
    if time_mode == 'current' and not token:
        logger.warning(
            f"调度任务跳过 {update_types}：尚无缓存 token，"
            "请先通过前端手动刷新一次以完成 token 缓存"
        )
        return

    try:
        logger.info(f"调度任务启动：{update_types}，模式：{time_mode}")
        manager = ParsingManager(time_mode=time_mode, token=token, user_code='scheduler')
        result = manager.run_selective_parsing(update_types, time_mode=time_mode)
        parsers_result = result.get('parsers', {})
        if result.get('success'):
            total = result.get('total_records', 0)
            logger.info(f"调度任务完成：{update_types}，共 {total} 条记录")
        else:
            logger.warning(f"调度任务失败：{update_types}，{result.get('message', '')}")
        # 更新各数据类型的内存解析状态
        for data_type in update_types:
            pr = parsers_result.get(data_type, {})
            update_parsing_status(
                data_type,
                success=pr.get('success', False),
                message=pr.get('message', '') or ('' if pr.get('success') else '解析失败'),
            )
        # NWP 与 TAF 同频：当 TAF 调度任务运行且 NWP 开关开启时附带执行
        if _nwp_enabled and 'taf' in update_types:
            set_parser_exec_status('nwp', 'running')
            try:
                from parsers.NWP import NwpParser
                NwpParser().fetch_and_filter()
                logger.info("NWP 调度解析完成")
            except Exception as nwp_err:
                logger.error(f"NWP 调度解析失败：{nwp_err}")
            finally:
                set_parser_exec_status('nwp', 'done')

    except Exception as e:
        logger.error(f"调度任务异常：{update_types}，{e}", exc_info=True)
        for data_type in update_types:
            update_parsing_status(data_type, success=False, message=str(e))


def start_scheduler() -> None:
    """读取 DataRefreshTimer 配置并启动 APScheduler 后台调度器"""
    global _scheduler_started

    if _scheduler_started:
        return

    # 在 migrate / makemigrations / collectstatic 等管理命令中不启动调度器
    skip_commands = {
        'migrate', 'makemigrations', 'collectstatic', 'shell',
        'test', 'check', 'showmigrations', 'sqlmigrate',
    }
    if len(sys.argv) > 1 and sys.argv[1] in skip_commands:
        return

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.interval import IntervalTrigger

        # 调度器固定使用 current 时间模式（生产模式）
        time_mode = 'current'

        from core.models import DataRefreshTimer
        timers = list(DataRefreshTimer.objects.all())
        if not timers:
            logger.warning("DataRefreshTimer 表为空，后端调度器不启动")
            return

        scheduler = BackgroundScheduler()
        now = datetime.now()

        for timer in timers:
            update_types = [timer.data]          # 'metar' / 'taf' / 'flight'
            interval_minutes = float(timer.interval)
            init_minutes = float(timer.init_time)

            # 计算首次触发时间：从当前整点 + init_time 开始按 interval 推算，
            # 确保第一次执行落在未来
            start_of_hour = now.replace(minute=0, second=0, microsecond=0)
            first_run = start_of_hour + timedelta(minutes=init_minutes)
            while first_run <= now:
                first_run += timedelta(minutes=interval_minutes)

            scheduler.add_job(
                func=_run_parsing_job,
                trigger=IntervalTrigger(
                    minutes=interval_minutes,
                    start_date=first_run,
                ),
                args=[update_types, time_mode],
                id=f'scheduled_{timer.data}',
                replace_existing=True,
                misfire_grace_time=60,  # 允许最多 60 秒执行延迟
            )
            logger.info(
                f"调度任务注册：{timer.data}，"
                f"间隔 {interval_minutes} 分钟，"
                f"首次执行 {first_run.strftime('%H:%M:%S')}"
            )

        scheduler.start()
        _scheduler_started = True
        logger.info("APScheduler 后端调度器已启动")

    except Exception as e:
        logger.error(f"APScheduler 启动失败：{e}", exc_info=True)
