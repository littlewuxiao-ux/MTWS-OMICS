"""
丰声 CAS 扫码登录 → 获取 token 并写入工作台 data/sf-foc-config.local.json

依赖：pip install requests pillow

用法（在项目根）：
  python tools/cas_login.py

appKey / appSecret 优先读 data/sf-foc-config.local.json 的 casAppKey / casAppSecret。
IT 示例 appKey 为 sfaAlgo/sfaAlgo（生产 CAS，以 IT 确认为准）。
"""
import base64
import json
import os
import sys
import time
from datetime import datetime, timezone
from io import BytesIO

import requests
from PIL import Image

session = requests.session()

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WORKBENCH_CONFIG_PATH = os.path.join(ROOT, "data", "sf-foc-config.local.json")
WORKBENCH_CONFIG_EXAMPLE = os.path.join(ROOT, "data", "sf-foc-config.local.json.example")

DEFAULT_VALIDATE_URL = "https://sfa-gwgw-inn.sf-airlines.com:8443/apis-auth/login/cas3.0"
DEFAULT_CAS_APP_KEY = "sfaAlgo"
DEFAULT_CAS_APP_SECRET = "sfaAlgo"

get_qar_url = "https://cas.sf-express.com/cas/qrcode?type=cXJjb2Rl"
listion_scan_qrcode_url = "https://cas.sf-express.com/cas/qrcode?type=dmFsaWRhdGlvbg"


def load_json_file(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def load_workbench_cfg():
    cfg = {}
    for path in (WORKBENCH_CONFIG_PATH, WORKBENCH_CONFIG_EXAMPLE):
        if os.path.exists(path):
            try:
                cfg = load_json_file(path)
                break
            except Exception as e:
                print(f"读取配置失败 {path}: {e}")
    return cfg


def load_cfg_for_save():
    for path in (WORKBENCH_CONFIG_PATH, WORKBENCH_CONFIG_EXAMPLE):
        if not os.path.exists(path):
            continue
        try:
            cfg = load_json_file(path)
            if cfg.get("systemKey") == "向 IT 索取后填入":
                cfg["systemKey"] = ""
            if cfg.get("accessKey") == "向 IT 索取后填入":
                cfg["accessKey"] = ""
            return cfg, path
        except Exception as e:
            print(f"警告: 无法解析 {path}: {e}")
    return {}, None


def get_cas_settings(cfg):
    return {
        "validate_url": (
            cfg.get("casValidateUrl")
            or os.environ.get("CAS_VALIDATE_URL")
            or DEFAULT_VALIDATE_URL
        ),
        "app_key": cfg.get("casAppKey") or os.environ.get("CAS_APP_KEY") or DEFAULT_CAS_APP_KEY,
        "app_secret": cfg.get("casAppSecret")
        or os.environ.get("CAS_APP_SECRET")
        or DEFAULT_CAS_APP_SECRET,
    }


def parse_jwt_exp_iso(token):
    try:
        parts = str(token or "").split(".")
        if len(parts) < 2:
            return None
        pad = "=" * (-len(parts[1]) % 4)
        payload = json.loads(base64.urlsafe_b64decode(parts[1] + pad).decode("utf-8"))
        exp = payload.get("exp")
        if exp is None:
            return None
        return datetime.fromtimestamp(int(exp), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


def get_config():
    data = {"serviceId": "sfa-gwgw-inn.sf-airlines.com"}
    url = "https://cas.sf-express.com/cas/app/getConfig"
    response = session.post(url=url, json=data)
    response.raise_for_status()
    return json.loads(response.text)


def qrcode_login(config):
    headers = {"routing": config.get("routing")}
    response = session.get(get_qar_url, headers=headers)
    response.raise_for_status()
    json_str = json.loads(response.text).get("data")
    img_data = base64.b64decode(json_str.get("img"))
    img = Image.open(BytesIO(img_data))
    img.show()
    listen_times = 0
    while True:
        time.sleep(2)
        params = {
            "routing": config.get("routing"),
            "id": json_str.get("id"),
            "responseHeaders": "true",
        }
        response2 = session.get(listion_scan_qrcode_url, params=params)
        body = json.loads(response2.text)
        if body.get("success") is True:
            json_str2 = body.get("data")
            print("扫码成功:" + json_str2.get("userCode"))
            return json_str2
        listen_times += 1
        print("第" + str(listen_times) + "次请求扫码结果失败")


def validate_login(config, scan_qrcode_result, cas_settings):
    headers = {"routing": config.get("routing")}
    decode_once = base64.b64decode(scan_qrcode_result.get("id")).decode("ascii")
    decode_twice = base64.b64decode(decode_once).decode("ascii")
    data = {
        "st": scan_qrcode_result.get("ticket"),
        "service": decode_twice,
        "appKey": cas_settings["app_key"],
        "appSecret": cas_settings["app_secret"],
    }
    response = session.post(cas_settings["validate_url"], headers=headers, json=data)
    try:
        json_str = json.loads(response.text)
    except Exception as exc:
        raise RuntimeError(f"CAS validate 响应不是 JSON: HTTP {response.status_code} {response.text[:300]}") from exc

    if response.status_code >= 400:
        raise RuntimeError(f"CAS validate HTTP {response.status_code}: {response.text[:300]}")

    if json_str.get("success") is False:
        msg = json_str.get("errorMessage") or json_str.get("message") or response.text[:300]
        raise RuntimeError(f"CAS validate 失败: {msg}")

    obj = json_str.get("obj")
    token = obj.get("token") if isinstance(obj, dict) else None
    if not token:
        raise RuntimeError(f"CAS validate 未返回 token，响应: {response.text[:500]}")

    print("登录成功 (appKey=%s)" % cas_settings["app_key"])
    return str(token).strip()


def save_token_to_workbench(token):
    token = str(token or "").strip()
    if not token:
        raise ValueError("token 为空，无法写入")

    cfg, loaded_from = load_cfg_for_save()
    if loaded_from and loaded_from != WORKBENCH_CONFIG_PATH:
        print(f"提示: 从模板创建 {WORKBENCH_CONFIG_PATH}（原文件不存在）")

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cfg["token"] = token
    cfg["tokenObtainedAt"] = now_iso
    jwt_exp = parse_jwt_exp_iso(token)
    if jwt_exp:
        cfg["tokenExpiresAt"] = jwt_exp
    elif cfg.get("tokenExpiresAt"):
        del cfg["tokenExpiresAt"]

    os.makedirs(os.path.dirname(WORKBENCH_CONFIG_PATH), exist_ok=True)
    tmp_path = WORKBENCH_CONFIG_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp_path, WORKBENCH_CONFIG_PATH)

    saved = load_json_file(WORKBENCH_CONFIG_PATH)
    if str(saved.get("token") or "").strip() != token:
        raise RuntimeError("写入校验失败：文件内容与 token 不一致")

    print(f"token 已写入: {WORKBENCH_CONFIG_PATH}")
    print(f"token 前缀: {token[:16]}…")
    if jwt_exp:
        print(f"JWT 过期时间(UTC): {jwt_exp}")
    else:
        ttl = cfg.get("tokenTtlHours", 12)
        print(f"未解析到 JWT 过期，工作台按约 {ttl} 小时估算提醒续登")


def login():
    cfg = load_workbench_cfg()
    cas_settings = get_cas_settings(cfg)
    print("配置文件路径:", WORKBENCH_CONFIG_PATH)
    print("正在登录 CAS（丰声 Next 扫码）")
    print("validate: %s" % cas_settings["validate_url"])
    print("appKey: %s" % cas_settings["app_key"])
    config = get_config()
    scan_qrcode_result = qrcode_login(config)
    return validate_login(config, scan_qrcode_result, cas_settings)


def try_push_auth_broker(token, user_code=None):
    try:
        requests.post(
            "http://127.0.0.1:19529/auth/update",
            json={"token": token, "userCode": user_code or "IWBP", "source": "IWBP-cas_login"},
            timeout=2,
        )
        print("已同步到统一登录态 AuthBroker（若启动器在运行）")
    except Exception:
        print("未连接到统一启动器 AuthBroker，请在工作台页面扫码以写入运行时 token")


def main():
    try:
        cas_token = login()
        print("\n✓ 扫码成功。token 不再写入 json，请在工作台 / MTWS / OMICS 页面使用统一登录。")
        print(f"token 前缀: {cas_token[:16]}…")
        try_push_auth_broker(cas_token)
        return 0
    except Exception as exc:
        print(f"\n✗ 登录失败: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
