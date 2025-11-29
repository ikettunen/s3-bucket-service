# Backend Implementation for S3 Upload

## Required Backend Endpoint

You need to create an endpoint that generates presigned URLs for S3 uploads:

### POST `/uploads/presigned-url`

```javascript
// Example Node.js/Express endpoint
const AWS = require('aws-sdk');
const express = require('express');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

app.post('/uploads/presigned-url', async (req, res) => {
  try {
    const { fileName, contentType, visitId, patientId } = req.body;
    
    // Generate unique file name
    const timestamp = Date.now();
    const key = `audio_recordings/${visitId}_${timestamp}_${fileName}`;
    
    // Generate presigned URL for PUT operation
    const presignedUrl = s3.getSignedUrl('putObject', {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
      Expires: 300, // 5 minutes
    });
    
    // Return both upload URL and final file URL
    res.json({
      uploadUrl: presignedUrl,
      fileUrl: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`
    });
    
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
});
```

## Environment Variables

```bash
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-bucket-name
```

## S3 Bucket CORS Configuration

Your S3 bucket needs CORS configuration to allow web uploads:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "POST", "GET"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

## Alternative: Direct Upload with AWS SDK

If you prefer to use AWS SDK directly in Flutter (not recommended for production):

```dart
// Add to pubspec.yaml:
// aws_s3_upload: ^1.0.0

// Then use:
final result = await AwsS3.uploadFile(
  accessKey: "your_access_key",
  secretKey: "your_secret_key", 
  file: file,
  bucket: "your_bucket",
  region: "us-east-1",
  destDir: "audio_recordings/",
);
```

## Testing Without Backend

For testing purposes, the current implementation will fall back to simulation if the backend endpoint is not available.