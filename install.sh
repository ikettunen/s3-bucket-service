#!/bin/bash

echo "🚀 Installing S3 Bucket Service..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node -v)"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create logs directory
echo "📁 Creating logs directory..."
mkdir -p logs

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env .env.local
    echo "⚠️  Please update .env.local with your AWS credentials and MongoDB URI"
fi

# Check if MongoDB is running
echo "🔍 Checking MongoDB connection..."
if ! nc -z localhost 27017 2>/dev/null; then
    echo "⚠️  MongoDB is not running on localhost:27017"
    echo "   Please start MongoDB or update MONGODB_URI in .env"
fi

echo "✅ S3 Bucket Service installation complete!"
echo ""
echo "Next steps:"
echo "1. Update .env with your AWS credentials"
echo "2. Ensure MongoDB is running"
echo "3. Run 'npm run dev' to start the service"
echo "4. Test with 'npm test'"
echo ""
echo "Service will be available at: http://localhost:3009"
echo "Health check: http://localhost:3009/health"