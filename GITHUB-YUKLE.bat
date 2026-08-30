@echo off
setlocal
chcp 65001 >nul
title Game5 - GitHub Pages yukleme
cd /d "%~dp0"

echo.
echo ===============================================================
echo   GAME5  ^>  GITHUB PAGES
echo ===============================================================
echo.
echo   ONCE SUNU YAP (yapmadiysan simdi yap):
echo     1^) https://github.com/new  adresini ac
echo     2^) Repository name : game5
echo     3^) Public sec
echo     4^) "Add a README file" isaretini KOYMA (bos repo olmali)
echo     5^) Create repository
echo.
echo ===============================================================
echo.

set /p GHUSER=GitHub kullanici adin:
if "%GHUSER%"=="" goto :eof

set /p GHREPO=Repo adi [game5]:
if "%GHREPO%"=="" set GHREPO=game5

echo.
echo   Hedef: https://github.com/%GHUSER%/%GHREPO%.git
echo   ^(ilk seferde tarayicida GitHub giris ekrani acilir^)
echo.

git remote remove origin 2>nul
git remote add origin "https://github.com/%GHUSER%/%GHREPO%.git"
git branch -M main
git push -u origin main

if errorlevel 1 (
  echo.
  echo   HATA: push basarisiz.
  echo   - Repoyu github.com/new adresinden olusturdun mu?
  echo   - Kullanici adi / repo adi dogru mu?
  echo   - Giris ekrani cikarsa GitHub hesabinla giris yap.
  echo.
  pause
  goto :eof
)

echo.
echo ===============================================================
echo   YUKLENDI.  SON ADIM (tek seferlik):
echo ===============================================================
echo.
echo   1^) https://github.com/%GHUSER%/%GHREPO%/settings/pages
echo   2^) Source        : Deploy from a branch
echo   3^) Branch        : main   /  (root)     -^>  Save
echo   4^) 1-2 dakika bekle.
echo.
echo   SITEN:
echo     https://%GHUSER%.github.io/%GHREPO%/
echo.
echo   Bu linki telefona at, ac, DOWNLOAD FOR APP tusuna bas.
echo   Artik HTTPS oldugu icin tus GERCEK kurulum penceresini acar.
echo.
start "" "https://github.com/%GHUSER%/%GHREPO%/settings/pages"
pause
