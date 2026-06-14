# main.py (深色控制台版 · CustomTkinter)
# 在原有 Flask+Waitress+托盘 架构上，替换启动界面为 macOS 深色风格控制台，并新增路径配置。

import sys
import os
import codecs

# ==========================================
# 🌟 1. 环境注入与防中文乱码崩溃 (必须在最前面)
# ==========================================
try:
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'replace')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'replace')
except Exception:
    pass

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)


# ==========================================
# 🌟 1.3 路径配置 (config.json，支持程序放在任意位置)
# ==========================================
import json

def get_runtime_dir():
    """exe/脚本真实所在目录（非 PyInstaller 临时解压目录）。"""
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return current_dir

CONFIG_PATH = os.path.join(get_runtime_dir(), 'config.json')

def load_config():
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception:
        pass
    return {}

def save_config(cfg):
    try:
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False

def resolve_work_dir():
    """决定工作目录（含 frontend/backend 的项目根）。
    优先级：config.json 的 work_dir > 运行目录。无效则返回 None 触发配置弹窗。"""
    cfg = load_config()
    wd = cfg.get('work_dir', '').strip() if cfg else ''
    if wd and os.path.isdir(os.path.join(wd, 'frontend')):
        return wd
    # 兜底：运行目录自身就是项目根
    if os.path.isdir(os.path.join(get_runtime_dir(), 'frontend')):
        return get_runtime_dir()
    return None


# ==========================================
# 🌟 1.5 运行日志系统 (前后端统一落盘)
# ==========================================
import logging
from logging.handlers import RotatingFileHandler

def setup_logging():
    log_dir = os.path.join(get_runtime_dir(), 'logs')
    try:
        os.makedirs(log_dir, exist_ok=True)
    except Exception:
        log_dir = get_runtime_dir()
    log_path = os.path.join(log_dir, 'runtime.log')

    logger = logging.getLogger('forecast')
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    fmt = logging.Formatter('%(asctime)s [%(levelname)s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    fh = RotatingFileHandler(log_path, maxBytes=2 * 1024 * 1024, backupCount=5, encoding='utf-8')
    fh.setFormatter(fmt)
    logger.addHandler(fh)
    try:
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(fmt)
        logger.addHandler(sh)
    except Exception:
        pass
    logger.propagate = False
    return logger, log_path

LOG, LOG_PATH = setup_logging()


# ==========================================
# 🌟 2. 配置与常量
# ==========================================
import threading
import webbrowser
import time
import socket
import subprocess

PORT = 56789
HOST = '127.0.0.1'
URL = f"http://{HOST}:{PORT}"
EXE_NAME = "ForecastTool.exe"

# macOS 深色系统配色
BG_PRIMARY      = "#1c1c1e"
BG_SECONDARY    = "#2c2c2e"
BG_TERTIARY     = "#3a3a3c"
BG_GROUPED      = "#48484a"
COLOR_BLUE      = "#0a84ff"
COLOR_GREEN     = "#30d158"
COLOR_RED       = "#ff453a"
COLOR_ORANGE    = "#ff9f0a"
COLOR_LABEL     = "#ffffff"
COLOR_LABEL2    = "#ebebf5"
COLOR_SEPARATOR = "#38383a"


# --- 强力清理旧进程 (防杀软挂起版) ---
def kill_zombie_processes():
    if getattr(sys, 'frozen', False):
        current_pid = os.getpid()
        try:
            subprocess.run(
                f'taskkill /F /IM {EXE_NAME} /FI "PID ne {current_pid}"',
                shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3
            )
            time.sleep(0.5)
        except subprocess.TimeoutExpired:
            LOG.warning("进程清理超时，可能被安全软件拦截，跳过...")
        except Exception as e:
            LOG.warning("Cleanup failed: %s", e)


def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((HOST, port)) == 0


# --- Flask 服务线程 (同进程内 serve) ---
def run_flask():
    try:
        from waitress import serve
        from backend.app import app
        LOG.info("Flask/Waitress 启动中 | host=%s port=%s threads=6", HOST, PORT)
        serve(app, host=HOST, port=PORT, threads=6)
    except OSError as e:
        LOG.error("端口 %s 被占用，启动失败: %s", PORT, e)
        os._exit(1)
    except Exception as e:
        LOG.exception("服务启动失败: %s", e)


# ==========================================
# 🌟 3. CustomTkinter 深色控制台
# ==========================================
def launch_console(work_dir):
    import customtkinter as ctk

    # 让后端能找到正确的项目根（从别处启动时）
    os.environ['FORECAST_WORK_DIR'] = work_dir

    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("dark-blue")

    class ConsoleApp(ctk.CTk):
        def __init__(self):
            super().__init__()
            self.title("预报评定工具 · 控制台")
            self.geometry("900x620")
            self.minsize(720, 520)
            self.configure(fg_color=BG_PRIMARY)

            self.server_running = False
            self._quitting = False
            self._log_pos = 0  # runtime.log 已读取的字节位置

            self._build_ui()
            self.protocol("WM_DELETE_WINDOW", self._on_close)

            # 启动服务线程
            threading.Thread(target=run_flask, daemon=True).start()
            self.after(300, self._wait_server_ready)
            self.after(500, self._tail_log_loop)

        # ---------- UI ----------
        def _build_ui(self):
            # 标题栏
            bar = ctk.CTkFrame(self, fg_color=BG_SECONDARY, corner_radius=0, height=52)
            bar.pack(fill="x"); bar.pack_propagate(False)
            left = ctk.CTkFrame(bar, fg_color="transparent"); left.pack(side="left", padx=18, pady=8)
            ctk.CTkLabel(left, text="🌦", font=ctk.CTkFont(size=20)).pack(side="left")
            ctk.CTkLabel(left, text="航空气象预报质量评定工具", font=ctk.CTkFont(size=15, weight="bold"),
                         text_color=COLOR_LABEL).pack(side="left", padx=(8, 0))
            ctk.CTkLabel(left, text="服务端控制台", font=ctk.CTkFont(size=11),
                         text_color="#636366").pack(side="left", padx=(8, 0), pady=(2, 0))
            right = ctk.CTkFrame(bar, fg_color="transparent"); right.pack(side="right", padx=18)
            self.status_dot = ctk.CTkLabel(right, text="●", font=ctk.CTkFont(size=13), text_color=COLOR_RED)
            self.status_dot.pack(side="right", padx=(4, 0))
            self.status_label = ctk.CTkLabel(right, text="启动中", font=ctk.CTkFont(size=12), text_color="#636366")
            self.status_label.pack(side="right")
            ctk.CTkFrame(self, fg_color=COLOR_SEPARATOR, height=1, corner_radius=0).pack(fill="x")

            # 主体
            body = ctk.CTkFrame(self, fg_color=BG_PRIMARY, corner_radius=0)
            body.pack(fill="both", expand=True, padx=16, pady=16)
            self._build_sidebar(body)
            self._build_log_panel(body)

        def _section(self, parent, text):
            ctk.CTkLabel(parent, text=text.upper(), font=ctk.CTkFont(size=10, weight="bold"),
                         text_color="#636366").pack(anchor="w", padx=16, pady=(14, 6))

        def _info_row(self, parent, label, value):
            row = ctk.CTkFrame(parent, fg_color="transparent"); row.pack(fill="x", padx=12, pady=6)
            ctk.CTkLabel(row, text=label, font=ctk.CTkFont(size=11), text_color="#8e8e93", width=40).pack(side="left")
            ctk.CTkLabel(row, text=value, font=ctk.CTkFont(size=12, weight="bold"),
                         text_color=COLOR_BLUE).pack(side="right")

        def _build_sidebar(self, parent):
            sb = ctk.CTkFrame(parent, fg_color=BG_SECONDARY, corner_radius=12, width=230)
            sb.pack(side="left", fill="y", padx=(0, 12)); sb.pack_propagate(False)

            self._section(sb, "服务器信息")
            card = ctk.CTkFrame(sb, fg_color=BG_TERTIARY, corner_radius=10)
            card.pack(fill="x", padx=12, pady=(0, 4))
            self._info_row(card, "地址", HOST)
            ctk.CTkFrame(card, fg_color=BG_GROUPED, height=1).pack(fill="x", padx=8)
            self._info_row(card, "端口", str(PORT))
            ctk.CTkFrame(card, fg_color=BG_GROUPED, height=1).pack(fill="x", padx=8)
            self._info_row(card, "协议", "HTTP")

            self._section(sb, "操作")
            self.open_btn = ctk.CTkButton(sb, text="打开网页端", command=self._open_homepage,
                                          font=ctk.CTkFont(size=13), fg_color=COLOR_BLUE, hover_color="#007aff",
                                          text_color="#fff", corner_radius=8, height=38)
            self.open_btn.pack(fill="x", padx=12, pady=(0, 8))
            ctk.CTkButton(sb, text="⚙ 路径配置", command=self._open_path_config,
                          font=ctk.CTkFont(size=13), fg_color=BG_TERTIARY, hover_color=BG_GROUPED,
                          text_color=COLOR_LABEL2, corner_radius=8, height=38).pack(fill="x", padx=12, pady=(0, 8))
            ctk.CTkButton(sb, text="打开日志文件夹", command=self._open_log_dir,
                          font=ctk.CTkFont(size=12), fg_color=BG_TERTIARY, hover_color=BG_GROUPED,
                          text_color=COLOR_LABEL2, corner_radius=8, height=34).pack(fill="x", padx=12)

            ctk.CTkFrame(sb, fg_color=COLOR_SEPARATOR, height=1).pack(fill="x", padx=12, pady=12)

            self._section(sb, "服务器")
            ctk.CTkButton(sb, text="清空日志视图", command=self._clear_log,
                          font=ctk.CTkFont(size=12), fg_color=BG_TERTIARY, hover_color=BG_GROUPED,
                          text_color="#636366", corner_radius=8, height=32).pack(fill="x", padx=12, pady=(0, 8))
            ctk.CTkButton(sb, text="退出程序", command=self._quit_app,
                          font=ctk.CTkFont(size=12), fg_color="#3a1f1f", hover_color="#5a2a2a",
                          text_color="#ff6b6b", corner_radius=8, height=34, border_width=1,
                          border_color="#7a3030").pack(fill="x", padx=12)

            ctk.CTkLabel(sb, text="OMICS · v5.6", font=ctk.CTkFont(size=10),
                         text_color="#48484a").pack(side="bottom", pady=(8, 10))

        def _build_log_panel(self, parent):
            panel = ctk.CTkFrame(parent, fg_color=BG_SECONDARY, corner_radius=12)
            panel.pack(side="right", fill="both", expand=True)
            header = ctk.CTkFrame(panel, fg_color="transparent"); header.pack(fill="x", padx=16, pady=(14, 6))
            ctk.CTkLabel(header, text="运行日志", font=ctk.CTkFont(size=13, weight="bold"),
                         text_color=COLOR_LABEL).pack(side="left")
            self.log_time_label = ctk.CTkLabel(header, text="", font=ctk.CTkFont(size=11), text_color="#48484a")
            self.log_time_label.pack(side="right")
            self.log_text = ctk.CTkTextbox(panel, font=ctk.CTkFont(family="Consolas", size=12),
                                           fg_color="#141416", text_color="#d1d1d6", corner_radius=8,
                                           wrap="word", state="disabled")
            self.log_text.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        # ---------- 服务状态 ----------
        def _wait_server_ready(self):
            if self._quitting:
                return
            if is_port_in_use(PORT):
                self.status_dot.configure(text_color=COLOR_GREEN)
                self.status_label.configure(text="运行中", text_color=COLOR_GREEN)
                self.server_running = True
                webbrowser.open(URL)
            else:
                self.after(500, self._wait_server_ready)

        # ---------- 日志 tail ----------
        def _tail_log_loop(self):
            if self._quitting:
                return
            try:
                if os.path.exists(LOG_PATH):
                    with open(LOG_PATH, 'r', encoding='utf-8', errors='replace') as f:
                        f.seek(self._log_pos)
                        new = f.read()
                        self._log_pos = f.tell()
                    if new:
                        self._append_log(new)
            except Exception:
                pass
            self.after(1000, self._tail_log_loop)

        def _append_log(self, text):
            tb = self.log_text._textbox
            tb.configure(state="normal")
            tb.insert("end", text)
            tb.configure(state="disabled")
            tb.see("end")
            self.log_time_label.configure(text="最后更新 " + time.strftime("%H:%M:%S"))

        def _clear_log(self):
            tb = self.log_text._textbox
            tb.configure(state="normal"); tb.delete("1.0", "end"); tb.configure(state="disabled")

        # ---------- 操作回调 ----------
        def _open_homepage(self):
            webbrowser.open(URL)

        def _open_log_dir(self):
            try:
                os.startfile(os.path.dirname(LOG_PATH))
            except Exception as e:
                LOG.warning("打开日志文件夹失败: %s", e)

        def _open_path_config(self):
            PathConfigDialog(self)

        def _on_close(self):
            self._quit_app()

        def _quit_app(self):
            self._quitting = True
            try:
                self.destroy()
            except Exception:
                pass
            os._exit(0)

    class PathConfigDialog(ctk.CTkToplevel):
        """路径配置：设置项目工作目录（含 frontend/backend）。"""
        def __init__(self, parent):
            super().__init__(parent)
            self.title("路径配置")
            self.geometry("520x230")
            self.resizable(False, False)
            self.configure(fg_color=BG_SECONDARY)
            self.grab_set(); self.lift(); self.focus_force()

            ctk.CTkLabel(self, text="项目工作目录", font=ctk.CTkFont(size=14, weight="bold"),
                         text_color=COLOR_LABEL).pack(anchor="w", padx=24, pady=(20, 4))
            ctk.CTkLabel(self, text="指向包含 frontend / backend 的项目根目录。\n配置后即使程序放在别处也能正常打开。",
                         font=ctk.CTkFont(size=11), text_color="#8e8e93", justify="left").pack(anchor="w", padx=24)

            row = ctk.CTkFrame(self, fg_color="transparent"); row.pack(fill="x", padx=24, pady=(14, 4))
            self.entry = ctk.CTkEntry(row, font=ctk.CTkFont(size=12), fg_color=BG_TERTIARY,
                                      border_color=BG_GROUPED, text_color=COLOR_LABEL)
            self.entry.pack(side="left", fill="x", expand=True)
            self.entry.insert(0, (load_config().get('work_dir') or work_dir or ''))
            ctk.CTkButton(row, text="浏览", width=64, command=self._browse,
                          fg_color=COLOR_BLUE, hover_color="#007aff", text_color="#fff",
                          corner_radius=8).pack(side="right", padx=(8, 0))

            self.hint = ctk.CTkLabel(self, text="", font=ctk.CTkFont(size=11), text_color=COLOR_ORANGE)
            self.hint.pack(anchor="w", padx=24, pady=(6, 0))

            btn_row = ctk.CTkFrame(self, fg_color="transparent"); btn_row.pack(fill="x", padx=24, pady=(16, 18))
            ctk.CTkButton(btn_row, text="取消", command=self.destroy, fg_color=BG_TERTIARY,
                          hover_color=BG_GROUPED, text_color=COLOR_LABEL2, corner_radius=8,
                          height=34, width=120).pack(side="left", expand=True, padx=(0, 6))
            ctk.CTkButton(btn_row, text="保存", command=self._save, fg_color=COLOR_GREEN,
                          hover_color="#27a846", text_color="#fff", corner_radius=8,
                          height=34, width=120).pack(side="right", expand=True, padx=(6, 0))

        def _browse(self):
            from tkinter import filedialog
            d = filedialog.askdirectory(title="选择项目工作目录")
            if d:
                self.entry.delete(0, "end"); self.entry.insert(0, d)

        def _save(self):
            wd = self.entry.get().strip()
            if not wd or not os.path.isdir(os.path.join(wd, 'frontend')):
                self.hint.configure(text="⚠ 该目录下未找到 frontend 文件夹，请重新选择。")
                return
            cfg = load_config(); cfg['work_dir'] = wd
            if save_config(cfg):
                self.hint.configure(text="✓ 已保存。重启程序后生效。", text_color=COLOR_GREEN)
            else:
                self.hint.configure(text="⚠ 配置写入失败（可能无写权限）。")

    app = ConsoleApp()
    app.mainloop()


# ==========================================
# 🌟 4. 无 GUI 依赖时的降级配置弹窗 (找不到 frontend 时)
# ==========================================
def prompt_path_config_minimal():
    """work_dir 无效且需要用户先配置时，用最简单的 tkinter 选目录。"""
    try:
        import tkinter as tk
        from tkinter import filedialog, messagebox
        root = tk.Tk(); root.withdraw()
        messagebox.showinfo("路径配置", "未找到项目资源(frontend)。请选择包含 frontend/backend 的项目根目录。")
        d = filedialog.askdirectory(title="选择项目工作目录")
        root.destroy()
        if d and os.path.isdir(os.path.join(d, 'frontend')):
            cfg = load_config(); cfg['work_dir'] = d; save_config(cfg)
            return d
    except Exception as e:
        LOG.exception("最小化路径配置失败: %s", e)
    return None


if __name__ == '__main__':
    LOG.info("=" * 60)
    LOG.info("程序启动 | runtime_dir=%s | frozen=%s | pid=%s",
             get_runtime_dir(), getattr(sys, 'frozen', False), os.getpid())
    LOG.info("日志文件: %s", LOG_PATH)

    kill_zombie_processes()

    work_dir = resolve_work_dir()
    if not work_dir:
        LOG.warning("未找到有效 work_dir，弹出路径配置")
        work_dir = prompt_path_config_minimal()
    if not work_dir:
        LOG.error("未配置有效工作目录，程序退出")
        sys.exit(1)

    LOG.info("工作目录: %s", work_dir)
    os.environ['FORECAST_WORK_DIR'] = work_dir

    try:
        launch_console(work_dir)
    except Exception as e:
        LOG.exception("控制台启动失败，降级为无界面直跑服务: %s", e)
        run_flask()
