@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PROJECT_DIR=%~dp0"
set "PYTHON_EXE=%PROJECT_DIR%.venv\Scripts\python.exe"

echo ============================================================
echo      FRESHBASKET AI - FRANCHISE OPERATIONS WORKSPACE
echo ============================================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    where py >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python was not found. Install Python 3.10 or newer and add it to PATH.
        pause
        exit /b 1
    )
)
where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm was not found. Install Node.js 18 or newer, then run this file again.
    pause
    exit /b 1
)

if not exist "%PYTHON_EXE%" (
    echo [1/5] Creating the local Python environment...
    where py >nul 2>&1
    if not errorlevel 1 (
        py -3 -m venv "%PROJECT_DIR%.venv"
    ) else (
        python -m venv "%PROJECT_DIR%.venv"
    )
    if errorlevel 1 goto :environment_failed
) else (
    echo [1/5] Using the existing local Python environment.
)

"%PYTHON_EXE%" -c "import fastapi, uvicorn, pandas, numpy" >nul 2>&1
if errorlevel 1 (
    echo [2/5] Installing Python requirements. The first install may take a few minutes...
    "%PYTHON_EXE%" -m pip install --upgrade pip
    if errorlevel 1 goto :python_failed
    "%PYTHON_EXE%" -m pip install -r "%PROJECT_DIR%requirements.txt"
    if errorlevel 1 goto :python_failed
) else (
    echo [2/5] Python requirements are ready.
)

set "PREPARE_DATA=0"
if not exist "%PROJECT_DIR%data\store_risk_report.csv" set "PREPARE_DATA=1"
if not "%PREPARE_DATA%"=="1" call :check_data_schema
if "%PREPARE_DATA%"=="1" goto :prepare_data

echo [3/5] Challenge-compatible risk report found. Keeping your current data.
goto :data_ready

:check_data_schema
"%PYTHON_EXE%" -c "import pandas as pd,sys; cols=set(pd.read_csv(r'%PROJECT_DIR%data\store_risk_report.csv',nrows=0).columns); required={'signal_links_json','low_stock_items_json','transfer_candidates_json','action_options_json','complaint_themes_json','risk_score_base','estimated_fresh_wastage_cost_current','gross_margin_change_pp','complaints_change_pct','region','area'}; sys.exit(0 if required.issubset(cols) else 1)" >nul 2>&1
if errorlevel 1 set "PREPARE_DATA=1"
exit /b 0

:prepare_data
echo [3/5] Preparing the synthetic store data and risk report...
"%PYTHON_EXE%" "%PROJECT_DIR%data_generator.py"
if errorlevel 1 goto :data_failed
"%PYTHON_EXE%" "%PROJECT_DIR%inject_problem.py"
if errorlevel 1 goto :data_failed
"%PYTHON_EXE%" "%PROJECT_DIR%data_analyzer.py"
if errorlevel 1 goto :data_failed

:data_ready

if not exist "%PROJECT_DIR%frontend\node_modules\vite" (
    echo [4/5] Installing frontend packages. This may take a moment...
    pushd "%PROJECT_DIR%frontend"
    call npm install
    if errorlevel 1 (
        popd
        goto :frontend_failed
    )
    popd
) else (
    echo [4/5] Frontend packages are ready.
)

echo [5/5] Starting the API and website...
start "FreshBasket AI - Backend" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%PROJECT_DIR%'; & '%PYTHON_EXE%' -m uvicorn backend:app --host 127.0.0.1 --port 8000 --reload"
start "FreshBasket AI - Frontend" powershell -NoExit -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%PROJECT_DIR%frontend'; npm run dev -- --host 127.0.0.1"
echo.
echo Starting services. The browser will open in a few seconds...
timeout /t 6 /nobreak >nul
start "" "http://localhost:5173/"
echo Website:   http://localhost:5173
echo API docs:  http://127.0.0.1:8000/docs
echo.
echo Keep both server windows open while using FreshBasket AI.
echo To stop the services, close the two server windows.
echo.
pause
endlocal
exit /b 0

:environment_failed
echo ERROR: Could not create the Python environment. Verify that Python 3.10+ is installed.
pause
exit /b 1

:python_failed
echo ERROR: Python dependency installation failed. Check your internet connection and try again.
pause
exit /b 1

:data_failed
echo ERROR: Demo data preparation failed. Review the error above before trying again.
pause
exit /b 1

:frontend_failed
echo ERROR: Frontend dependency installation failed. Check npm and your internet connection.
pause
exit /b 1
