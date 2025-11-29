const mongoose = require('mongoose');

const soundDataSchema = new mongoose.Schema({
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
    enum: ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/webm']
  },
  duration: {
    type: Number, // Duration in seconds
    min: 0,
    default: null
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
  
  // Recording Context
  recordingType: {
    type: String,
    enum: ['visit_note', 'patient_interview', 'medication_reminder', 'other'],
    default: 'visit_note'
  },
  recordingSource: {
    type: String,
    enum: ['mobile_app', 'web_app', 'file_upload'],
    default: 'mobile_app'
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
  
  // Processing Status
  processingStatus: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  transcription: {
    text: {
      type: String,
      default: null
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null
    },
    language: {
      type: String,
      default: 'en-US'
    },
    processedAt: {
      type: Date,
      default: null
    }
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

  // Retention Policy
  expiresAt: {
    type: Date,
    default: null // null means no expiration
  },
  retentionPolicy: {
    type: String,
    enum: ['7_days', '30_days', '1_year', '7_years', 'permanent'],
    default: '7_years'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
soundDataSchema.index({ visitId: 1, patientId: 1 });
soundDataSchema.index({ uploadedAt: -1 });
soundDataSchema.index({ processingStatus: 1 });
soundDataSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for file URL with expiration check
soundDataSchema.virtual('fileUrl').get(function() {
  return this.s3Url;
});

// Virtual for human-readable file size
soundDataSchema.virtual('fileSizeFormatted').get(function() {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
});

// Virtual for duration formatted
soundDataSchema.virtual('durationFormatted').get(function() {
  if (!this.duration) return 'Unknown';
  
  const minutes = Math.floor(this.duration / 60);
  const seconds = Math.floor(this.duration % 60);
  
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Pre-save middleware to set expiration date based on retention policy
soundDataSchema.pre('save', function(next) {
  if (this.isNew && !this.expiresAt && this.retentionPolicy !== 'permanent') {
    const now = new Date();
    switch (this.retentionPolicy) {
      case '7_days':
        this.expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
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
soundDataSchema.methods.recordAccess = function() {
  this.accessCount += 1;
  this.lastAccessedAt = new Date();
  return this.save();
};

// Static method to find by visit
soundDataSchema.statics.findByVisit = function(visitId) {
  return this.find({ visitId }).sort({ uploadedAt: -1 });
};

// Static method to find by patient
soundDataSchema.statics.findByPatient = function(patientId) {
  return this.find({ patientId }).sort({ uploadedAt: -1 });
};

// Static method to get statistics
soundDataSchema.statics.getStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalFiles: { $sum: 1 },
        totalSize: { $sum: '$fileSize' },
        avgFileSize: { $avg: '$fileSize' },
        avgDuration: { $avg: '$duration' }
      }
    }
  ]);
};

const SoundData = mongoose.model('SoundData', soundDataSchema);

module.exports = SoundData;