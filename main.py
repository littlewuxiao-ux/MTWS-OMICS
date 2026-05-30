# main.py (全环境兼容 & 防死锁安全版)

import sys
import os
import codecs

# ==========================================
# 🌟 1. 环境注入与防中文乱码崩溃 (必须在最前面)
# ==========================================
try:
    # 强制标准输出为 utf-8，防止席位机 GBK 终端打印崩溃
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'replace')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'replace')
except:
    pass

# 强制注入当前路径到环境变量，防止 PyInstaller 打包后找不到 backend 模块
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# ==========================================
# 🌟 2. 正常模块导入
# ==========================================
import threading
import webbrowser
import time
import socket
import subprocess
import tkinter as tk
from PIL import Image, ImageDraw
import pystray
from pystray import MenuItem as item
from backend.app import app

# --- 配置 ---
PORT = 56789
HOST = '127.0.0.1'
URL = f"http://{HOST}:{PORT}"
EXE_NAME = "ForecastTool.exe"

# --- 强力清理旧进程 (防杀软挂起版) ---
def kill_zombie_processes():
    if getattr(sys, 'frozen', False):
        current_pid = os.getpid()
        try:
            # 🌟 加上 timeout=3，防止被席位电脑安全软件静默拦截导致永久死锁
            subprocess.run(
                f'taskkill /F /IM {EXE_NAME} /FI "PID ne {current_pid}"', 
                shell=True, 
                stdout=subprocess.DEVNULL, 
                stderr=subprocess.DEVNULL,
                timeout=3 
            )
            time.sleep(0.5)
        except subprocess.TimeoutExpired:
            print("[WARN] 进程清理超时，可能被安全软件拦截，跳过...")
        except Exception as e:
            print(f"Cleanup failed: {e}")

# --- 系统托盘逻辑 ---
def create_icon():
    width = 64; height = 64
    color1 = "#005A9C"; color2 = "#ffffff" 
    image = Image.new('RGB', (width, height), color1)
    dc = ImageDraw.Draw(image)
    dc.rectangle((width // 4, height // 4, width * 3 // 4, height * 3 // 4), fill=color2)
    return image

def run_flask():
    try:
        from waitress import serve
        serve(app, host=HOST, port=PORT, threads=6) 
    except OSError as e:
        with open("error.log", "a", encoding='utf-8') as f: 
            f.write(f"Port {PORT} is busy. Startup failed: {e}\n")
        os._exit(1)
    except Exception as e:
        with open("error.log", "a", encoding='utf-8') as f: 
            f.write(f"Server startup failed: {e}\n")

def open_browser(icon, item): webbrowser.open(URL)
def on_exit(icon, item): 
    icon.stop()
    os._exit(0)

def setup_tray():
    menu = (item('打开网页端 (Open Web)', open_browser, default=True), item('退出程序 (Exit)', on_exit))
    return pystray.Icon("ForecastTool", create_icon(), "预报评定工具", menu)

# --- 启动画面与检测逻辑 ---
def check_server_and_launch(root):
    """检测 Flask 是否就绪"""
    try:
        with socket.create_connection((HOST, PORT), timeout=0.1):
            root.destroy()
            webbrowser.open(URL)
            return
    except (OSError, ConnectionRefusedError):
        root.after(500, lambda: check_server_and_launch(root))

def show_splash():
    """显示原生加载窗口"""
    root = tk.Tk()
    root.overrideredirect(True)
    
    ws = root.winfo_screenwidth()
    hs = root.winfo_screenheight()
    w, h = 300, 100
    x = (ws/2) - (w/2)
    y = (hs/2) - (h/2)
    root.geometry('%dx%d+%d+%d' % (w, h, x, y))
    
    root.configure(bg='#f8f9fa')
    
    tk.Label(root, text="预报评定工具", font=("Segoe UI", 16, "bold"), bg='#f8f9fa', fg='#005A9C').pack(pady=(20, 5))
    tk.Label(root, text="正在初始化运行环境...", font=("Segoe UI", 10), bg='#f8f9fa', fg='#666').pack()
    
    root.after(100, lambda: check_server_and_launch(root))
    root.mainloop()

if __name__ == '__main__':
    # 0. 先清理僵尸进程 (带防挂起机制)
    kill_zombie_processes()

    # 1. 启动 Flask 线程
    flask_thread = threading.Thread(target=run_flask)
    flask_thread.daemon = True
    flask_thread.start()

    # 2. 显示 Splash Screen (阻塞)
    show_splash()

    # 3. Splash 关闭后，启动托盘
    tray_icon = setup_tray()
    tray_icon.run()