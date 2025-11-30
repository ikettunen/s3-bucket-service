const express = require('express');
const Joi = require('joi');
const PhotoData = require('../models/PhotoData');
const { generateDownloadUrl, deleteFile } = require('../config/aws');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const querySchema = Joi.object({
  visitId: Joi.string().optional(),
  patientId: Joi.string().optional(),
  photoType: Joi.string().valid('wound', 'skin_condition', 'medication', 'patient_id', 'general', 'other').optional(),
  processingStatus: Joi.string().valid('pending', 'processing', 'completed', 'failed').optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  sortBy: Joi.string().valid('uploadedAt', 'fileName', 'fileSize').default('uploadedAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

const updateSchema = Joi.object({
  description: Joi.string().max(500).optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  photoType: Joi.string().valid('wound', 'skin_condition', 'medication', 'patient_id', 'general', 'other').optional(),
  accessLevel: Joi.string().valid('private', 'staff_only', 'patient_accessible', 'public').optional(),
  location: Joi.object({
    bodyPart: Joi.string().optional(),
    notes: Joi.string().optional()
  }).optional()
});

/**
 * GET /api/photo-data
 * Get photo data records with filtering and pagination
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
      photoType,
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
    if (photoType) filter.photoType = photoType;
    if (processingStatus) filter.processingStatus = processingStatus;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query
    const [photoData, totalCount] = await Promise.all([
      PhotoData.find(filter)
        .sort(sort)
        .limit(limit)
        .skip(offset)
        .lean(),
      PhotoData.countDocuments(filter)
    ]);

    logger.info(`Retrieved ${photoData.length} photo data records`, {
      filter,
      limit,
      offset,
      totalCount
    });

    res.status(200).json({
      success: true,
      data: {
        records: photoData,
        pagination: {
          total: totalCount,
          limit,
          offset,
          hasMore: offset + limit < totalCount
        }
      }
    });

  } catch (error) {
    logger.error('Error retrieving photo data:', error);
    res.status(500).json({
      error: 'Failed to retrieve photo data',
      message: error.message
    });
  }
});

/**
 * GET /api/photo-data/:id
 * Get specific photo data record by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const photoData = await PhotoData.findById(id);
    if (!photoData) {
      return res.status(404).json({
        error: 'Photo data not found',
        id
      });
    }

    // Record access
    await photoData.recordAccess();

    logger.info(`Retrieved photo data record: ${id}`);

    res.status(200).json({
      success: true,
      data: photoData
    });

  } catch (error) {
    logger.error('Error retrieving photo data by ID:', error);
    res.status(500).json({
      error: 'Failed to retrieve photo data',
      message: error.message
    });
  }
});

/**
 * PUT /api/photo-data/:id
 * Update photo data record metadata
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

    const photoData = await PhotoData.findByIdAndUpdate(
      id,
      { ...value, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!photoData) {
      return res.status(404).json({
        error: 'Photo data not found',
        id
      });
    }

    logger.info(`Updated photo data record: ${id}`, value);

    res.status(200).json({
      success: true,
      data: photoData
    });

  } catch (error) {
    logger.error('Error updating photo data:', error);
    res.status(500).json({
      error: 'Failed to update photo data',
      message: error.message
    });
  }
});

/**
 * DELETE /api/photo-data/:id
 * Delete photo data record and associated S3 file
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const photoData = await PhotoData.findById(id);
    if (!photoData) {
      return res.status(404).json({
        error: 'Photo data not found',
        id
      });
    }

    // Delete file from S3
    try {
      await deleteFile(photoData.s3Key);
      logger.info(`Deleted S3 file: ${photoData.s3Key}`);
    } catch (s3Error) {
      logger.warn(`Failed to delete S3 file: ${photoData.s3Key}`, s3Error);
      // Continue with database deletion even if S3 deletion fails
    }

    // Delete database record
    await PhotoData.findByIdAndDelete(id);

    logger.info(`Deleted photo data record: ${id}`);

    res.status(200).json({
      success: true,
      message: 'Photo data deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting photo data:', error);
    res.status(500).json({
      error: 'Failed to delete photo data',
      message: error.message
    });
  }
});

/**
 * GET /api/photo-data/:id/download
 * Generate download URL for photo file
 */
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const expiresIn = parseInt(req.query.expiresIn) || 3600; // 1 hour default

    const photoData = await PhotoData.findById(id);
    if (!photoData) {
      return res.status(404).json({
        error: 'Photo data not found',
        id
      });
    }

    // Generate download URL
    const { downloadUrl, expires } = generateDownloadUrl(photoData.s3Key, expiresIn);

    // Record access
    await photoData.recordAccess();

    logger.info(`Generated download URL for: ${photoData.s3Key}`);

    res.status(200).json({
      success: true,
      data: {
        downloadUrl,
        expires,
        fileName: photoData.originalFileName,
        fileSize: photoData.fileSize,
        dimensions: photoData.dimensions
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
 * GET /api/photo-data/visit/:visitId
 * Get all photo data for a specific visit
 */
router.get('/visit/:visitId', async (req, res) => {
  try {
    const { visitId } = req.params;

    const photoData = await PhotoData.findByVisit(visitId);

    logger.info(`Retrieved ${photoData.length} photo data records for visit: ${visitId}`);

    res.status(200).json({
      success: true,
      data: {
        visitId,
        records: photoData,
        count: photoData.length
      }
    });

  } catch (error) {
    logger.error('Error retrieving photo data by visit:', error);
    res.status(500).json({
      error: 'Failed to retrieve photo data for visit',
      message: error.message
    });
  }
});

/**
 * GET /api/photo-data/patient/:patientId
 * Get all photo data for a specific patient
 */
router.get('/patient/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;

    const photoData = await PhotoData.findByPatient(patientId);

    logger.info(`Retrieved ${photoData.length} photo data records for patient: ${patientId}`);

    res.status(200).json({
      success: true,
      data: {
        patientId,
        records: photoData,
        count: photoData.length
      }
    });

  } catch (error) {
    logger.error('Error retrieving photo data by patient:', error);
    res.status(500).json({
      error: 'Failed to retrieve photo data for patient',
      message: error.message
    });
  }
});

module.exports = router;
