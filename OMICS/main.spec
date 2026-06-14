# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from PyInstaller.utils.hooks import collect_data_files

block_cipher = None

# --- 1. 资源路径配置 ---
# 收集 frontend 文件夹到打包后的根目录
# 收集 backend/logic 文件夹到打包后的 backend/logic (确保逻辑模块能被找到)
datas = [
    ('frontend', 'frontend'),
]

# 如果使用了 avwx 库，收集其数据文件
datas += collect_data_files('avwx')

# --- 2. 分析配置 ---
a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    
    # [关键] 显式导入所有用到的库
    hiddenimports=[
        'pystray',
        'PIL',
        'PIL._tkinter_finder',
        'tkinter',
        'flask',
        'waitress',         # 🌟 新增：Waitress 生产服务器
        'pandas',
        'requests',
        'avwx',
        'engineio.async_drivers.threading',
        
        # 🌟 核心修复：手动暴露所有函数内部“动态导入”的隐藏库！
        'openpyxl',
        'winshell',
        
        # 后端逻辑模块
        'backend',
        'backend.app',
        'backend.logic.metar_parser',
        'backend.logic.taf_parser',
        'backend.logic.sf_client',
        'backend.logic.exporter'  # 🌟 核心修复：不要漏掉刚才重构的 exporter
    ],
    
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    
    # [关键] 名称必须与 main.py 中定义的 EXE_NAME="ForecastTool.exe" 一致
    name='ForecastTool',
    
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    
    # 建议：由于目前是重大逻辑升级，建议先将 console=True
    # 这样打包后双击运行会带一个黑框，如果网页点击有报错，黑框里能直接看到原因。
    # 确认一切完美无BUG后，再改回 False 重新打个终极正式版。
    console=False, 
    
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon='icon.ico', 
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ForecastTool',
)