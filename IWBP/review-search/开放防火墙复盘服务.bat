@echo off

chcp 65001 >nul

echo.

echo ===== 开放复盘服务端口（8501 + 8502）=====

echo 请右键「以管理员身份运行」

echo.



netsh advfirewall firewall delete rule name="Review Search 8501" >nul 2>&1

netsh advfirewall firewall delete rule name="Review Search 8502" >nul 2>&1



netsh advfirewall firewall add rule name="Review Search 8501" dir=in action=allow protocol=TCP localport=8501 profile=any

netsh advfirewall firewall add rule name="Review Search 8502" dir=in action=allow protocol=TCP localport=8502 profile=any



if %errorlevel%==0 (

  echo [OK] 防火墙已放行 8501、8502

  echo 请在服务机运行 ipconfig 查看 IPv4，其它席位用「配置复盘轻客户端.bat」填入该 IP

) else (

  echo [X] 失败，请确认已「以管理员身份运行」

)

pause

