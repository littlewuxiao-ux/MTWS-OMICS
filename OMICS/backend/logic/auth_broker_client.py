"""
统一登录态 AuthBroker 客户端

供后端在前端未传 token 时（例如未来新增的无前端定时任务场景）主动查询
launcher.py 中的 AuthBroker（127.0.0.1:19529）获取当前有效 token。
"""

import logging
import time
from typing import Optional, Tuple

logger = logging.getLogger('omics.auth_broker_client')

AUTH_BROKER_BASE_URL = "http://127.0.0.1:19529"
DEFAULT_RETRY_TIMES = 3
DEFAULT_RETRY_INTERVAL_SECONDS = 5


def get_token_from_broker(
    retry_times: int = DEFAULT_RETRY_TIMES,
    retry_interval: float = DEFAULT_RETRY_INTERVAL_SECONDS,
) -> Tuple[Optional[str], Optional[str], bool]:
    """
    查询 AuthBroker 获取当前统一登录态。

    Args:
        retry_times: 查询失败（网络异常/launcher未启动）时的重试次数。
            注意：若在处理前端实时请求的过程中调用，应将 retry_times 设为 1，
            避免因重试阻塞用户请求。
        retry_interval: 每次重试的间隔秒数

    Returns:
        (token, user_code, reachable)
        - token 为 None 表示未登录/已过期/无法确认
        - reachable 为 False 表示重试后仍无法连接 AuthBroker（不代表 token 一定失效）
    """
    import requests

    last_error = None
    for attempt in range(1, retry_times + 1):
        try:
            resp = requests.get(f"{AUTH_BROKER_BASE_URL}/auth/status", timeout=3)
            data = resp.json()
            user_code = data.get("userCode")
            if data.get("logged_in") and data.get("token") and user_code and str(user_code).strip() not in ("--", "-"):
                return data.get("token"), user_code, True
            return None, None, True
        except Exception as e:
            last_error = e
            if attempt < retry_times:
                time.sleep(retry_interval)

    logger.warning(f"查询 AuthBroker 失败，已重试 {retry_times} 次：{last_error}")
    return None, None, False


def report_token_invalid(source: str) -> None:
    """确认 token 已失效时上报给 AuthBroker，使统一服务启动器立即显示过期提示"""
    import requests

    try:
        requests.post(
            f"{AUTH_BROKER_BASE_URL}/auth/clear",
            json={"source": source, "expired": True},
            timeout=3,
        )
    except Exception as e:
        logger.warning(f"上报 token 失效状态给 AuthBroker 失败：{e}")
