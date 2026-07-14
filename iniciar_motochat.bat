@echo off
title Moto-Chat + Ngrok
cls
echo =====================================================================
echo                  MOTO-CHAT - INICIALIZADOR LOCAL
echo =====================================================================
echo.
echo [1/3] Iniciando o servidor local Moto-Chat na porta 3001...
cd /d "c:\Users\tony\.gemini\antigravity-ide\scratch\Moto-Chat"
start /b "" "C:\Program Files\nodejs\npm.cmd" run dev >nul 2>&1

echo [2/3] Aguardando 5 segundos para o servidor estabilizar...
timeout /t 5 >nul

echo [3/3] Iniciando o tunel Ngrok para a porta 3001...
echo.
echo =====================================================================
echo IMPORTANTE: Copie o link HTTPS exibido na linha "Forwarding" abaixo
echo e abra-o no navegador do seu celular ou compartilhe com os motoboys!
echo =====================================================================
echo.
cd /d "E:\ngrok"
"E:\ngrok\ngrok.exe" start motochat --config "c:\Users\tony\.gemini\antigravity-ide\scratch\Moto-Chat\ngrok.yml"
