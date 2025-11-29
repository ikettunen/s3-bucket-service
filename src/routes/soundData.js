const express = require('express');
const Joi = require('joi');
const SoundData = require('../models/SoundData');
const { generateDownloadUrl, deleteFile } = require('../config/aws');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const querySchema = Joi.object({
  visitId: Joi.string().optional(),
  patientId: Joi.string().optional(),
  recordingType: Joi.string().valid('visit_note', 'patient_interview', 'medication_reminder', 'other').optional(),
  processingStatus: Joi.string().valid('pending', 'processing', 'completed', 'failed').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('uploadedAt', 'fileName', 'fileSize', 'duration').default('uploadedAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

const updateSchema = Joi.object({
  description: Joi.string().max(500).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  recordingType: Joi.string().valid('visit_note', 'patient_interview', 'medication_reminder', 'other').optional(),
  accessLevel: Joi.string().valid('private', 'staff_only', 'patient_accessible', 'public').optional()
});

/**
 * GET /api/sound-data
 * Get sound data records with filtering and pagination
 */
router.get('/', async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = querySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(d => d.message)
      });
    }

    const {
      visitId,
      patientId,
      recordingType,
      processingStatus,
      limit,
      offset,
      sortBy,
      sortOrder
    } = value;

    // Build query filter
    const filter = {};
    if (visitId) filter.visitId = visitId;
    if (patientId) filter.patientId = patientId;
    if (recordingType) filter.recordingType = recordingType;
    if (processingStatus) filter.processingStatus = processingStatus;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [soundData, totalCount] = await Promise.all([
      SoundData.find(filter)
        .sort(sort)
        .limit(limit)
        .skip(offset)
        .lean(),
      SoundData.countDocuments(filter)
    ]);

    logger.info(`Retrieved ${soundData.length} sound data records`, {
      filter,
      limit,
      offset,
      totalCount
    });

    res.status(200).json({
      success: true,
      data: {
        records: soundData,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        }
      }
    });

  } catch (error) {
    logger.error('Error retrieving sound data:', error);
    res.status(500).json({
      error: 'Failed to retrieve sound data',
      message: error.message
    });
  }
});

/**
 * GET /api/sound-data/:id
 * Get specific sound data record by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const soundData = await SoundData.findById(id);
    if (!soundData) {
      return res.status(404).json({
        error: 'Sound data not found',
        id
      });
    }

    // Record access
    await soundData.recordAccess();

    logger.info(`Retrieved sound data record: ${id}`);

    res.status(200).json({
      success: true,
      data: soundData
    });

  } catch (error) {
    logger.error('Error retrieving sound data by ID:', error);
    res.status(500).json({
      error: 'Failed to retrieve sound data',
      message: error.message
    });
  }
});

/**
 * PUT /api/sound-data/:id
 * Update sound data record metadata
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate request body
    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details.map(d => d.message)
      });
    }

    const soundData = await SoundData.findByIdAndUpdate(
      id,
      { ...value, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!soundData) {
      return res.status(404).json({
        error: 'Sound data not found',
        id
      });
    }

    logger.info(`Updated sound data record: ${id}`, value);

    res.status(200).json({
      success: true,
      data: soundData
    });

  } catch (error) {
    logger.error('Error updating sound data:', error);
    res.status(500).json({
      error: 'Failed to update sound data',
      message: error.message
    });
  }
});

/**
 * DELETE /api/sound-data/:id
 * Delete sound data record and associated S3 file
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const soundData = await SoundData.findById(id);
    if (!soundData) {
      return res.status(404).json({
        error: 'Sound data not found',
        id
      });
    }

    // Delete file from S3
    try {
      await deleteFile(soundData.s3Key);
      logger.info(`Deleted S3 file: ${soundData.s3Key}`);
    } catch (s3Error) {
      logger.warn(`Failed to delete S3 file: ${soundData.s3Key}`, s3Error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete database record
    await SoundData.findByIdAndDelete(id);

    logger.info(`Deleted sound data record: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Sound data deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting sound data:', error);
    res.status(500).json({
      error: 'Failed to delete sound data',
      message: error.message
    });
  }
});

/**
 * GET /api/sound-data/:id/download
 * Generate download URL for sound file
 */
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const expiresIn = parseInt(req.query.expiresIn) || 3600; // 1 hour default

    const soundData = await SoundData.findById(id);
    if (!soundData) {
      return res.status(404).json({
        error: 'Sound data not found',
        id
      });
    }

    // Generate download URL
    const { downloadUrl, expires } = generateDownloadUrl(soundData.s3Key, expiresIn);

    // Record access
    await soundData.recordAccess();

    logger.info(`Generated download URL for: ${soundData.s3Key}`);

    res.status(200).json({
      success: true,
      data: {
        downloadUrl,
        expires,
        fileName: soundData.originalFileName,
        fileSize: soundData.fileSize,
        duration: soundData.duration
      }
    });

  } catch (error) {
    logger.error('Error generating download URL:', error);
    res.status(500).json({
      error: 'Failed to generate download URL',
      message: error.message
    });
  }
});

/**
 * GET /api/sound-data/visit/:visitId
 * Get all sound data for a specific visit
 */
router.get('/visit/:visitId', async (req, res) => {
  try {
    const { visitId } = req.params;

    const soundData = await SoundData.findByVisit(visitId);

    logger.info(`Retrieved ${soundData.length} sound data records for visit: ${visitId}`);

    res.status(200).json({
      success: true,
      data: {
        visitId,
        records: soundData,
        count: soundData.length
      }
    });

  } catch (error) {
    logger.error('Error retrieving sound data by visit:', error);
    res.status(500).json({
      error: 'Failed to retrieve sound data for visit',
      message: error.message
    });
  }
});

/**
 * GET /api/sound-data/patient/:patientId
 * Get all sound data for a specific patient
 */
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    const soundData = await SoundData.findByPatient(patientId);

    logger.info(`Retrieved ${soundData.length} sound data records for patient: ${patientId}`);

    res.status(200).json({
      success: true,
      data: {
        patientId,
        records: soundData,
        count: soundData.length
      }
    });

  } catch (error) {
    logger.error('Error retrieving sound data by patient:', error);
    res.status(500).json({
      error: 'Failed to retrieve sound data for patient',
      message: error.message
    });
  }
});

module.exports = router;