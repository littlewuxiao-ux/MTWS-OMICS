"""
记录每一次请求顺丰 CAS / 内网业务 API 时的用户工号。

工号与 token 是分开的：token 负责鉴权，工号只是展示/落库身份。
占位工号（如 --）时仍可能带着有效 token 把外部接口调通。
"""

from contextlib import contextmanager
from contextvars import ContextVar
import logging

logger = logging.getLogger('mtws.cas_api')

_current_user_id = ContextVar('mtws_cas_user_id', default=None)


def resolve_cas_user_id(explicit=None):
    if explicit not in (None, ''):
        return str(explicit).strip()
    bound = _current_user_id.get()
    if bound:
        return str(bound).strip()
    try:
        from parsers.scheduler import get_scheduler_user_code
        code = get_scheduler_user_code()
        if code:
            return str(code).strip()
    except Exception:
        pass
    return None


@contextmanager
def cas_user_context(user_id):
    token = _current_user_id.set(str(user_id).strip() if user_id else None)
    try:
        yield
    finally:
        _current_user_id.reset(token)


def log_cas_api_request(endpoint, user_id=None, has_token=None):
    """NWP 等非 CAS 接口不要调用本函数。"""
    uid = resolve_cas_user_id(user_id) or '(未知)'
    token_flag = '有' if has_token else ('无' if has_token is False else '未标明')
    logger.info(f'CAS外部API请求 user_id={uid} has_token={token_flag} endpoint={endpoint}')
