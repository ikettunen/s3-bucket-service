# S3 Bucket Service

A Node.js service for handling audio and photo file uploads to AWS S3 with MongoDB metadata storage.

**Status:** Deployed to EC2

## Features

- **Presigned URL Generation**: Secure S3 upload URLs with expiration
- **MongoDB Integration**: Store file metadata in SoundData collection
- **File Management**: Upload, download, and delete audio files
- **Healthcare Context**: Visit and patient association
- **Retention Policies**: Configurable file retention periods
- **Access Control**: Role-based file access
- **Audit Trail**: Track file access and modifications

## API Endpoints

### Upload Endpoints
- `POST /api/uploads/presigned-url` - Generate presigned URL for upload
- `POST /api/uploads/confirm` - Confirm successful upload
- `GET /api/uploads/stats` - Get upload statistics

### Sound Data Endpoints
- `GET /api/sound-data` - List sound data with filtering
- `GET /api/sound-data/:id` - Get specific sound data record
- `PUT /api/sound-data/:id` - Update sound data metadata
- `DELETE /api/sound-data/:id` - Delete sound data and S3 file
- `GET /api/sound-data/:id/download` - Generate download URL
- `GET /api/sound-data/visit/:visitId` - Get files for visit
- `GET /api/sound-data/patient/:patientId` - Get files for patient

## Environment Variables

```bash
# Server Configuration
PORT=3009
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/healthcare_db

# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
S3_BUCKET_NAME=healthcare-audio-files

# Upload Configuration
MAX_FILE_SIZE=50MB
ALLOWED_FILE_TYPES=audio/wav,audio/mpeg,audio/ogg,audio/webm
PRESIGNED_URL_EXPIRY=300

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8080
```

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start

# Run tests
npm test
```

## Docker

```bash
# Build image
docker build -t s3-bucket-service .

# Run container
docker run -p 3009:3009 --env-file .env s3-bucket-service
```

## Usage Examples

### Generate Presigned URL
```javascript
const response = await fetch('/api/uploads/presigned-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fileName: 'recording.wav',
    contentType: 'audio/wav',
    visitId: 'visit_123',
    patientId: 'patient_456',
    recordingType: 'visit_note'
  })
});

const { uploadUrl, fileUrl, s3Key } = await response.json();
```

### Upload File to S3
```javascript
// Upload file using presigned URL
await fetch(uploadUrl, {
  method: 'PUT',
  body: audioFile,
  headers: { 'Content-Type': 'audio/wav' }
});

// Confirm upload
await fetch('/api/uploads/confirm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    s3Key,
    fileSize: audioFile.size,
    uploadedBy: 'staff_123'
  })
});
```

## MongoDB Schema

The service uses a `SoundData` collection with the following schema:

```javascript
{
  fileName: String,           // Generated filename
  originalFileName: String,   // Original upload filename
  fileSize: Number,          // File size in bytes
  mimeType: String,          // MIME type
  duration: Number,          // Duration in seconds
  s3Key: String,             // S3 object key
  s3Bucket: String,          // S3 bucket name
  s3Region: String,          // S3 region
  s3Url: String,             // Public S3 URL
  visitId: String,           // Associated visit ID
  patientId: String,         // Associated patient ID
  staffId: String,           // Uploading staff ID
  recordingType: String,     // Type of recording
  recordingSource: String,   // Source application
  tags: [String],            // Metadata tags
  description: String,       // File description
  processingStatus: String,  // Processing status
  transcription: Object,     // Transcription data
  accessLevel: String,       // Access control level
  uploadedBy: String,        // Uploader ID
  uploadedAt: Date,          // Upload timestamp
  lastAccessedAt: Date,      // Last access timestamp
  accessCount: Number,       // Access counter
  expiresAt: Date,           // Expiration date
  retentionPolicy: String    // Retention policy
}
```

## Security

- Files are stored privately in S3 by default
- Presigned URLs have configurable expiration times
- Access control based on user roles
- Audit trail for all file operations
- Input validation and sanitization

## Monitoring

- Winston logging with file rotation
- Health check endpoint at `/health`
- Upload statistics and metrics
- Error tracking and reporting