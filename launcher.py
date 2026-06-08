"""
统一服务启动器 (Unified Launcher)
深色 macOS 风格 · CustomTkinter · 双服务双屏日志 + 后台 Nginx 统一入口

一个入口同时启动并监控三个服务：
  ① MTWS 航空气象监控系统   (Django, 内部端口 8001)
  ② OMICS 预报评定/发布工具 (Flask+Waitress, 内部端口 8002)
  ③ Nginx 统一入口          (对外端口 8000，/mtws/ 与 /omics/)

设计要点：
  - 两个业务服务对称处理：subprocess.Popen + CREATE_NO_WINDOW（无黑框）+ 读 stdout
  - 界面只显示 MTWS / OMICS 两个业务面板；Nginx 作为后台统一入口由启动器静默管理
  - 路径可配置：通过 launcher_config.json 记录两个项目的路径，不必放同一文件夹
  - 任一服务未启动 → 对应面板显示「服务未启动」状态
  - MTWS 启动方式与原 server_gui.py 完全一致，显示效果不变

注意：本文件不改动 server_gui.py / main.py，作为独立启动器存在。
"""

import customtkinter as ctk
import base64
import io
import subprocess
import threading
import webbrowser
import sys
import os
import json
import queue
import socket
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    requests = None

try:
    import pystray
    from PIL import Image, ImageDraw
    TRAY_AVAILABLE = True
except ImportError:
    TRAY_AVAILABLE = False

# ── 路径常量 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
CONFIG_PATH = SCRIPT_DIR / "launcher_config.json"
IPC_PORT    = 19528          # 单实例 IPC（与 MTWS 的 19527 错开）
AUTH_BROKER_PORT = 19529     # 控制台登录态中转接口（仅 127.0.0.1）
DEFAULT_MTWS_DIR = SCRIPT_DIR / "MTWS"
DEFAULT_OMICS_DIR = SCRIPT_DIR / "OMICS 5.8"
ICON_PATH = SCRIPT_DIR / "图标.png" if (SCRIPT_DIR / "图标.png").exists() else SCRIPT_DIR.parent / "图标.png"
NGINX_DIR = DEFAULT_OMICS_DIR / "tools" / "nginx"
# Windows 版 Nginx 对中文路径支持很差；运行前缀必须放到纯英文路径。
NGINX_RUNTIME_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "MTWS_OMICS_Nginx"
NGINX_CONF_DIR = NGINX_RUNTIME_DIR / "conf"
NGINX_LOG_DIR = NGINX_RUNTIME_DIR / "logs"

# ── macOS 深色系统配色（沿用 server_gui.py 同款）────────────────────────────────
BG_PRIMARY        = "#1c1c1e"
BG_SECONDARY      = "#2c2c2e"
BG_TERTIARY       = "#3a3a3c"
BG_GROUPED        = "#48484a"
COLOR_BLUE        = "#0a84ff"
COLOR_GREEN       = "#30d158"
COLOR_RED         = "#ff453a"
COLOR_ORANGE      = "#ff9f0a"
COLOR_LABEL       = "#ffffff"
COLOR_LABEL2      = "#ebebf5"
COLOR_SEPARATOR   = "#38383a"

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("dark-blue")


OMICS_INLINE_CODE = 'import os, sys, argparse, logging\ntry:\n    sys.stdout.reconfigure(encoding=\'utf-8\', errors=\'replace\')\n    sys.stderr.reconfigure(encoding=\'utf-8\', errors=\'replace\')\nexcept Exception:\n    pass\nparser = argparse.ArgumentParser(description=\'OMICS inline server\')\nparser.add_argument(\'--host\', default=\'127.0.0.1\')\nparser.add_argument(\'--port\', type=int, default=56789)\nparser.add_argument(\'--work-dir\', required=True)\nargs = parser.parse_args()\nwork_dir = os.path.abspath(args.work_dir)\ndef out(msg):\n    print(msg, flush=True)\nout(f"[INFO] OMICS 服务启动中 | host={args.host} port={args.port}")\nout(f"[INFO] 工作目录: {work_dir}")\nif not os.path.isdir(os.path.join(work_dir, \'frontend\')) or not os.path.isdir(os.path.join(work_dir, \'backend\')):\n    out(f"[ERROR] 工作目录无效，需包含 frontend/backend: {work_dir}")\n    sys.exit(2)\nos.environ[\'FORECAST_WORK_DIR\'] = work_dir\nif work_dir not in sys.path:\n    sys.path.insert(0, work_dir)\nlogger = logging.getLogger(\'forecast\')\nlogger.setLevel(logging.INFO)\nhandler = logging.StreamHandler(sys.stdout)\nhandler.setFormatter(logging.Formatter(\'%(asctime)s [%(levelname)s] %(message)s\', datefmt=\'%H:%M:%S\'))\nlogger.handlers.clear()\nlogger.addHandler(handler)\nlogger.propagate = False\ntry:\n    from waitress import serve\n    from backend.app import app\nexcept Exception as e:\n    out(f"[ERROR] 导入后端失败: {e}")\n    sys.exit(3)\ntry:\n    out(f"[INFO] Waitress 正在监听 http://{args.host}:{args.port}")\n    serve(app, host=args.host, port=args.port, threads=6)\nexcept OSError as e:\n    out(f"[ERROR] 端口 {args.port} 被占用或无法绑定: {e}")\n    sys.exit(1)\nexcept Exception as e:\n    out(f"[ERROR] 服务运行异常: {e}")\n    sys.exit(4)'


# ══════════════════════════════════════════════════════════════════════════════
#  配置（两个服务的路径/端口）
# ══════════════════════════════════════════════════════════════════════════════
DEFAULT_CONFIG = {
    "mtws": {
        "name": "MTWS 监控系统",
        "work_dir": str(DEFAULT_MTWS_DIR) if DEFAULT_MTWS_DIR.exists() else "",  # 指向 MTWS 程序根目录；兼容旧配置 manage_py
        "host": "127.0.0.1",
        "port": 8001,
        "home_path": "/current/",
        "public_home_url": "http://127.0.0.1:8000/mtws/",
    },
    "omics": {
        "name": "OMICS 评定发布",
        "work_dir": str(DEFAULT_OMICS_DIR) if DEFAULT_OMICS_DIR.exists() else str(SCRIPT_DIR), # 指向 OMICS 项目根目录（包含 backend/frontend）
        "host": "127.0.0.1",
        "port": 8002,
        "home_path": "/",
        "public_home_url": "http://127.0.0.1:8000/omics/",
    },
    "nginx": {
        "name": "Nginx 统一入口",
        "host": "127.0.0.1",
        "port": 8000,
        "home_path": "/",
        "public_home_url": "http://127.0.0.1:8000/mtws/",
        "exe_path": "",
    },
}


def load_config():
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))  # deep copy
    try:
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
            for svc in ("mtws", "omics", "nginx"):
                if svc in saved and isinstance(saved[svc], dict):
                    cfg[svc].update(saved[svc])
    except Exception:
        pass
    # 兼容旧配置：MTWS 旧版保存 manage_py，新版统一保存程序根目录/入口路径
    if cfg["mtws"].get("manage_py") and not cfg["mtws"].get("work_dir"):
        cfg["mtws"]["work_dir"] = cfg["mtws"].get("manage_py")
    cfg["mtws"].pop("manage_py", None)
    # 兼容旧配置：如果已有 run_server 路径，自动折算为项目根目录
    if cfg["omics"].get("run_server") and not cfg["omics"].get("work_dir"):
        cfg["omics"]["work_dir"] = str(Path(cfg["omics"]["run_server"]).parent)
    cfg["omics"].pop("run_server", None)
    return cfg


def save_config(cfg):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def find_nginx_exe(configured_path=""):
    """定位 nginx.exe。优先使用配置，其次使用项目内 portable nginx，再尝试 PATH。"""
    candidates = []
    if configured_path:
        candidates.append(Path(configured_path))
    candidates.extend([
        NGINX_DIR / "nginx.exe",
        DEFAULT_OMICS_DIR / "tools" / "nginx" / "nginx.exe",
        SCRIPT_DIR / "nginx" / "nginx.exe",
        SCRIPT_DIR / "tools" / "nginx.exe",
        SCRIPT_DIR / "tools" / "nginx" / "nginx.exe",
    ])
    for c in candidates:
        if c and c.exists() and c.is_file():
            return c
    try:
        import shutil
        found = shutil.which("nginx.exe") or shutil.which("nginx")
        if found:
            return Path(found)
    except Exception:
        pass
    return None


def nginx_runtime_paths():
    prefix = NGINX_RUNTIME_DIR
    conf = NGINX_CONF_DIR / "nginx.conf"
    return prefix, conf


def ensure_nginx_conf(mtws_cfg, omics_cfg, nginx_cfg):
    """生成只监听 127.0.0.1 的统一入口配置。"""
    prefix, conf = nginx_runtime_paths()
    NGINX_CONF_DIR.mkdir(parents=True, exist_ok=True)
    NGINX_LOG_DIR.mkdir(parents=True, exist_ok=True)
    for d in ("client_body_temp", "proxy_temp", "fastcgi_temp", "uwsgi_temp", "scgi_temp"):
        (NGINX_RUNTIME_DIR / "temp" / d).mkdir(parents=True, exist_ok=True)
    mime_types = NGINX_CONF_DIR / "mime.types"
    if not mime_types.exists():
        mime_types.write_text("""types {
    text/html                             html htm shtml;
    text/css                              css;
    text/xml                              xml;
    image/gif                             gif;
    image/jpeg                            jpeg jpg;
    image/png                             png;
    image/svg+xml                         svg svgz;
    image/x-icon                          ico;
    application/javascript                js;
    application/json                      json;
    application/pdf                       pdf;
    font/woff                             woff;
    font/woff2                            woff2;
    application/vnd.ms-fontobject         eot;
    font/ttf                              ttf;
}
""", encoding="utf-8")
    mtws_host, mtws_port = mtws_cfg.get("host", "127.0.0.1"), int(mtws_cfg.get("port", 8001))
    omics_host, omics_port = omics_cfg.get("host", "127.0.0.1"), int(omics_cfg.get("port", 8002))
    nginx_host, nginx_port = nginx_cfg.get("host", "127.0.0.1"), int(nginx_cfg.get("port", 8000))
    text = f"""worker_processes  1;
error_log  logs/error.log;
pid        logs/nginx.pid;

events {{
    worker_connections  1024;
}}

http {{
    include       mime.types;
    default_type  application/octet-stream;
    access_log    logs/access.log;
    sendfile      on;
    keepalive_timeout  65;

    server {{
        listen {nginx_host}:{nginx_port};
        server_name 127.0.0.1 localhost;

        location = / {{
            return 302 /mtws/;
        }}

        location /mtws/ {{
            proxy_pass http://{mtws_host}:{mtws_port}/;
            proxy_http_version 1.1;
            proxy_set_header Host $host:$server_port;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_redirect ~^(/.*)$ /mtws$1;
            proxy_redirect http://{mtws_host}:{mtws_port}/ /mtws/;
        }}

        location ~ ^/(current|test|system|admin|static|media)(/.*)?$ {{
            proxy_pass http://{mtws_host}:{mtws_port};
            proxy_http_version 1.1;
            proxy_set_header Host $host:$server_port;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }}

        location /omics/ {{
            proxy_pass http://{omics_host}:{omics_port}/;
            proxy_http_version 1.1;
            proxy_set_header Host $host:$server_port;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_redirect ~^(/.*)$ /omics$1;
            proxy_redirect http://{omics_host}:{omics_port}/ /omics/;
        }}

        location /api/ {{
            proxy_pass http://{omics_host}:{omics_port}/api/;
            proxy_http_version 1.1;
            proxy_set_header Host $host:$server_port;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }}
        location /assets/ {{
            proxy_pass http://{omics_host}:{omics_port}/assets/;
        }}
    }}
}}
"""
    conf.write_text(text, encoding="utf-8")
    return prefix, conf


def resolve_mtws_manage_py(path):
    """MTWS 配置既可指向 manage.py，也可指向 server_gui.py 所在的程序根目录。

    兼容交付目录结构：OMICS 项目目录与 MTWS 目录平级摆放时，即使未手动配置
    MTWS 路径，也会自动尝试 ../MTWS/mtws_django/manage.py。
    """
    raw = (path or "").strip()
    paths = []
    if raw:
        paths.append(Path(raw))
    # 默认交付结构：预报质量评定工具5.6(测试版) 与 MTWS 在同一上级目录
    paths.append(DEFAULT_MTWS_DIR)

    seen = set()
    for p in paths:
        try:
            key = str(p.resolve())
        except Exception:
            key = str(p)
        if key in seen:
            continue
        seen.add(key)

        if p.is_file() and p.name.lower() == "manage.py":
            return p
        if p.is_file() and p.name.lower() == "server_gui.py":
            p = p.parent
        if p.is_dir():
            candidates = [
                p / "mtws_django" / "manage.py",  # server_gui.py 的标准布局
                p / "manage.py",
                p.parent / "MTWS" / "mtws_django" / "manage.py",  # 配到 OMICS 目录时自动找平级 MTWS
            ]
            for c in candidates:
                if c.exists():
                    return c
    return None


def mtws_root_from_path(path):
    """由配置路径推导 MTWS 程序根目录，用于数据库管理工具等。"""
    if not path:
        return None
    p = Path(path)
    if p.is_file() and p.name.lower() == "manage.py":
        return p.parent.parent if p.parent.name.lower() == "mtws_django" else p.parent
    if p.is_file() and p.name.lower() == "server_gui.py":
        return p.parent
    if p.is_dir():
        return p
    m = resolve_mtws_manage_py(path)
    return mtws_root_from_path(str(m)) if m else None

def acquire_single_instance():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
    try:
        sock.bind(("127.0.0.1", IPC_PORT))
        sock.listen(5)
        return sock
    except OSError:
        sock.close()
        try:
            c = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            c.settimeout(1)
            c.connect(("127.0.0.1", IPC_PORT))
            c.sendall(b"SHOW")
            c.close()
        except Exception:
            pass
        return None


# ══════════════════════════════════════════════════════════════════════════════
#  单个服务的运行控制器（封装一个 subprocess + 日志队列 + 状态）
# ══════════════════════════════════════════════════════════════════════════════
class ServicePanel:
    """管理一个服务的进程、状态与日志面板 UI。"""

    def __init__(self, app, key, cfg):
        self.app = app
        self.key = key
        self.cfg = cfg
        self.process = None
        self.running = False
        self.attached = False     # 接管外部已存在的服务
        self.log_queue = queue.Queue()
        self._quitting = False

        # UI 句柄（由 build_ui 填充）
        self.status_dot = None
        self.status_label = None
        self.toggle_btn = None
        self.log_text = None
        self.log_time_label = None

    @property
    def host(self):
        return self.cfg.get("host", "127.0.0.1")

    @property
    def port(self):
        return int(self.cfg.get("port", 0))

    @property
    def home_url(self):
        return f"http://{self.host}:{self.port}{self.cfg.get('home_path', '/')}"

    @property
    def public_home_url(self):
        return self.cfg.get("public_home_url") or self.home_url

    def target_path(self):
        return self.cfg.get("work_dir")

    # ── 启动 ──────────────────────────────────────────────────────────────
    def start(self):
        if self.running:
            return

        # 端口已被占用 → 接管模式
        if is_port_in_use(self.port):
            self.log(f"检测到端口 {self.port} 已有服务，直接接管。", "warn")
            self.log(f"服务已就绪 → {self.home_url}", "success")
            self.running = True
            self.attached = True
            self.app.after(0, self._ui_attached)
            return

        path = self.target_path()
        if self.key == "nginx":
            valid_path = bool(find_nginx_exe(self.cfg.get("exe_path", "")))
        elif self.key == "mtws":
            valid_path = bool(resolve_mtws_manage_py(path))
        else:
            valid_path = bool(path and os.path.isdir(os.path.join(path, "backend")) and os.path.isdir(os.path.join(path, "frontend")))
        if not valid_path:
            if self.key == "nginx":
                self.log("未找到 nginx.exe。请将 portable Nginx 放到 tools\\nginx\\nginx.exe，或在「路径配置」中指定。", "error")
            else:
                self.log(f"未配置有效启动路径，无法启动。请点「路径配置」。", "error")
            self.app.after(0, self._ui_unstarted)
            return

        self.log(f"正在启动 {self.cfg['name']} …", "info")
        threading.Thread(target=self._run, args=(path,), daemon=True).start()

    def _build_cmd(self, path):
        """根据服务类型组装启动命令。"""
        if self.key == "mtws":
            # Django: 可从 MTWS 根目录自动定位 mtws_django/manage.py
            manage_py = resolve_mtws_manage_py(path)
            if not manage_py:
                raise FileNotFoundError(f"未找到 MTWS 启动入口 manage.py: {path}")
            return [sys.executable, str(manage_py), "runserver", f"{self.host}:{self.port}"], str(manage_py.parent)
        if self.key == "nginx":
            exe = find_nginx_exe(self.cfg.get("exe_path", ""))
            if not exe:
                raise FileNotFoundError("未找到 nginx.exe")
            prefix, conf = ensure_nginx_conf(self.app.mtws.cfg, self.app.omics.cfg, self.cfg)
            return [str(exe), "-p", str(prefix) + os.sep, "-c", str(conf)], str(exe.parent)
        # OMICS: 内联启动 Flask+Waitress，不再依赖 run_server.py
        wd = str(Path(path))
        return ([sys.executable, "-u", "-c", OMICS_INLINE_CODE, "--host", self.host,
                 "--port", str(self.port), "--work-dir", wd], wd)

    def _run(self, path):
        try:
            cmd, cwd = self._build_cmd(path)
            flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            env = os.environ.copy()
            env["PYTHONUTF8"] = "1"
            env["PYTHONIOENCODING"] = "utf-8"
            self.process = subprocess.Popen(
                cmd, cwd=cwd,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace",
                env=env, creationflags=flags,
            )
            self.running = True
            self.app.after(0, self._ui_started)

            if self.key == "nginx":
                self.log(f"Nginx 配置已生成，统一入口 → {self.public_home_url}", "success")
                # Windows 版 nginx.exe 通常会拉起后台进程后立即返回；
                # 这里按监听端口维持运行状态，避免 UI 误报停止。
                time.sleep(0.8)
                while not self._quitting and is_port_in_use(self.port):
                    time.sleep(1.0)
                self.running = False
                if not self._quitting:
                    self.app.after(0, self._ui_stopped)
                return

            for line in self.process.stdout:
                s = line.rstrip()
                if s:
                    self.log_queue.put(("raw", s))

            self.process.wait()
            self.running = False
            if not self._quitting:
                self.app.after(0, self._ui_stopped)
        except Exception as exc:
            self.log_queue.put(("styled", f"启动失败：{exc}", "error"))
            self.running = False
            self.app.after(0, self._ui_stopped)

    # ── 停止 ──────────────────────────────────────────────────────────────
    def stop(self):
        if self.key == "nginx" and self.running and not self.attached:
            self.log("正在停止 Nginx…", "warn")
            try:
                exe = find_nginx_exe(self.cfg.get("exe_path", ""))
                prefix, conf = nginx_runtime_paths()
                if exe:
                    subprocess.run([str(exe), "-p", str(prefix) + os.sep, "-c", str(conf), "-s", "stop"],
                                   cwd=str(exe.parent), creationflags=subprocess.CREATE_NO_WINDOW,
                                   capture_output=True)
            except Exception as exc:
                self.log(f"停止 Nginx 时出错：{exc}", "warn")
            self.kill_port_listeners()
            self.process = None
            self.running = False
            self._ui_stopped()
            return
        if self.process and self.running and not self.attached:
            self.log("正在停止服务…", "warn")
            pid = self.process.pid
            try:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)],
                                   creationflags=subprocess.CREATE_NO_WINDOW,
                                   capture_output=True)
                else:
                    self.process.terminate()
            except Exception as exc:
                self.log(f"停止时出错：{exc}", "warn")
            finally:
                try:
                    self.process.wait(timeout=3)
                except Exception:
                    pass
            self.process = None
            self.running = False
            self._ui_stopped()
        elif self.attached:
            self.log("外部接管的服务无法在此停止。", "warn")

    def toggle(self):
        if self.running:
            self.stop()
        else:
            self.start()

    def check_external_health(self):
        """外部接管的服务被关闭后，恢复为可重新启动状态。"""
        if self.attached and self.running and not is_port_in_use(self.port):
            self.attached = False
            self.running = False
            self.log(f"检测到端口 {self.port} 的外部服务已退出，可重新启动。", "warn")
            self.app.after(0, self._ui_stopped)

    def kill_port_listeners(self):
        """退出时清理监听本服务端口的残留进程。"""
        if sys.platform != "win32":
            return
        try:
            result = subprocess.run(["netstat", "-ano"], capture_output=True,
                                    text=True, encoding="gbk", errors="replace",
                                    creationflags=subprocess.CREATE_NO_WINDOW)
            pids = set()
            for line in result.stdout.splitlines():
                if f":{self.port}" in line and "LISTENING" in line:
                    parts = line.split()
                    if parts:
                        pids.add(parts[-1])
            for pid in pids:
                subprocess.run(["taskkill", "/F", "/T", "/PID", pid],
                               creationflags=subprocess.CREATE_NO_WINDOW,
                               capture_output=True)
        except Exception:
            pass

    # ── 状态 UI 更新 ──────────────────────────────────────────────────────
    def _ui_started(self):
        if self.status_dot:
            self.status_dot.configure(text_color=COLOR_GREEN)
        if self.status_label:
            self.status_label.configure(text="运行中", text_color=COLOR_GREEN)
        if self.toggle_btn:
            self.toggle_btn.configure(text="停止", fg_color=COLOR_RED, hover_color="#e0362d")
        self.log(f"服务已启动 → {self.public_home_url}", "success")

    def _ui_attached(self):
        if self.status_dot:
            self.status_dot.configure(text_color=COLOR_ORANGE)
        if self.status_label:
            self.status_label.configure(text="已接管", text_color=COLOR_ORANGE)
        if self.toggle_btn:
            self.toggle_btn.configure(text="外部服务", fg_color=BG_TERTIARY,
                                      hover_color=BG_GROUPED, text_color=COLOR_ORANGE)

    def _ui_stopped(self):
        if self.status_dot:
            self.status_dot.configure(text_color=COLOR_RED)
        if self.status_label:
            self.status_label.configure(text="服务未启动", text_color="#636366")
        if self.toggle_btn:
            self.toggle_btn.configure(text="启动", fg_color=COLOR_GREEN, hover_color="#27a846")
        self.log("服务未启动", "warn")

    def _ui_unstarted(self):
        if self.status_dot:
            self.status_dot.configure(text_color=COLOR_RED)
        if self.status_label:
            self.status_label.configure(text="服务未启动", text_color="#636366")
        if self.toggle_btn:
            self.toggle_btn.configure(text="启动", fg_color=COLOR_GREEN, hover_color="#27a846")

    # ── 日志 ──────────────────────────────────────────────────────────────
    def log(self, msg, level="normal"):
        self.log_queue.put(("styled", msg, level))

    def drain_logs(self):
        try:
            while True:
                item = self.log_queue.get_nowait()
                self._write_log(item)
        except queue.Empty:
            pass

    def _write_log(self, item):
        if not self.log_text:
            return
        tb = self.log_text._textbox
        tb.configure(state="normal")
        now = datetime.now().strftime("%H:%M:%S")
        if item[0] == "styled":
            _, msg, level = item
            prefix = {"info": "ℹ", "success": "✓", "warn": "⚠",
                      "error": "✕", "normal": "·", "dim": "·"}.get(level, "·")
            tb.insert("end", f"{now}  ", "dim")
            tb.insert("end", f"{prefix} ", level)
            tb.insert("end", msg + "\n", level)
        else:  # raw stdout
            _, text = item
            low = text.lower()
            if "error" in low or "exception" in low or "[error]" in low or "traceback" in low:
                tag = "error"
            elif "warning" in low or "warn" in low:
                tag = "warn"
            elif "starting" in low or "watching" in low or "监听" in text or "已启动" in text or "running on" in low:
                tag = "success"
            else:
                tag = "normal"
            tb.insert("end", f"{now}  ", "dim")
            tb.insert("end", text + "\n", tag)
        tb.configure(state="disabled")
        tb.see("end")
        if self.log_time_label:
            self.log_time_label.configure(text="更新 " + datetime.now().strftime("%H:%M:%S"))

    def clear_log(self):
        if not self.log_text:
            return
        tb = self.log_text._textbox
        tb.configure(state="normal")
        tb.delete("1.0", "end")
        tb.configure(state="disabled")

    def open_home(self):
        webbrowser.open(self.public_home_url)

    @property
    def protocol_label(self):
        return "HTTP"

    @property
    def address_label(self):
        return self.host

    def open_db_tool(self):
        if self.key != "mtws":
            self.log("当前服务没有独立数据库管理工具入口。", "warn")
            return
        root = mtws_root_from_path(self.target_path())
        db_tool = root / "data" / "sqlite_database" / "database_manage_allinone.py" if root else None
        if not db_tool or not db_tool.exists():
            self.log(f"找不到数据库管理工具：{db_tool or '未配置 MTWS 根目录'}", "error")
            return
        try:
            subprocess.Popen([sys.executable, str(db_tool)], cwd=str(db_tool.parent))
            self.log("数据库管理工具已启动", "info")
        except Exception as exc:
            self.log(f"启动数据库管理工具失败：{exc}", "error")


class AuthBrokerServer:
    """控制台登录态中转：统一持有 token，只监听本机 127.0.0.1。"""

    def __init__(self, app, host="127.0.0.1", port=AUTH_BROKER_PORT):
        self.app = app
        self.host = host
        self.port = port
        self.httpd = None

    def start(self):
        broker = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, fmt, *args):
                return

            def _send_json(self, payload, status=200):
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1")
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                if self.client_address[0] not in ("127.0.0.1", "::1"):
                    self._send_json({"success": False, "error": "forbidden"}, 403); return
                path = urlparse(self.path).path
                if path == "/auth/status":
                    state = broker.app.get_auth_state(include_token=True)
                    self._send_json({"success": True, **state}); return
                self._send_json({"success": False, "error": "not found"}, 404)

        try:
            self.httpd = ThreadingHTTPServer((self.host, self.port), Handler)
            threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
            return True
        except OSError as exc:
            try:
                self.app.omics.log(f"控制台登录态中转接口启动失败：{exc}", "warn")
            except Exception:
                pass
            return False

    def stop(self):
        if self.httpd:
            try:
                self.httpd.shutdown()
                self.httpd.server_close()
            except Exception:
                pass


# ══════════════════════════════════════════════════════════════════════════════
#  主窗口
# ══════════════════════════════════════════════════════════════════════════════
class LauncherApp(ctk.CTk):

    def __init__(self, ipc_sock):
        super().__init__()
        self.cfg = load_config()
        self._ipc_sock = ipc_sock
        self._quitting = False
        self.tray_icon = None
        self.auth_state = {"logged_in": False, "token": None, "userCode": None, "displayName": None, "login_time": None}
        self.auth_broker = None

        self.mtws = ServicePanel(self, "mtws", self.cfg["mtws"])
        self.omics = ServicePanel(self, "omics", self.cfg["omics"])
        self.nginx = ServicePanel(self, "nginx", self.cfg["nginx"])

        self.title("统一服务启动器 · MTWS + OMICS")
        self.geometry("1080x760")
        self.minsize(960, 620)
        self.configure(fg_color=BG_PRIMARY)

        self._build_ui()
        self._configure_log_tags(self.mtws)
        self._configure_log_tags(self.omics)
        self._configure_log_tags(self.nginx)
        self.auth_broker = AuthBrokerServer(self)
        self.auth_broker.start()
        self._setup_tray()

        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self.after(100, self._poll_logs)
        self.after(1500, self._monitor_services)
        self.after(300, self._autostart)

        threading.Thread(target=self._ipc_listener, daemon=True).start()
        if TRAY_AVAILABLE and self.tray_icon:
            threading.Thread(target=self.tray_icon.run, daemon=True).start()

    # ── UI ────────────────────────────────────────────────────────────────
    def _build_ui(self):
        self._build_titlebar()
        body = ctk.CTkFrame(self, fg_color=BG_PRIMARY, corner_radius=0)
        body.pack(fill="both", expand=True, padx=14, pady=14)
        body.grid_columnconfigure(0, weight=1, uniform="service_columns")
        body.grid_columnconfigure(1, weight=1, uniform="service_columns")
        body.grid_rowconfigure(0, weight=1)
        # 只显示业务服务：MTWS / OMICS。Nginx 作为后台统一入口静默启动与退出。
        self._build_service_column(body, self.mtws, col_index=0)
        self._build_service_column(body, self.omics, col_index=1)

    def _build_titlebar(self):
        bar = ctk.CTkFrame(self, fg_color=BG_SECONDARY, corner_radius=0, height=52)
        bar.pack(fill="x"); bar.pack_propagate(False)
        left = ctk.CTkFrame(bar, fg_color="transparent"); left.pack(side="left", padx=18, pady=8)
        ctk.CTkLabel(left, text="🛫", font=ctk.CTkFont(size=20)).pack(side="left")
        ctk.CTkLabel(left, text="航空气象统一服务启动器", font=ctk.CTkFont(size=15, weight="bold"),
                     text_color=COLOR_LABEL).pack(side="left", padx=(8, 0))
        ctk.CTkLabel(left, text="统一入口 8000 · MTWS 8001 · OMICS 8002", font=ctk.CTkFont(size=11),
                     text_color="#636366").pack(side="left", padx=(8, 0), pady=(2, 0))
        right = ctk.CTkFrame(bar, fg_color="transparent"); right.pack(side="right", padx=18)
        self.login_btn = ctk.CTkButton(right, text="扫码登录", width=116, command=self._open_token_login,
                      font=ctk.CTkFont(size=12), fg_color=COLOR_BLUE, hover_color="#007aff",
                      text_color="#fff", corner_radius=8, height=32)
        self.login_btn.pack(side="right", padx=(8, 0))
        self.logout_btn = ctk.CTkButton(right, text="退出登录", width=80, command=self.logout_auth,
                      font=ctk.CTkFont(size=12), fg_color=BG_TERTIARY, hover_color=BG_GROUPED,
                      text_color=COLOR_LABEL2, corner_radius=8, height=32)
        self.logout_btn.pack(side="right", padx=(8, 0))
        self.logout_btn.configure(state="disabled")
        ctk.CTkButton(right, text="退出服务", width=80, command=self._quit_app,
                      font=ctk.CTkFont(size=12), fg_color="#3a1f1f", hover_color="#5a2a2a",
                      text_color="#ff6b6b", corner_radius=8, height=32).pack(side="right", padx=(8, 0))
        ctk.CTkButton(right, text="⚙ 路径配置", width=92, command=self._open_path_config,
                      font=ctk.CTkFont(size=12), fg_color=BG_TERTIARY, hover_color=BG_GROUPED,
                      text_color=COLOR_LABEL2, corner_radius=8, height=32).pack(side="right", padx=(8, 0))
        ctk.CTkButton(right, text="全部启动", width=80, command=self._start_all,
                      font=ctk.CTkFont(size=12), fg_color=COLOR_GREEN, hover_color="#27a846",
                      text_color="#fff", corner_radius=8, height=32).pack(side="right", padx=(8, 0))
        ctk.CTkFrame(self, fg_color=COLOR_SEPARATOR, height=1, corner_radius=0).pack(fill="x")

    def _build_service_column(self, parent, svc, col_index):
        col = ctk.CTkFrame(parent, fg_color=BG_SECONDARY, corner_radius=12)
        col.grid(row=0, column=col_index, sticky="nsew",
                 padx=(0, 7) if col_index == 0 else (7, 0))

        # 头部：服务名 + 状态灯
        header = ctk.CTkFrame(col, fg_color="transparent"); header.pack(fill="x", padx=14, pady=(12, 6))
        name_box = ctk.CTkFrame(header, fg_color="transparent"); name_box.pack(side="left")
        ctk.CTkLabel(name_box, text=svc.cfg["name"], font=ctk.CTkFont(size=14, weight="bold"),
                     text_color=COLOR_LABEL).pack(side="left")
        ctk.CTkLabel(name_box, text=f"  :{svc.port}", font=ctk.CTkFont(size=11),
                     text_color="#636366").pack(side="left")
        stat = ctk.CTkFrame(header, fg_color="transparent"); stat.pack(side="right")
        svc.status_dot = ctk.CTkLabel(stat, text="●", font=ctk.CTkFont(size=13), text_color=COLOR_RED)
        svc.status_dot.pack(side="right", padx=(4, 0))
        svc.status_label = ctk.CTkLabel(stat, text="服务未启动", font=ctk.CTkFont(size=12),
                                        text_color="#636366")
        svc.status_label.pack(side="right")

        # 服务器信息卡片（补齐 server_gui 的地址/端口/协议）
        info = ctk.CTkFrame(col, fg_color=BG_TERTIARY, corner_radius=10)
        info.pack(fill="x", padx=14, pady=(0, 8))
        self._info_row(info, "地址", svc.address_label)
        self._info_divider(info)
        self._info_row(info, "端口", str(svc.port))
        self._info_divider(info)
        self._info_row(info, "协议", svc.protocol_label)

        # 操作按钮行
        btns = ctk.CTkFrame(col, fg_color="transparent"); btns.pack(fill="x", padx=14, pady=(0, 8))
        svc.toggle_btn = ctk.CTkButton(btns, text="启动", width=70, command=svc.toggle,
                                       font=ctk.CTkFont(size=12), fg_color=COLOR_GREEN,
                                       hover_color="#27a846", text_color="#fff", corner_radius=8, height=32)
        svc.toggle_btn.pack(side="left")
        ctk.CTkButton(btns, text="打开主页", width=80, command=svc.open_home,
                      font=ctk.CTkFont(size=12), fg_color=COLOR_BLUE, hover_color="#007aff",
                      text_color="#fff", corner_radius=8, height=32).pack(side="left", padx=(8, 0))
        if svc.key == "mtws":
            ctk.CTkButton(btns, text="数据库管理工具", width=118, command=svc.open_db_tool,
                          font=ctk.CTkFont(size=12), fg_color=BG_TERTIARY, hover_color=BG_GROUPED,
                          text_color=COLOR_LABEL2, corner_radius=8, height=32).pack(side="left", padx=(8, 0))
        ctk.CTkButton(btns, text="清空", width=56, command=svc.clear_log,
                      font=ctk.CTkFont(size=12), fg_color=BG_TERTIARY, hover_color=BG_GROUPED,
                      text_color="#636366", corner_radius=8, height=32).pack(side="right")

        ctk.CTkFrame(col, fg_color=COLOR_SEPARATOR, height=1).pack(fill="x", padx=12)

        # 日志面板
        log_head = ctk.CTkFrame(col, fg_color="transparent"); log_head.pack(fill="x", padx=14, pady=(8, 4))
        ctk.CTkLabel(log_head, text="运行日志", font=ctk.CTkFont(size=12, weight="bold"),
                     text_color=COLOR_LABEL).pack(side="left")
        svc.log_time_label = ctk.CTkLabel(log_head, text="", font=ctk.CTkFont(size=10),
                                          text_color="#48484a")
        svc.log_time_label.pack(side="right")
        svc.log_text = ctk.CTkTextbox(col, font=ctk.CTkFont(family="Consolas", size=12),
                                      fg_color="#141416", text_color="#d1d1d6", corner_radius=8,
                                      wrap="word", state="disabled",
                                      scrollbar_button_color=BG_TERTIARY,
                                      scrollbar_button_hover_color=BG_GROUPED)
        svc.log_text.pack(fill="both", expand=True, padx=12, pady=(0, 12))


    def _info_row(self, parent, label, value):
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.pack(fill="x", padx=12, pady=5)
        ctk.CTkLabel(row, text=label, font=ctk.CTkFont(size=11),
                     text_color="#8e8e93", width=42).pack(side="left")
        ctk.CTkLabel(row, text=str(value), font=ctk.CTkFont(size=12, weight="bold"),
                     text_color=COLOR_BLUE).pack(side="right")

    def _info_divider(self, parent):
        ctk.CTkFrame(parent, fg_color=BG_GROUPED, height=1, corner_radius=0).pack(fill="x", padx=8)

    def _configure_log_tags(self, svc):
        if not svc.log_text:
            return
        tb = svc.log_text._textbox
        tb.tag_configure("info", foreground=COLOR_BLUE)
        tb.tag_configure("success", foreground=COLOR_GREEN)
        tb.tag_configure("warn", foreground=COLOR_ORANGE)
        tb.tag_configure("error", foreground=COLOR_RED)
        tb.tag_configure("normal", foreground="#d1d1d6")
        tb.tag_configure("dim", foreground="#636366")

    # ── 日志轮询 ──────────────────────────────────────────────────────────
    def _poll_logs(self):
        self.mtws.drain_logs()
        self.omics.drain_logs()
        self.nginx.drain_logs()
        self.after(80, self._poll_logs)

    def _monitor_services(self):
        if not self._quitting:
            self.mtws.check_external_health()
            self.omics.check_external_health()
            self.nginx.check_external_health()
            self.after(1500, self._monitor_services)

    # ── 启动控制 ──────────────────────────────────────────────────────────
    def _autostart(self):
        # 初始各服务显示未启动状态提示
        for svc in (self.mtws, self.omics, self.nginx):
            path = svc.target_path()
            if svc.key == "mtws":
                ok = bool(resolve_mtws_manage_py(path))
            elif svc.key == "omics":
                ok = bool(path and os.path.isdir(path))
            else:
                ok = bool(find_nginx_exe(svc.cfg.get("exe_path", "")))
            if not ok:
                if svc.key == "nginx":
                    svc.log("未找到 nginx.exe。后端会启动，但 8000 统一入口需安装/放置 Nginx 后才能工作。", "warn")
                else:
                    svc.log(f"未配置启动路径，请点右上「路径配置」。", "warn")
        self._start_all()

    def _start_all(self):
        self.mtws.start()
        self.omics.start()
        # Nginx 需要后端端口已开始启动后再接入
        self.after(1200, self.nginx.start)

    # ── 路径配置 ──────────────────────────────────────────────────────────
    def _open_path_config(self):
        PathConfigDialog(self)

    def _open_token_login(self):
        """通用扫码登录入口：当前调用右侧服务接口获取 token，但 token 统一保存到控制台。"""
        if requests is None:
            self.omics.log("缺少 requests 库，无法打开扫码登录。", "error")
            return
        if not self.omics.running:
            self.omics.log("Token 服务端口未启动，请先启动右侧服务。", "warn")
            return
        TokenLoginDialog(self, self.omics.home_url.rstrip('/'))

    def resolve_display_name(self, user_code):
        if not user_code or user_code == "--" or requests is None or not self.omics.running:
            return user_code or "账号"
        try:
            res = requests.get(f"{self.omics.home_url.rstrip('/')}/api/personnel_mapping", timeout=2)
            data = res.json()
            if data.get("success") and isinstance(data.get("data"), dict):
                return data["data"].get(str(user_code), str(user_code))
        except Exception:
            pass
        return str(user_code)

    def set_auth_state(self, token, user_code=None, display_name=None):
        name = display_name or self.resolve_display_name(user_code)
        self.auth_state = {
            "logged_in": bool(token),
            "token": token,
            "userCode": user_code or "--",
            "displayName": name,
            "login_time": datetime.now().isoformat(timespec="seconds")
        }
        if hasattr(self, "login_btn") and self.login_btn:
            self.login_btn.configure(text=f"{name} 登录成功", fg_color=COLOR_GREEN, hover_color="#27a846")
        if hasattr(self, "logout_btn") and self.logout_btn:
            self.logout_btn.configure(state="normal")
        self.omics.log(f"控制台登录成功：{name}。登录态已由控制台统一中转。", "success")

    def logout_auth(self):
        self.auth_state = {"logged_in": False, "token": None, "userCode": None, "displayName": None, "login_time": None}
        if hasattr(self, "login_btn") and self.login_btn:
            self.login_btn.configure(text="扫码登录", fg_color=COLOR_BLUE, hover_color="#007aff")
        if hasattr(self, "logout_btn") and self.logout_btn:
            self.logout_btn.configure(state="disabled")
        try:
            if requests is not None and self.omics.running:
                requests.post(f"{self.omics.home_url.rstrip('/')}/api/auth/logout", timeout=2)
        except Exception:
            pass
        self.omics.log("控制台已退出登录，登录态中转已清空。", "info")

    def get_auth_state(self, include_token=False):
        state = dict(self.auth_state)
        if not include_token:
            state.pop("token", None)
        return state

    def apply_config(self, new_cfg, autostart=False):
        self.cfg = new_cfg
        self.mtws.cfg = new_cfg["mtws"]
        self.omics.cfg = new_cfg["omics"]
        self.nginx.cfg = new_cfg["nginx"]
        save_config(new_cfg)
        if autostart:
            self.after(100, self._start_all)

    # ── 托盘 ──────────────────────────────────────────────────────────────
    def _setup_tray(self):
        if not TRAY_AVAILABLE:
            return
        icon_img = self._make_tray_icon()
        menu = pystray.Menu(
            pystray.MenuItem("显示窗口", lambda i, it: self._show_window(), default=True),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("全部启动", lambda i, it: self._start_all()),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("退出", lambda i, it: self._quit_app()),
        )
        self.tray_icon = pystray.Icon("Launcher", icon_img, "航空气象统一启动器", menu)

    def _make_tray_icon(self):
        if ICON_PATH.exists():
            try:
                return Image.open(ICON_PATH).convert("RGBA").resize((64, 64), Image.LANCZOS)
            except Exception:
                pass
        size = 64
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.ellipse([1, 1, size - 1, size - 1], fill=(28, 28, 30, 255))
        d.ellipse([6, 6, size - 6, size - 6], fill=(10, 132, 255, 255))
        d.rectangle([26, 16, 38, 48], fill=(255, 255, 255, 255))
        d.polygon([(14, 28), (50, 28), (32, 14)], fill=(255, 255, 255, 255))
        return img

    # ── 窗口/退出 ─────────────────────────────────────────────────────────
    def _on_close(self):
        if TRAY_AVAILABLE and self.tray_icon:
            self.withdraw()
        else:
            self._quit_app()

    def _show_window(self):
        self.after(0, self._do_show_window)

    def _do_show_window(self):
        self.deiconify(); self.state("normal"); self.lift(); self.focus_force()

    def _quit_app(self):
        self._quitting = True
        self.mtws._quitting = True
        self.omics._quitting = True
        self.nginx._quitting = True
        for svc in (self.nginx, self.mtws, self.omics):
            try:
                if not svc.attached:
                    svc.stop()
                svc.kill_port_listeners()
            except Exception:
                pass
        if self.tray_icon:
            try:
                self.tray_icon.stop()
            except Exception:
                pass
        if self.auth_broker:
            self.auth_broker.stop()
        try:
            self._ipc_sock.close()
        except Exception:
            pass
        try:
            self.quit(); self.destroy()
        except Exception:
            pass
        os._exit(0)

    def _ipc_listener(self):
        while not self._quitting:
            try:
                self._ipc_sock.settimeout(1.0)
                conn, _ = self._ipc_sock.accept()
                try:
                    if conn.recv(16) == b"SHOW":
                        self._show_window()
                finally:
                    conn.close()
            except socket.timeout:
                continue
            except Exception:
                break


# ══════════════════════════════════════════════════════════════════════════════
#  通用扫码登录弹窗
# ══════════════════════════════════════════════════════════════════════════════
class TokenLoginDialog(ctk.CTkToplevel):
    """通用扫码登录窗口：只完成登录态写入，不展示/复制一次性 token。"""
    def __init__(self, parent, base_url):
        super().__init__(parent)
        self.parent = parent
        self.base_url = base_url
        self.polling = False
        self.ticket = None
        self.scan_id = None
        self.title("扫码登录")
        self.geometry("420x450")
        self.resizable(False, False)
        self.configure(fg_color=BG_SECONDARY)
        self.grab_set(); self.lift(); self.focus_force()
        ctk.CTkLabel(self, text="扫码登录", font=ctk.CTkFont(size=15, weight="bold"),
                     text_color=COLOR_LABEL).pack(anchor="w", padx=24, pady=(20, 4))
        ctk.CTkLabel(self, text="登录成功后，控制台服务会保存登录态；其它程序直接读取数据库数据，不重复占用账号。",
                     font=ctk.CTkFont(size=11), text_color="#8e8e93", wraplength=360,
                     justify="left").pack(anchor="w", padx=24)
        self.status = ctk.CTkLabel(self, text="正在获取二维码…", font=ctk.CTkFont(size=12), text_color="#8e8e93")
        self.status.pack(pady=(14, 6))
        self.qr_label = ctk.CTkLabel(self, text="", width=240, height=240, fg_color="#141416", corner_radius=10)
        self.qr_label.pack(pady=(0, 12))
        row = ctk.CTkFrame(self, fg_color="transparent"); row.pack(fill="x", padx=24, pady=(4, 18))
        ctk.CTkButton(row, text="刷新二维码", command=self.load_qr, fg_color=BG_TERTIARY,
                      hover_color=BG_GROUPED, text_color=COLOR_LABEL2, corner_radius=8, height=34).pack(side="left", expand=True, fill="x", padx=(0, 6))
        ctk.CTkButton(row, text="关闭", command=self.close, fg_color=COLOR_RED,
                      hover_color="#e0362d", text_color="#fff", corner_radius=8, height=34).pack(side="right", expand=True, fill="x", padx=(6, 0))
        self.protocol("WM_DELETE_WINDOW", self.close)
        self.after(100, self.load_qr)

    def api_url(self, path):
        return f"{self.base_url}{path}"

    def load_qr(self):
        self.polling = False
        self.status.configure(text="正在获取二维码…", text_color="#8e8e93")
        threading.Thread(target=self._load_qr_worker, daemon=True).start()

    def _load_qr_worker(self):
        try:
            data = requests.get(self.api_url('/api/auth/qrcode'), timeout=10).json()
            if not data.get('success'):
                msg = data.get('error') or data.get('message') or '二维码获取失败'
                self.after(0, lambda: self.status.configure(text=msg, text_color=COLOR_RED)); return
            img64 = data.get('qr_img_base64') or data.get('img') or data.get('qrcode') or ''
            if ',' in img64: img64 = img64.split(',', 1)[1]
            raw = base64.b64decode(img64)
            img = Image.open(io.BytesIO(raw)).convert('RGBA').resize((240, 240))
            qr = ctk.CTkImage(light_image=img, dark_image=img, size=(240, 240))
            def done():
                self.qr_image = qr; self.qr_label.configure(image=qr, text="")
                self.status.configure(text="请扫码登录，等待确认…", text_color=COLOR_BLUE)
                self.polling = True; self.after(1200, self.poll_status)
            self.after(0, done)
        except Exception as e:
            self.after(0, lambda: self.status.configure(text=f"二维码获取异常：{e}", text_color=COLOR_RED))

    def poll_status(self):
        if self.polling:
            threading.Thread(target=self._poll_worker, daemon=True).start()

    def _poll_worker(self):
        try:
            data = requests.get(self.api_url('/api/auth/check'), timeout=8).json()
            status = data.get('status')
            if status == 'SCANNED':
                self.ticket = data.get('ticket'); self.scan_id = data.get('scan_id')
                user = data.get('userCode') or '--'
                self.user_code = user
                self.after(0, lambda: self.status.configure(text=f"已扫码：{user}，正在完成登录…", text_color=COLOR_GREEN))
                self._validate_login(); return
            elif status == 'WAITING':
                self.after(0, lambda: self.status.configure(text="等待扫码…", text_color="#8e8e93"))
            else:
                msg = data.get('message') or f"扫码状态：{status}"
                self.after(0, lambda: self.status.configure(text=msg, text_color=COLOR_ORANGE))
        except Exception as e:
            self.after(0, lambda: self.status.configure(text=f"轮询异常：{e}", text_color=COLOR_ORANGE))
        if self.polling: self.after(1500, self.poll_status)

    def _validate_login(self):
        try:
            data = requests.post(self.api_url('/api/auth/validate'), json={'ticket': self.ticket, 'scan_id': self.scan_id}, timeout=10).json()
            if data.get('success'):
                self.polling = False
                token = data.get('token')
                user = data.get('userCode') or data.get('user_code') or getattr(self, 'user_code', None) or '--'
                # OMICS validate 接口旧版只返回 token；工号优先用扫码阶段拿到的 user。
                if user == '--':
                    try:
                        status = requests.get(self.api_url('/api/auth/status'), timeout=5).json()
                        user = status.get('userCode') or user
                    except Exception:
                        pass
                self.parent.set_auth_state(token, user)
                display = self.parent.get_auth_state().get('displayName') or user
                self.after(0, lambda: self.status.configure(text=f"{display} 登录成功，已写入控制台登录态。", text_color=COLOR_GREEN))
            else:
                msg = data.get('message') or '登录确认失败'
                self.after(0, lambda: self.status.configure(text=msg, text_color=COLOR_RED))
        except Exception as e:
            self.after(0, lambda: self.status.configure(text=f"登录确认异常：{e}", text_color=COLOR_RED))

    def close(self):
        self.polling = False; self.destroy()


# ══════════════════════════════════════════════════════════════════════════════
#  路径配置弹窗
# ══════════════════════════════════════════════════════════════════════════════
class PathConfigDialog(ctk.CTkToplevel):
    def __init__(self, app):
        super().__init__(app)
        self.app = app
        self.cfg = json.loads(json.dumps(app.cfg))  # 编辑副本

        self.title("路径配置")
        self.geometry("720x520")
        self.resizable(False, False)
        self.configure(fg_color=BG_SECONDARY)
        self.grab_set(); self.lift(); self.focus_force()

        ctk.CTkLabel(self, text="服务路径配置", font=ctk.CTkFont(size=15, weight="bold"),
                     text_color=COLOR_LABEL).pack(anchor="w", padx=24, pady=(20, 2))
        ctk.CTkLabel(self, text="两个程序可放在不同文件夹；MTWS/OMICS 均选择程序根目录。",
                     font=ctk.CTkFont(size=11), text_color="#8e8e93").pack(anchor="w", padx=24)

        # MTWS
        self.mtws_entry = self._dir_row(
            "MTWS 程序根目录（server_gui.py 所在目录）",
            self.cfg["mtws"].get("work_dir", ""),
            "选择 MTWS 程序根目录")
        self.mtws_port = self._port_row("MTWS 内部端口", self.cfg["mtws"].get("port", 8001))

        ctk.CTkFrame(self, fg_color=COLOR_SEPARATOR, height=1).pack(fill="x", padx=24, pady=10)

        # OMICS
        self.omics_entry = self._dir_row(
            "OMICS 项目根目录（包含 backend/frontend）",
            self.cfg["omics"].get("work_dir", str(SCRIPT_DIR)),
            "选择 OMICS 项目根目录")
        self.omics_port = self._port_row("OMICS 内部端口", self.cfg["omics"].get("port", 8002))

        ctk.CTkFrame(self, fg_color=COLOR_SEPARATOR, height=1).pack(fill="x", padx=24, pady=10)

        self.nginx_entry = self._path_row(
            "Nginx.exe 路径（可空；默认查找 tools/nginx/nginx.exe 或 PATH）",
            self.cfg.get("nginx", {}).get("exe_path", ""),
            "选择 nginx.exe",
            [("nginx.exe", "nginx.exe"), ("可执行文件", "*.exe"), ("所有文件", "*.*")])
        self.nginx_port = self._port_row("Nginx 对外端口", self.cfg.get("nginx", {}).get("port", 8000))

        self.hint = ctk.CTkLabel(self, text="", font=ctk.CTkFont(size=11), text_color=COLOR_ORANGE)
        self.hint.pack(anchor="w", padx=24, pady=(8, 0))

        btn_row = ctk.CTkFrame(self, fg_color="transparent"); btn_row.pack(fill="x", padx=24, pady=(14, 18))
        ctk.CTkButton(btn_row, text="取消", command=self.destroy, fg_color=BG_TERTIARY,
                      hover_color=BG_GROUPED, text_color=COLOR_LABEL2, corner_radius=8,
                      height=34, width=120).pack(side="left", expand=True, padx=(0, 6))
        ctk.CTkButton(btn_row, text="保存", command=self._save, fg_color=COLOR_GREEN,
                      hover_color="#27a846", text_color="#fff", corner_radius=8,
                      height=34, width=120).pack(side="right", expand=True, padx=(6, 0))

    def _path_row(self, label, value, dlg_title, filetypes):
        ctk.CTkLabel(self, text=label, font=ctk.CTkFont(size=12, weight="bold"),
                     text_color=COLOR_LABEL2).pack(anchor="w", padx=24, pady=(12, 2))
        row = ctk.CTkFrame(self, fg_color="transparent"); row.pack(fill="x", padx=24)
        entry = ctk.CTkEntry(row, font=ctk.CTkFont(size=11), fg_color=BG_TERTIARY,
                             border_color=BG_GROUPED, text_color=COLOR_LABEL)
        entry.pack(side="left", fill="x", expand=True)
        entry.insert(0, value or "")

        def browse():
            from tkinter import filedialog
            f = filedialog.askopenfilename(title=dlg_title, filetypes=filetypes)
            if f:
                entry.delete(0, "end"); entry.insert(0, f)
        ctk.CTkButton(row, text="浏览", width=60, command=browse, fg_color=COLOR_BLUE,
                      hover_color="#007aff", text_color="#fff", corner_radius=8).pack(side="right", padx=(8, 0))
        return entry

    def _dir_row(self, label, value, dlg_title):
        ctk.CTkLabel(self, text=label, font=ctk.CTkFont(size=12, weight="bold"),
                     text_color=COLOR_LABEL2).pack(anchor="w", padx=24, pady=(12, 2))
        row = ctk.CTkFrame(self, fg_color="transparent"); row.pack(fill="x", padx=24)
        entry = ctk.CTkEntry(row, font=ctk.CTkFont(size=11), fg_color=BG_TERTIARY,
                             border_color=BG_GROUPED, text_color=COLOR_LABEL)
        entry.pack(side="left", fill="x", expand=True)
        entry.insert(0, value or "")
        def browse():
            from tkinter import filedialog
            d = filedialog.askdirectory(title=dlg_title)
            if d:
                entry.delete(0, "end"); entry.insert(0, d)
        ctk.CTkButton(row, text="浏览", width=60, command=browse, fg_color=COLOR_BLUE,
                      hover_color="#007aff", text_color="#fff", corner_radius=8).pack(side="right", padx=(8, 0))
        return entry

    def _port_row(self, label, value):
        row = ctk.CTkFrame(self, fg_color="transparent"); row.pack(fill="x", padx=24, pady=(6, 0))
        ctk.CTkLabel(row, text=label, font=ctk.CTkFont(size=11), text_color="#8e8e93").pack(side="left")
        entry = ctk.CTkEntry(row, width=100, font=ctk.CTkFont(size=11), fg_color=BG_TERTIARY,
                             border_color=BG_GROUPED, text_color=COLOR_LABEL)
        entry.pack(side="left", padx=(8, 0))
        entry.insert(0, str(value))
        return entry

    def _save(self):
        mtws_path = self.mtws_entry.get().strip()
        omics_path = self.omics_entry.get().strip()
        if mtws_path and not resolve_mtws_manage_py(mtws_path):
            self.hint.configure(text="⚠ MTWS 根目录无效，需能定位到 mtws_django/manage.py。"); return
        if omics_path and (not os.path.isdir(os.path.join(omics_path, "backend")) or not os.path.isdir(os.path.join(omics_path, "frontend"))):
            self.hint.configure(text="⚠ OMICS 项目根目录无效，需包含 backend/frontend。"); return
        try:
            self.cfg["mtws"]["port"] = int(self.mtws_port.get().strip() or 8001)
            self.cfg["omics"]["port"] = int(self.omics_port.get().strip() or 8002)
            self.cfg.setdefault("nginx", {})["port"] = int(self.nginx_port.get().strip() or 8000)
        except ValueError:
            self.hint.configure(text="⚠ 端口必须是数字。"); return
        self.cfg["mtws"]["work_dir"] = mtws_path
        self.cfg["mtws"]["public_home_url"] = f"http://127.0.0.1:{self.cfg['nginx']['port']}/mtws/"
        self.cfg["mtws"].pop("manage_py", None)
        self.cfg["omics"]["work_dir"] = omics_path or str(SCRIPT_DIR)
        self.cfg["omics"]["public_home_url"] = f"http://127.0.0.1:{self.cfg['nginx']['port']}/omics/"
        self.cfg["omics"].pop("run_server", None)
        self.cfg["nginx"].setdefault("name", "Nginx 统一入口")
        self.cfg["nginx"].setdefault("host", "127.0.0.1")
        self.cfg["nginx"]["public_home_url"] = f"http://127.0.0.1:{self.cfg['nginx']['port']}/mtws/"
        self.cfg["nginx"]["exe_path"] = self.nginx_entry.get().strip()
        self.app.apply_config(self.cfg, autostart=True)
        self.hint.configure(text="✓ 已保存，正在启动未运行的服务。", text_color=COLOR_GREEN)
        self.after(900, self.destroy)


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    ipc_sock = acquire_single_instance()
    if ipc_sock is None:
        sys.exit(0)
    app = LauncherApp(ipc_sock)
    app.mainloop()
