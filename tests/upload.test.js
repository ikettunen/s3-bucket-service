const request = require('supertest');
const app = require('../src/server');
const SoundData = require('../src/models/SoundData');

describe('Upload Routes', () => {
  describe('POST /api/uploads/presigned-url', () => {
    it('should generate presigned URL for valid request', async () => {
      const uploadData = {
        fileName: 'test-recording.wav',
        contentType: 'audio/wav',
        visitId: 'visit_123',
        patientId: 'patient_456',
        recordingType: 'visit_note'
      };

      const response = await request(app)
        .post('/api/uploads/presigned-url')
        .send(uploadData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('uploadUrl');
      expect(response.body.data).toHaveProperty('fileUrl');
      expect(response.body.data).toHaveProperty('s3Key');
      expect(response.body.data).toHaveProperty('soundDataId');

      // Check if SoundData record was created
      const soundData = await SoundData.findById(response.body.data.soundDataId);
      expect(soundData).toBeTruthy();
      expect(soundData.visitId).toBe(uploadData.visitId);
      expect(soundData.patientId).toBe(uploadData.patientId);
    });

    it('should reject invalid content type', async () => {
      const uploadData = {
        fileName: 'test-file.txt',
        contentType: 'text/plain',
        visitId: 'visit_123',
        patientId: 'patient_456'
      };

      const response = await request(app)
        .post('/api/uploads/presigned-url')
        .send(uploadData)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should reject missing required fields', async () => {
      const uploadData = {
        fileName: 'test-recording.wav'
        // Missing contentType, visitId, patientId
      };

      const response = await request(app)
        .post('/api/uploads/presigned-url')
        .send(uploadData)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });
  });

  describe('POST /api/uploads/confirm', () => {
    let soundData;

    beforeEach(async () => {
      soundData = new SoundData({
        fileName: 'test_123.wav',
        originalFileName: 'test-recording.wav',
        fileSize: 0,
        mimeType: 'audio/wav',
        s3Key: 'audio_recordings/visit_123/test_123.wav',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
        s3Url: 'https://test-bucket.s3.us-east-1.amazonaws.com/audio_recordings/visit_123/test_123.wav',
        visitId: 'visit_123',
        patientId: 'patient_456',
        uploadedBy: 'staff_789'
      });
      await soundData.save();
    });

    it('should confirm upload successfully', async () => {
      const confirmData = {
        s3Key: soundData.s3Key,
        fileSize: 1024000,
        duration: 120,
        uploadedBy: 'staff_789'
      };

      const response = await request(app)
        .post('/api/uploads/confirm')
        .send(confirmData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('soundDataId');

      // Check if SoundData was updated
      const updatedSoundData = await SoundData.findById(soundData._id);
      expect(updatedSoundData.fileSize).toBe(confirmData.fileSize);
      expect(updatedSoundData.duration).toBe(confirmData.duration);
      expect(updatedSoundData.processingStatus).toBe('completed');
    });

    it('should return 404 for non-existent s3Key', async () => {
      const confirmData = {
        s3Key: 'non-existent-key',
        fileSize: 1024000,
        uploadedBy: 'staff_789'
      };

      const response = await request(app)
        .post('/api/uploads/confirm')
        .send(confirmData)
        .expect(404);

      expect(response.body.error).toBe('Sound data record not found');
    });
  });

  describe('GET /api/uploads/stats', () => {
    beforeEach(async () => {
      // Create test data
      const testData = [
        {
          fileName: 'test1.wav',
          originalFileName: 'test1.wav',
          fileSize: 1000,
          mimeType: 'audio/wav',
          s3Key: 'test1',
          s3Bucket: 'test-bucket',
          s3Region: 'us-east-1',
          s3Url: 'https://test.com/test1',
          visitId: 'visit_1',
          patientId: 'patient_1',
          uploadedBy: 'staff_1',
          recordingType: 'visit_note',
          processingStatus: 'completed'
        },
        {
          fileName: 'test2.wav',
          originalFileName: 'test2.wav',
          fileSize: 2000,
          mimeType: 'audio/wav',
          s3Key: 'test2',
          s3Bucket: 'test-bucket',
          s3Region: 'us-east-1',
          s3Url: 'https://test.com/test2',
          visitId: 'visit_2',
          patientId: 'patient_2',
          uploadedBy: 'staff_2',
          recordingType: 'patient_interview',
          processingStatus: 'pending'
        }
      ];

      await SoundData.insertMany(testData);
    });

    it('should return upload statistics', async () => {
      const response = await request(app)
        .get('/api/uploads/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('overall');
      expect(response.body.data).toHaveProperty('byStatus');
      expect(response.body.data).toHaveProperty('byType');

      expect(response.body.data.overall.totalFiles).toBe(2);
      expect(response.body.data.overall.totalSize).toBe(3000);
    });
  });
});