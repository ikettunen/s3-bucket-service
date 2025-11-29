@echo off
echo 🚀 Installing S3 Bucket Service...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

REM Install dependencies
echo 📦 Installing dependencies...
npm install

REM Create logs directory
echo 📁 Creating logs directory...
if not exist logs mkdir logs

REM Copy environment file if it doesn't exist
if not exist .env.local (
    echo 📝 Creating .env.local file...
    copy .env .env.local
    echo ⚠️  Please update .env.local with your AWS credentials and MongoDB URI
)

echo ✅ S3 Bucket Service installation complete!
echo.
echo Next steps:
echo 1. Update .env.local with your AWS credentials
echo 2. Ensure MongoDB is running
echo 3. Run 'npm run dev' to start the service
echo 4. Test with 'npm test'
echo.
echo Service will be available at: http://localhost:3009
echo Health check: http://localhost:3009/health
pause