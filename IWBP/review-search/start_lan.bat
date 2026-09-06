@echo off
cd /d "%~dp0"
echo 启动复盘搜索服务（局域网可访问）...
echo 本机: http://localhost:8501
python -m streamlit run app/main.py --server.address 0.0.0.0 --server.port 8501
pause
