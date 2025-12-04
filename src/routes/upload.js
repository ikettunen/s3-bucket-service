const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const { generatePresignedUrl, S3_CONFIG } = require('../config/aws');
const SoundData = require('../models/SoundData');
const PhotoData = require('../models/PhotoData');
const logger = require('../utils/logger');

const router = express.Router();

// Get allowed file types from config (reads from .env)
const ALLOWED_FILE_TYPES = S3_CONFIG.allowedFileTypes;

// Validation schemas
const presignedUrlSchema = Joi.object({
  fileName: Joi.string().required().min(1).max(255),
  contentType: Joi.string().valid(...ALLOWED_FILE_TYPES).required(),
  visitId: Joi.string().required().min(1),
  patientId: Joi.string().required().min(1),
  staffId: Joi.string().optional(),
  // For audio files
  recordingType: Joi.string().valid('visit_note', 'patient_interview', 'medication_reminder', 'other').optional(),
  recordingSource: Joi.string().valid('mobile_app', 'web_app', 'file_upload').default('mobile_app'),
  // For photo files
  photoType: Joi.string().valid('wound', 'skin_condition', 'medication', 'patient_id', 'general', 'other').optional(),
  photoSource: Joi.string().valid('mobile_app', 'web_app', 'file_upload').default('mobile_app'),
  // Common fields
  description: Joi.string().max(500).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  retentionPolicy: Joi.string().valid('7_days', '30_days', '1_year', '7_years', 'permanent').default('7_years')
});

const uploadConfirmSchema = Joi.object({
  s3Key: Joi.string().required(),
  fileSize: Joi.number().integer().min(1).required(),
  duration: Joi.number().min(0).optional(), // For audio
  dimensions: Joi.object({ // For photos
    width: Joi.number().integer().min(1).optional(),
    height: Joi.number().integer().min(1).optional()
  }).optional(),
  uploadedBy: Joi.string().required()
});

/**
 * POST /api/uploads/presigned-url
 * Generate presigned URL for S3 upload
 */
router.post('/presigned-url', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = presignedUrlSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(d => d.message)
      });
    }

    const {
      fileName,
      contentType,
      visitId,
      patientId,
      staffId,
      recordingType,
      recordingSource,
      photoType,
      photoSource,
      description,
      tags,
      retentionPolicy
    } = value;

    // Determine if this is audio or photo
    const isAudio = contentType.startsWith('audio/');
    const isPhoto = contentType.startsWith('image/');

    // Generate unique S3 key with human-readable naming
    const timestamp = Date.now();
    const fileExtension = fileName.split('.').pop();
    const uniqueId = uuidv4();
    const folder = isAudio ? 'audio_recordings' : 'photos';
    
    // Create human-readable filename: visit_audio_YYYYMMDD_HHMMSS.ext or visit_photo_YYYYMMDD_HHMMSS.ext
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, ''); // HHMMSS
    const fileType = isAudio ? 'audio' : 'photo';
    const humanReadableFileName = `visit_${fileType}_${dateStr}_${timeStr}.${fileExtension}`;
    
    const s3Key = `${folder}/${visitId}/${humanReadableFileName}`;

    // Generate presigned URL
    const { uploadUrl, fileUrl, expires } = generatePresignedUrl(s3Key, contentType);

    let dataRecord;
    let dataId;

    if (isAudio) {
      // Create pending sound data record
      const soundData = new SoundData({
        fileName: humanReadableFileName,
        originalFileName: fileName,
        fileSize: 0, // Will be updated on confirmation
        mimeType: contentType,
        s3Key,
        s3Bucket: S3_CONFIG.bucket,
        s3Region: S3_CONFIG.region,
        s3Url: fileUrl,
        visitId,
        patientId,
        staffId,
        recordingType: recordingType || 'visit_note',
        recordingSource: recordingSource || 'mobile_app',
        description,
        tags: tags || [],
        retentionPolicy,
        processingStatus: 'pending',
        uploadedBy: staffId || 'unknown',
        uploadedAt: new Date()
      });

      dataRecord = await soundData.save();
      dataId = dataRecord._id;
    } else if (isPhoto) {
      // Create pending photo data record
      const photoData = new PhotoData({
        fileName: humanReadableFileName,
        originalFileName: fileName,
        fileSize: 0, // Will be updated on confirmation
        mimeType: contentType,
        s3Key,
        s3Bucket: S3_CONFIG.bucket,
        s3Region: S3_CONFIG.region,
        s3Url: fileUrl,
        visitId,
        patientId,
        staffId,
        photoType: photoType || 'general',
        photoSource: photoSource || 'mobile_app',
        description,
        tags: tags || [],
        retentionPolicy,
        processingStatus: 'pending',
        uploadedBy: staffId || 'unknown',
        uploadedAt: new Date()
      });

      dataRecord = await photoData.save();
      dataId = dataRecord._id;
    }

    logger.info(`Generated presigned URL for upload: ${s3Key}`, {
      visitId,
      patientId,
      fileName,
      contentType,
      type: isAudio ? 'audio' : 'photo'
    });

    res.status(200).json({
      success: true,
      data: {
        uploadUrl,
        fileUrl,
        s3Key,
        expires,
        dataId,
        type: isAudio ? 'audio' : 'photo'
      }
    });

  } catch (error) {
    logger.error('Error generating presigned URL:', error);
    res.status(500).json({
      error: 'Failed to generate presigned URL',
      message: error.message
    });
  }
});

/**
 * POST /api/uploads/confirm
 * Confirm successful upload and update file metadata
 */
router.post('/confirm', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = uploadConfirmSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(d => d.message)
      });
    }

    const { s3Key, fileSize, duration, dimensions, uploadedBy } = value;

    // Try to find in sound data first
    let soundData = await SoundData.findOne({ s3Key });
    let photoData = null;

    if (!soundData) {
      // Try photo data
      photoData = await PhotoData.findOne({ s3Key });
    }

    if (!soundData && !photoData) {
      return res.status(404).json({
        error: 'Data record not found',
        s3Key
      });
    }

    if (soundData) {
      // Update sound file metadata
      soundData.fileSize = fileSize;
      soundData.duration = duration;
      soundData.uploadedBy = uploadedBy;
      soundData.processingStatus = 'completed';
      soundData.uploadedAt = new Date();

      await soundData.save();

      logger.info(`Audio upload confirmed for: ${s3Key}`, {
        fileSize,
        duration,
        uploadedBy
      });

      res.status(200).json({
        success: true,
        data: {
          dataId: soundData._id,
          fileUrl: soundData.s3Url,
          type: 'audio',
          message: 'Upload confirmed successfully'
        }
      });
    } else if (photoData) {
      // Update photo file metadata
      photoData.fileSize = fileSize;
      if (dimensions) {
        photoData.dimensions = dimensions;
      }
      photoData.uploadedBy = uploadedBy;
      photoData.processingStatus = 'completed';
      photoData.uploadedAt = new Date();

      await photoData.save();

      logger.info(`Photo upload confirmed for: ${s3Key}`, {
        fileSize,
        dimensions,
        uploadedBy
      });

      res.status(200).json({
        success: true,
        data: {
          dataId: photoData._id,
          fileUrl: photoData.s3Url,
          type: 'photo',
          message: 'Upload confirmed successfully'
        }
      });
    }

  } catch (error) {
    logger.error('Error confirming upload:', error);
    res.status(500).json({
      error: 'Failed to confirm upload',
      message: error.message
    });
  }
});

/**
 * GET /api/uploads/stats
 * Get upload statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const soundStats = await SoundData.getStats();
    const photoStats = await PhotoData.getStats();
    
    const soundStatusStats = await SoundData.aggregate([
      {
        $group: {
          _id: '$processingStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const soundTypeStats = await SoundData.aggregate([
      {
        $group: {
          _id: '$recordingType',
          count: { $sum: 1 }
        }
      }
    ]);

    const photoStatusStats = await PhotoData.aggregate([
      {
        $group: {
          _id: '$processingStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const photoTypeStats = await PhotoData.aggregate([
      {
        $group: {
          _id: '$photoType',
          count: { $sum: 1 }
        }
      }
    ]);

    const soundOverall = soundStats[0] || {
      totalFiles: 0,
      totalSize: 0,
      avgFileSize: 0,
      avgDuration: 0
    };

    const photoOverall = photoStats[0] || {
      totalFiles: 0,
      totalSize: 0,
      avgFileSize: 0
    };

    res.status(200).json({
      success: true,
      data: {
        overall: {
          totalFiles: soundOverall.totalFiles + photoOverall.totalFiles,
          totalSize: soundOverall.totalSize + photoOverall.totalSize,
          avgFileSize: ((soundOverall.avgFileSize || 0) + (photoOverall.avgFileSize || 0)) / 2
        },
        audio: {
          overall: soundOverall,
          byStatus: soundStatusStats,
          byType: soundTypeStats
        },
        photos: {
          overall: photoOverall,
          byStatus: photoStatusStats,
          byType: photoTypeStats
        }
      }
    });

  } catch (error) {
    logger.error('Error getting upload stats:', error);
    res.status(500).json({
      error: 'Failed to get upload statistics',
      message: error.message
    });
  }
});

module.exports = router;