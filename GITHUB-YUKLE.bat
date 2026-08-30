@echo off
setlocal
chcp 65001 >nul
title Game5 - GitHub Pages yukleme
cd /d "%~dp0"

set GHUSER=efedefne1115
set GHREPO=GravitySmallBall

echo.
echo ===============================================================
echo   GAME5  -^>  https://github.com/%GHUSER%/%GHREPO%
echo ===============================================================
echo.
echo   Repoyu github.com/new adresinden olusturdun mu?
echo   (Public, README isaretsiz)
echo.
pause

git remote remove origin 2>nul
git remote add origin "https://github.com/%GHUSER%/%GHREPO%.git"
git branch -M main

echo.
echo   Yukleniyor... ilk seferde tarayicida GitHub giris ekrani acilir.
echo.
git push -u origin main

if errorlevel 1 (
  echo.
  echo   HATA: push basarisiz.
  echo     - Repoyu olusturdun mu?  https://github.com/new
  echo     - Repo adi tam olarak "%GHREPO%" mu?
  echo     - Giris ekrani cikarsa GitHub hesabinla giris yap.
  echo.
  pause
  goto :eof
)

echo.
echo ===============================================================
echo   YUKLENDI.  SIMDI SON ADIM (tek seferlik):
echo ===============================================================
echo.
echo   Acilan sayfada:
echo     Source  : Deploy from a branch
echo     Branch  : main    /    (root)
echo     Save
echo.
echo   1-2 dakika sonra siten hazir:
echo.
echo     https://%GHUSER%.github.io/%GHREPO%/
echo.
echo   Bu linki telefona at, ac, DOWNLOAD FOR APP tusuna bas.
echo.
start "" "https://github.com/%GHUSER%/%GHREPO%/settings/pages"
pause
