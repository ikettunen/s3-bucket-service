const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const { generatePresignedUrl, S3_CONFIG } = require('../config/aws');
const SoundData = require('../models/SoundData');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const presignedUrlSchema = Joi.object({
  fileName: Joi.string().required().min(1).max(255),
  contentType: Joi.string().valid(...S3_CONFIG.allowedFileTypes).required(),
  visitId: Joi.string().required().min(1),
  patientId: Joi.string().required().min(1),
  staffId: Joi.string().optional(),
  recordingType: Joi.string().valid('visit_note', 'patient_interview', 'medication_reminder', 'other').default('visit_note'),
  recordingSource: Joi.string().valid('mobile_app', 'web_app', 'file_upload').default('web_app'),
  description: Joi.string().max(500).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  retentionPolicy: Joi.string().valid('7_days', '30_days', '1_year', '7_years', 'permanent').default('7_years')
});

const uploadConfirmSchema = Joi.object({
  s3Key: Joi.string().required(),
  fileSize: Joi.number().integer().min(1).required(),
  duration: Joi.number().min(0).optional(),
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
      description,
      tags,
      retentionPolicy
    } = value;

    // Generate unique S3 key
    const timestamp = Date.now();
    const fileExtension = fileName.split('.').pop();
    const uniqueId = uuidv4();
    const s3Key = `audio_recordings/${visitId}/${timestamp}_${uniqueId}.${fileExtension}`;

    // Generate presigned URL
    const { uploadUrl, fileUrl, expires } = generatePresignedUrl(s3Key, contentType);

    // Create pending sound data record
    const soundData = new SoundData({
      fileName: `${timestamp}_${uniqueId}.${fileExtension}`,
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
      recordingType,
      recordingSource,
      description,
      tags: tags || [],
      retentionPolicy,
      processingStatus: 'pending',
      uploadedBy: staffId || 'unknown',
      uploadedAt: new Date()
    });

    await soundData.save();

    logger.info(`Generated presigned URL for upload: ${s3Key}`, {
      visitId,
      patientId,
      fileName,
      contentType
    });

    res.status(200).json({
      success: true,
      data: {
        uploadUrl,
        fileUrl,
        s3Key,
        expires,
        soundDataId: soundData._id
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

    const { s3Key, fileSize, duration, uploadedBy } = value;

    // Find and update sound data record
    const soundData = await SoundData.findOne({ s3Key });
    if (!soundData) {
      return res.status(404).json({
        error: 'Sound data record not found',
        s3Key
      });
    }

    // Update file metadata
    soundData.fileSize = fileSize;
    soundData.duration = duration;
    soundData.uploadedBy = uploadedBy;
    soundData.processingStatus = 'completed';
    soundData.uploadedAt = new Date();

    await soundData.save();

    logger.info(`Upload confirmed for: ${s3Key}`, {
      fileSize,
      duration,
      uploadedBy
    });

    res.status(200).json({
      success: true,
      data: {
        soundDataId: soundData._id,
        fileUrl: soundData.s3Url,
        message: 'Upload confirmed successfully'
      }
    });

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
    const stats = await SoundData.getStats();
    const statusStats = await SoundData.aggregate([
      {
        $group: {
          _id: '$processingStatus',
          count: { $sum: 1 }
        }
      }
    ]);

    const typeStats = await SoundData.aggregate([
      {
        $group: {
          _id: '$recordingType',
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overall: stats[0] || {
          totalFiles: 0,
          totalSize: 0,
          avgFileSize: 0,
          avgDuration: 0
        },
        byStatus: statusStats,
        byType: typeStats
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