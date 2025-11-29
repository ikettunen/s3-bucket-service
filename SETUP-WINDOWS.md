# Windows Setup Guide

## Quick Setup (Recommended)

Just run this single command in the `s3-bukcet-service` directory:

```cmd
npm run setup
```

This will:
- Install all dependencies
- Create the logs directory
- Copy .env to .env.local

## Manual Setup

If you prefer to do it step by step:

```cmd
# 1. Install dependencies
npm install

# 2. Create logs directory
mkdir logs

# 3. Copy environment file
copy .env .env.local
```

## Configuration

1. Open `.env.local` in your text editor
2. Update these values:

```bash
# MongoDB (if using local MongoDB)
MONGODB_URI=mongodb://localhost:27017/healthcare_db

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_actual_access_key_here
AWS_SECRET_ACCESS_KEY=your_actual_secret_key_here
S3_BUCKET_NAME=your-bucket-name
```

## Start the Service

```cmd
# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start
```

## Test the Service

```cmd
# Run tests
npm test

# Check if service is running
curl http://localhost:3009/health
```

Or open in browser: http://localhost:3009/health

## Using with PM2

If you want to use PM2 (from the root project directory):

```cmd
# Start all services including S3 service
pm2 start ecosystem.config.js

# Start only S3 service
pm2 start ecosystem.config.js --only s3-bucket-service

# View logs
pm2 logs s3-bucket-service

# Stop service
pm2 stop s3-bucket-service
```

## Troubleshooting

### MongoDB Connection Issues
- Make sure MongoDB is installed and running
- Default MongoDB runs on `mongodb://localhost:27017`
- You can install MongoDB Community Server from: https://www.mongodb.com/try/download/community

### Port Already in Use
If port 3009 is already in use, change it in `.env.local`:
```bash
PORT=3010
```

### AWS Credentials
- Make sure your AWS credentials have S3 permissions
- Test your credentials with AWS CLI: `aws s3 ls`

### Node.js Version
- Requires Node.js 18 or higher
- Check version: `node --version`
- Download from: https://nodejs.org/