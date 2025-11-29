const mongoose = require('mongoose');

const photoDataSchema = new mongoose.Schema({
  // File Information
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  originalFileName: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    required: true,
    min: 0
  },
  mimeType: {
    type: String,
    required: true,
    enum: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic']
  },
  dimensions: {
    width: {
      type: Number,
      min: 0,
      default: null
    },
    height: {
      type: Number,
      min: 0,
      default: null
    }
  },

  // S3 Information
  s3Key: {
    type: String,
    required: true,
    unique: true
  },
  s3Bucket: {
    type: String,
    required: true
  },
  s3Region: {
    type: String,
    required: true
  },
  s3Url: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    default: null
  },

  // Healthcare Context
  visitId: {
    type: String,
    required: true,
    index: true
  },
  patientId: {
    type: String,
    required: true,
    index: true
  },
  staffId: {
    type: String,
    index: true
  },
  
  // Photo Context
  photoType: {
    type: String,
    enum: ['wound', 'medication', 'patient_condition', 'vital_signs', 'medical_device', 'room_condition', 'other'],
    default: 'other'
  },
  photoSource: {
    type: String,
    enum: ['mobile_app', 'web_app', 'file_upload', 'camera'],
    default: 'mobile_app'
  },
  
  // Medical Context
  bodyPart: {
    type: String,
    trim: true,
    default: null
  },
  laterality: {
    type: String,
    enum: ['left', 'right', 'bilateral', 'midline', 'not_applicable'],
    default: 'not_applicable'
  },
  
  // Metadata
  tags: [{
    type: String,
    trim: true
  }],
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  clinicalNotes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  
  // EXIF Data (from camera)
  exifData: {
    dateTaken: {
      type: Date,
      default: null
    },
    cameraModel: {
      type: String,
      default: null
    },
    gpsLocation: {
      latitude: Number,
      longitude: Number
    }
  },

  // Processing Status
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  thumbnailGenerated: {
    type: Boolean,
    default: false
  },

  // Access Control
  isPublic: {
    type: Boolean,
    default: false
  },
  accessLevel: {
    type: String,
    enum: ['private', 'staff_only', 'patient_accessible', 'public'],
    default: 'staff_only'
  },
  hipaaCompliant: {
    type: Boolean,
    default: true
  },

  // Audit Trail
  uploadedBy: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now
  },
  accessCount: {
    type: Number,
    default: 0,
    min: 0
  },
  viewedBy: [{
    staffId: String,
    viewedAt: Date
  }],

  // Retention Policy
  expiresAt: {
    type: Date,
    default: null // null means no expiration
  },
  retentionPolicy: {
    type: String,
    enum: ['30_days', '1_year', '7_years', 'permanent'],
    default: '7_years'
  },

  // Quality Metrics
  quality: {
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    blurDetected: {
      type: Boolean,
      default: false
    },
    lightingQuality: {
      type: String,
      enum: ['poor', 'fair', 'good', 'excellent'],
      default: null
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
photoDataSchema.index({ visitId: 1, patientId: 1 });
photoDataSchema.index({ uploadedAt: -1 });
photoDataSchema.index({ photoType: 1 });
photoDataSchema.index({ processingStatus: 1 });
photoDataSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for file URL
photoDataSchema.virtual('fileUrl').get(function() {
  return this.s3Url;
});

// Virtual for human-readable file size
photoDataSchema.virtual('fileSizeFormatted').get(function() {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Virtual for aspect ratio
photoDataSchema.virtual('aspectRatio').get(function() {
  if (!this.dimensions || !this.dimensions.width || !this.dimensions.height) {
    return null;
  }
  return (this.dimensions.width / this.dimensions.height).toFixed(2);
});

// Pre-save middleware to set expiration date based on retention policy
photoDataSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt && this.retentionPolicy !== 'permanent') {
    const now = new Date();
    switch (this.retentionPolicy) {
      case '30_days':
        this.expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        break;
      case '1_year':
        this.expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        break;
      case '7_years':
        this.expiresAt = new Date(now.getTime() + 7 * 365 * 24 * 60 * 60 * 1000);
        break;
    }
  }
  next();
});

// Instance method to increment access count
photoDataSchema.methods.recordAccess = function(staffId) {
  this.accessCount += 1;
  this.lastAccessedAt = new Date();
  
  if (staffId) {
    this.viewedBy.push({
      staffId,
      viewedAt: new Date()
    });
  }
  
  return this.save();
};

// Static method to find by visit
photoDataSchema.statics.findByVisit = function(visitId) {
  return this.find({ visitId }).sort({ uploadedAt: -1 });
};

// Static method to find by patient
photoDataSchema.statics.findByPatient = function(patientId) {
  return this.find({ patientId }).sort({ uploadedAt: -1 });
};

// Static method to find by photo type
photoDataSchema.statics.findByType = function(photoType) {
  return this.find({ photoType }).sort({ uploadedAt: -1 });
};

// Static method to get statistics
photoDataSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalPhotos: { $sum: 1 },
        totalSize: { $sum: '$fileSize' },
        avgFileSize: { $avg: '$fileSize' },
        photosByType: {
          $push: {
            type: '$photoType',
            count: 1
          }
        }
      }
    }
  ]);
};

// Static method to find photos needing review
photoDataSchema.statics.findNeedingReview = function() {
  return this.find({
    $or: [
      { 'quality.blurDetected': true },
      { 'quality.lightingQuality': 'poor' },
      { processingStatus: 'failed' }
    ]
  }).sort({ uploadedAt: -1 });
};

const PhotoData = mongoose.model('PhotoData', photoDataSchema);

module.exports = PhotoData;
