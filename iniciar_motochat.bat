@echo off
title Moto-Chat + Tunnel
cls
echo =====================================================================
echo                  MOTO-CHAT - INICIALIZADOR LOCAL
echo =====================================================================
echo.
echo [1/3] Iniciando o servidor local Moto-Chat na porta 3001...
cd /d "c:\Users\tony\.gemini\antigravity-ide\scratch\Moto-Chat"
start /b "" "C:\Program Files\nodejs\npm.cmd" run dev >nul 2>&1

echo [2/3] Abrindo Moto-Chat localmente no seu navegador...
timeout /t 3 >nul
start http://localhost:3001
timeout /t 2 >nul

echo.
echo [3/3] Iniciando o tunel de internet seguro...
echo.

set USE_NGROK=1

:: Verifica se o cloudflared.exe existe
if not exist "%~dp0cloudflared.exe" (
    echo [INFO] Baixando Cloudflare Tunnel - trycloudflare - para evitar avisos do Ngrok...
    curl.exe -L -o "%~dp0cloudflared.exe" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" >nul 2>&1
)

:: Se o download falhar ou nao existir, usar Ngrok
if not exist "%~dp0cloudflared.exe" (
    echo [AVISO] Nao foi possivel baixar o Cloudflare Tunnel. Usando Ngrok como fallback...
    set USE_NGROK=1
)

if "%USE_NGROK%"=="1" (
    echo =====================================================================
    echo IMPORTANTE: Copie o link HTTPS exibido na linha "Forwarding" abaixo
    echo e abra-o no navegador do seu celular ou compartilhe com os motoboys!
    echo =====================================================================
    echo.
    cd /d "E:\ngrok"
    "E:\ngrok\ngrok.exe" start motochat --config "c:\Users\tony\.gemini\antigravity-ide\scratch\Moto-Chat\ngrok.yml"
) else (
    echo =====================================================================
    echo Copie o link HTTPS terminado em ".trycloudflare.com" exibido abaixo
    echo e abra-o no celular ou compartilhe com os motoboys - SEM TELAS DE AVISO!.
    echo =====================================================================
    echo.
    "%~dp0cloudflared.exe" tunnel --url http://localhost:3001
)
