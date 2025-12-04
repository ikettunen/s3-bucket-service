const AWS = require('aws-sdk');
const logger = require('../utils/logger');

// Configure AWS
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.S3_BUCKET_REGION || process.env.AWS_REGION || 'eu-north-1'
});

// Create S3 instance with explicit region
const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  signatureVersion: 'v4',
  region: process.env.S3_BUCKET_REGION || process.env.AWS_REGION || 'eu-north-1'
});

// S3 Configuration
const S3_CONFIG = {
  bucket: process.env.S3_BUCKET_NAME,
  region: process.env.S3_BUCKET_REGION || process.env.AWS_REGION || 'eu-north-1',
  accessPointAlias: process.env.S3_ACCESS_POINT_ALIAS,
  customEndpoint: process.env.S3_CUSTOM_ENDPOINT,
  useAccessPointAlias: process.env.USE_ACCESS_POINT_ALIAS === 'true',
  useCustomEndpoint: process.env.USE_CUSTOM_ENDPOINT === 'true',
  presignedUrlExpiry: parseInt(process.env.PRESIGNED_URL_EXPIRY) || 300,
  maxFileSize: process.env.MAX_FILE_SIZE || '50MB',
  allowedFileTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'audio/wav',
    'audio/mpeg', 
    'audio/ogg',
    'audio/webm'
  ]
};

// Get S3 bucket name (considering access point alias)
const getBucketName = () => {
  if (S3_CONFIG.useAccessPointAlias && S3_CONFIG.accessPointAlias) {
    return S3_CONFIG.accessPointAlias;
  }
  return S3_CONFIG.bucket;
};

// Get S3 base URL
const getS3BaseUrl = () => {
  if (S3_CONFIG.useCustomEndpoint && S3_CONFIG.customEndpoint) {
    return S3_CONFIG.customEndpoint;
  } else if (S3_CONFIG.useAccessPointAlias && S3_CONFIG.accessPointAlias) {
    return `https://${S3_CONFIG.accessPointAlias}.s3-accesspoint.${S3_CONFIG.region}.amazonaws.com`;
  } else {
    return `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com`;
  }
};

// Generate presigned URL for upload
const generatePresignedUrl = (key, contentType) => {
  try {
    const params = {
      Bucket: getBucketName(),
      Key: key,
      ContentType: contentType,
      Expires: S3_CONFIG.presignedUrlExpiry,
      ACL: 'private' // Files are private by default
    };

    const uploadUrl = s3.getSignedUrl('putObject', params);
    const fileUrl = `${getS3BaseUrl()}/${key}`;

    logger.info(`Generated presigned URL for key: ${key}`);
    
    return {
      uploadUrl,
      fileUrl,
      expires: new Date(Date.now() + S3_CONFIG.presignedUrlExpiry * 1000)
    };
  } catch (error) {
    logger.error('Error generating presigned URL:', error);
    throw error;
  }
};

// Generate presigned URL for download
const generateDownloadUrl = (key, expiresIn = 3600) => {
  try {
    const params = {
      Bucket: getBucketName(),
      Key: key,
      Expires: expiresIn
    };

    const downloadUrl = s3.getSignedUrl('getObject', params);
    
    logger.info(`Generated download URL for key: ${key}`);
    
    return {
      downloadUrl,
      expires: new Date(Date.now() + expiresIn * 1000)
    };
  } catch (error) {
    logger.error('Error generating download URL:', error);
    throw error;
  }
};

// Check if file exists in S3
const fileExists = async (key) => {
  try {
    await s3.headObject({
      Bucket: getBucketName(),
      Key: key
    }).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
};

// Delete file from S3
const deleteFile = async (key) => {
  try {
    await s3.deleteObject({
      Bucket: getBucketName(),
      Key: key
    }).promise();
    
    logger.info(`Deleted file from S3: ${key}`);
    return true;
  } catch (error) {
    logger.error(`Error deleting file from S3: ${key}`, error);
    throw error;
  }
};

module.exports = {
  s3,
  S3_CONFIG,
  getBucketName,
  getS3BaseUrl,
  generatePresignedUrl,
  generateDownloadUrl,
  fileExists,
  deleteFile
};