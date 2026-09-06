"""
丰声 CAS 网页扫码桥接（requests 会话与 cas_login.py 一致，供 Node /api/sf-foc/cas/* 调用）

用法（项目根）：
  python tools/cas_web_bridge.py start
  python tools/cas_web_bridge.py poll <sessionId>
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone

import requests

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SESSIONS_DIR = os.path.join(ROOT, "data", "cas-web-sessions")
CAS_LOG_PATH = os.path.join(ROOT, "data", "cas-web.log")

GET_QR_URL = "https://cas.sf-express.com/cas/qrcode?type=cXJjb2Rl"
POLL_QR_URL = "https://cas.sf-express.com/cas/qrcode?type=dmFsaWRhdGlvbg"
GET_CONFIG_URL = "https://cas.sf-express.com/cas/app/getConfig"

SESSION_TTL_SEC = 10 * 60

# 复用 cas_login 的配置读写与 validate
sys.path.insert(0, os.path.dirname(__file__))
from cas_login import (  # noqa: E402
    get_cas_settings,
    load_workbench_cfg,
)


def cas_log(message: str) -> None:
    line = f"[{datetime.now(timezone.utc).isoformat()}] {message}\n"
    try:
        with open(CAS_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass


def emit(payload: dict) -> None:
    # Windows 下避免中文经控制台编码变成乱码（Node 按 utf-8 读 stdout）
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def session_file(session_id: str) -> str:
    return os.path.join(SESSIONS_DIR, f"{session_id}.json")


def purge_old_sessions() -> None:
    if not os.path.isdir(SESSIONS_DIR):
        return
    now = time.time()
    for name in os.listdir(SESSIONS_DIR):
        path = os.path.join(SESSIONS_DIR, name)
        try:
            if now - os.path.getmtime(path) > SESSION_TTL_SEC:
                os.remove(path)
        except OSError:
            pass


def load_state(session_id: str) -> dict | None:
    path = session_file(session_id)
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def save_state(session_id: str, state: dict) -> None:
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    tmp = session_file(session_id) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, session_file(session_id))


def get_config(http: requests.Session) -> dict:
    res = http.post(GET_CONFIG_URL, json={"serviceId": "sfa-gwgw-inn.sf-airlines.com"}, timeout=30)
    res.raise_for_status()
    return res.json()


def fetch_qr(http: requests.Session, config: dict) -> dict:
    headers = {"routing": config.get("routing")}
    res = http.get(GET_QR_URL, headers=headers, timeout=30)
    res.raise_for_status()
    data = res.json().get("data") or {}
    if not data.get("id") or not data.get("img"):
        raise RuntimeError("CAS 二维码获取失败")
    return data


def poll_scan_once(http: requests.Session, config: dict, qr_id: str):
    headers = {"routing": config.get("routing")}
    params = {
        "routing": config.get("routing"),
        "id": qr_id,
        "responseHeaders": "true",
    }
    res = http.get(POLL_QR_URL, headers=headers, params=params, timeout=30)
    body = res.json()
    if body.get("success") is True:
        return body.get("data")
    return None


def validate_login(http: requests.Session, config: dict, scan: dict, cas_settings: dict) -> str:
    headers = {"routing": config.get("routing")}
    decode_once = base64.b64decode(scan.get("id")).decode("ascii")
    decode_twice = base64.b64decode(decode_once).decode("ascii")
    payload = {
        "st": scan.get("ticket"),
        "service": decode_twice,
        "appKey": cas_settings["app_key"],
        "appSecret": cas_settings["app_secret"],
    }
    res = http.post(cas_settings["validate_url"], headers=headers, json=payload, timeout=30)
    try:
        body = res.json()
    except Exception as exc:
        raise RuntimeError(f"CAS validate 响应不是 JSON: HTTP {res.status_code} {res.text[:300]}") from exc
    if res.status_code >= 400:
        raise RuntimeError(f"CAS validate HTTP {res.status_code}: {res.text[:300]}")
    if body.get("success") is False:
        msg = body.get("errorMessage") or body.get("message") or res.text[:300]
        raise RuntimeError(f"CAS validate 失败: {msg}")
    obj = body.get("obj")
    token = obj.get("token") if isinstance(obj, dict) else None
    if not token:
        raise RuntimeError(f"CAS validate 未返回 token: {res.text[:500]}")
    return str(token).strip()


def restore_http(state: dict) -> requests.Session:
    http = requests.Session()
    cookies = state.get("cookies") or {}
    if isinstance(cookies, dict):
        http.cookies.update(cookies)
    return http


def cmd_start() -> dict:
    purge_old_sessions()
    http = requests.Session()
    config = get_config(http)
    qr = fetch_qr(http, config)
    session_id = uuid.uuid4().hex
    cfg = load_workbench_cfg()
    cas_settings = get_cas_settings(cfg)
    state = {
        "sessionId": session_id,
        "createdAt": time.time(),
        "config": config,
        "qrId": qr["id"],
        "cookies": http.cookies.get_dict(),
        "status": "pending",
        "processing": False,
        "userCode": None,
        "error": None,
    }
    save_state(session_id, state)
    cas_log(f"start session {session_id[:8]} appKey={cas_settings['app_key']} (python)")
    return {
        "success": True,
        "sessionId": session_id,
        "qrImageBase64": qr["img"],
        "appKey": cas_settings["app_key"],
        "message": "请使用丰声 Next 扫描二维码",
    }


def cmd_poll(session_id: str) -> dict:
    purge_old_sessions()
    state = load_state(session_id)
    if not state:
        return {"success": True, "status": "expired", "message": "扫码会话已过期，请刷新二维码"}
    if state.get("status") == "done":
        return {
            "success": True,
            "status": "done",
            "userCode": state.get("userCode"),
            "token": state.get("token"),
        }
    if state.get("status") == "error":
        return {"success": True, "status": "error", "message": state.get("error") or "登录失败"}
    if state.get("processing"):
        return {"success": True, "status": "pending", "message": "正在确认扫码，请稍候…"}

    http = restore_http(state)
    config = state.get("config") or {}
    qr_id = state.get("qrId")
    if not qr_id:
        return {"success": True, "status": "error", "message": "扫码会话数据损坏，请刷新二维码"}

    try:
        scan = poll_scan_once(http, config, qr_id)
        state["cookies"] = http.cookies.get_dict()
        save_state(session_id, state)
        if not scan:
            return {"success": True, "status": "pending", "message": "等待丰声确认扫码…"}

        state["processing"] = True
        save_state(session_id, state)

        user_code = scan.get("userCode") if isinstance(scan, dict) else None
        cas_log(f"scan ok session {session_id[:8]} user={user_code or '?'} (python)")

        cfg = load_workbench_cfg()
        cas_settings = get_cas_settings(cfg)
        token = validate_login(http, config, scan, cas_settings)
        cas_log(f"done session {session_id[:8]} token={token[:12]}… (python)")

        state["status"] = "done"
        state["processing"] = False
        state["userCode"] = user_code
        state["token"] = token
        state["cookies"] = http.cookies.get_dict()
        save_state(session_id, state)
        return {"success": True, "status": "done", "userCode": user_code, "token": token}
    except Exception as exc:
        msg = str(exc)
        state["processing"] = False
        state["status"] = "error"
        state["error"] = msg
        state["cookies"] = http.cookies.get_dict()
        save_state(session_id, state)
        cas_log(f"error session {session_id[:8]}: {msg}")
        return {"success": True, "status": "error", "message": msg}


def main() -> int:
    if len(sys.argv) < 2:
        emit({"success": False, "message": "用法: cas_web_bridge.py start | poll <sessionId>"})
        return 1
    try:
        cmd = sys.argv[1].lower()
        if cmd == "start":
            emit(cmd_start())
            return 0
        if cmd == "poll":
            if len(sys.argv) < 3:
                emit({"success": False, "message": "缺少 sessionId"})
                return 1
            emit(cmd_poll(sys.argv[2].strip()))
            return 0
        emit({"success": False, "message": f"未知命令: {cmd}"})
        return 1
    except Exception as exc:
        cas_log(f"bridge fatal: {exc}")
        emit({"success": False, "status": "error", "message": str(exc)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
