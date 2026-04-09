@echo off
echo Starting Dialora Backend...
call "%~dp0venv\Scripts\activate.bat"
uvicorn main:app --reload
