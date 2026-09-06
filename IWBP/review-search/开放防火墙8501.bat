@echo off

:: 请右键「以管理员身份运行」

echo 正在为复盘搜索系统开放 TCP 8501 端口...

netsh advfirewall firewall delete rule name="Review Search 8501" >nul 2>&1

netsh advfirewall firewall add rule name="Review Search 8501" dir=in action=allow protocol=TCP localport=8501 profile=any

if %errorlevel%==0 (

    echo 成功！请在服务电脑运行 ipconfig 查看 IPv4 地址

    echo 席位浏览器访问: http://你的IP:8501

) else (

    echo 失败，请确认已「以管理员身份运行」

)

pause

