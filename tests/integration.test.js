const request = require('supertest');
const app = require('../src/server');
const SoundData = require('../src/models/SoundData');

describe('S3 Bucket Service - Integration Tests', () => {
  describe('Complete Upload Workflow', () => {
    it('should complete full upload workflow: presigned URL -> upload -> confirm', async () => {
      // Step 1: Generate presigned URL
      const uploadRequest = {
        fileName: 'integration-test.wav',
        contentType: 'audio/wav',
        visitId: 'visit_integration',
        patientId: 'patient_integration',
        staffId: 'staff_integration',
        recordingType: 'visit_note',
        description: 'Integration test recording',
        tags: ['test', 'integration']
      };

      const presignedResponse = await request(app)
        .post('/api/uploads/presigned-url')
        .send(uploadRequest)
        .expect(200);

      expect(presignedResponse.body.success).toBe(true);
      expect(presignedResponse.body.data.uploadUrl).toBeDefined();
      expect(presignedResponse.body.data.s3Key).toBeDefined();
      expect(presignedResponse.body.data.dataId).toBeDefined();
      expect(presignedResponse.body.data.type).toBe('audio');

      const { s3Key, dataId } = presignedResponse.body.data;

      // Verify sound data record was created
      const soundData = await SoundData.findById(dataId);
      expect(soundData).toBeTruthy();
      expect(soundData.processingStatus).toBe('pending');
      expect(soundData.fileSize).toBe(0);

      // Step 2: Simulate upload confirmation
      const confirmRequest = {
        s3Key,
        fileSize: 2048000,
        duration: 180,
        uploadedBy: 'staff_integration'
      };

      const confirmResponse = await request(app)
        .post('/api/uploads/confirm')
        .send(confirmRequest)
        .expect(200);

      expect(confirmResponse.body.success).toBe(true);
      expect(confirmResponse.body.data.dataId).toBe(dataId);
      expect(confirmResponse.body.data.type).toBe('audio');

      // Verify sound data was updated
      const updatedSoundData = await SoundData.findById(dataId);
      expect(updatedSoundData.processingStatus).toBe('completed');
      expect(updatedSoundData.fileSize).toBe(2048000);
      expect(updatedSoundData.duration).toBe(180);

      // Step 3: Retrieve the sound data
      const getResponse = await request(app)
        .get(`/api/sound-data/${dataId}`)
        .expect(200);

      expect(getResponse.body.success).toBe(true);
      expect(getResponse.body.data.fileName).toBeDefined();
      expect(getResponse.body.data.visitId).toBe('visit_integration');

      // Step 4: Generate download URL
      const downloadResponse = await request(app)
        .get(`/api/sound-data/${dataId}/download`)
        .expect(200);

      expect(downloadResponse.body.success).toBe(true);
      expect(downloadResponse.body.data.downloadUrl).toBeDefined();

      // Step 5: Update metadata
      const updateResponse = await request(app)
        .put(`/api/sound-data/${dataId}`)
        .send({
          description: 'Updated integration test',
          tags: ['test', 'integration', 'updated']
        })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);
      expect(updateResponse.body.data.description).toBe('Updated integration test');

      // Step 6: Delete the record
      const deleteResponse = await request(app)
        .delete(`/api/sound-data/${dataId}`)
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);

      // Verify deletion
      const deletedData = await SoundData.findById(dataId);
      expect(deletedData).toBeNull();
    });
  });

  describe('Multiple Uploads for Same Visit', () => {
    it('should handle multiple uploads for the same visit', async () => {
      const visitId = 'visit_multi';
      const uploads = [];

      // Create 3 uploads for the same visit
      for (let i = 1; i <= 3; i++) {
        const response = await request(app)
          .post('/api/uploads/presigned-url')
          .send({
            fileName: `recording-${i}.wav`,
            contentType: 'audio/wav',
            visitId,
            patientId: 'patient_multi',
            recordingType: 'visit_note'
          })
          .expect(200);

        uploads.push(response.body.data);

        // Confirm each upload
        await request(app)
          .post('/api/uploads/confirm')
          .send({
            s3Key: response.body.data.s3Key,
            fileSize: 1024000 * i,
            uploadedBy: 'staff_multi'
          })
          .expect(200);
      }

      // Retrieve all recordings for the visit
      const visitResponse = await request(app)
        .get(`/api/sound-data/visit/${visitId}`)
        .expect(200);

      expect(visitResponse.body.success).toBe(true);
      expect(visitResponse.body.data.records).toHaveLength(3);
      expect(visitResponse.body.data.count).toBe(3);
    });
  });

  describe('Patient Recording History', () => {
    it('should track all recordings for a patient across visits', async () => {
      const patientId = 'patient_history';

      // Create recordings for different visits
      const visits = ['visit_1', 'visit_2', 'visit_3'];
      
      for (const visitId of visits) {
        const response = await request(app)
          .post('/api/uploads/presigned-url')
          .send({
            fileName: `recording-${visitId}.wav`,
            contentType: 'audio/wav',
            visitId,
            patientId,
            recordingType: 'visit_note'
          })
          .expect(200);

        await request(app)
          .post('/api/uploads/confirm')
          .send({
            s3Key: response.body.data.s3Key,
            fileSize: 1024000,
            uploadedBy: 'staff_history'
          })
          .expect(200);
      }

      // Get all recordings for the patient
      const patientResponse = await request(app)
        .get(`/api/sound-data/patient/${patientId}`)
        .expect(200);

      expect(patientResponse.body.success).toBe(true);
      expect(patientResponse.body.data.records).toHaveLength(3);
      expect(patientResponse.body.data.count).toBe(3);

      // Verify all recordings belong to the patient
      const allBelongToPatient = patientResponse.body.data.records.every(
        r => r.patientId === patientId
      );
      expect(allBelongToPatient).toBe(true);
    });
  });

  describe('Upload Statistics', () => {
    it('should calculate accurate statistics', async () => {
      // Create test data with known values
      await SoundData.create([
        {
          fileName: 'stat1.wav',
          originalFileName: 'stat1.wav',
          fileSize: 1000000,
          duration: 100,
          mimeType: 'audio/wav',
          s3Key: 'stat1',
          s3Bucket: 'test',
          s3Region: 'us-east-1',
          s3Url: 'https://test.com/stat1',
          visitId: 'v1',
          patientId: 'p1',
          uploadedBy: 's1',
          recordingType: 'visit_note',
          processingStatus: 'completed'
        },
        {
          fileName: 'stat2.wav',
          originalFileName: 'stat2.wav',
          fileSize: 2000000,
          duration: 200,
          mimeType: 'audio/wav',
          s3Key: 'stat2',
          s3Bucket: 'test',
          s3Region: 'us-east-1',
          s3Url: 'https://test.com/stat2',
          visitId: 'v2',
          patientId: 'p2',
          uploadedBy: 's2',
          recordingType: 'patient_interview',
          processingStatus: 'completed'
        },
        {
          fileName: 'stat3.wav',
          originalFileName: 'stat3.wav',
          fileSize: 3000000,
          duration: 300,
          mimeType: 'audio/wav',
          s3Key: 'stat3',
          s3Bucket: 'test',
          s3Region: 'us-east-1',
          s3Url: 'https://test.com/stat3',
          visitId: 'v3',
          patientId: 'p3',
          uploadedBy: 's3',
          recordingType: 'visit_note',
          processingStatus: 'pending'
        }
      ]);

      const response = await request(app)
        .get('/api/uploads/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.overall.totalFiles).toBe(3);
      expect(response.body.data.overall.totalSize).toBe(6000000);

      // Check audio stats
      expect(response.body.data.audio).toBeDefined();
      expect(response.body.data.audio.overall.totalFiles).toBe(3);
      expect(response.body.data.audio.overall.avgDuration).toBe(200);

      // Check status breakdown
      const statusStats = response.body.data.audio.byStatus;
      expect(statusStats).toBeDefined();
      expect(statusStats.length).toBeGreaterThan(0);

      // Check type breakdown
      const typeStats = response.body.data.audio.byType;
      expect(typeStats).toBeDefined();
      expect(typeStats.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid file types', async () => {
      const response = await request(app)
        .post('/api/uploads/presigned-url')
        .send({
          fileName: 'document.pdf',
          contentType: 'application/pdf',
          visitId: 'visit_error',
          patientId: 'patient_error'
        })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/uploads/presigned-url')
        .send({
          fileName: 'test.wav'
          // Missing contentType, visitId, patientId
        })
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });

    it('should handle confirmation for non-existent upload', async () => {
      const response = await request(app)
        .post('/api/uploads/confirm')
        .send({
          s3Key: 'non-existent-key',
          fileSize: 1024000,
          uploadedBy: 'staff_test'
        })
        .expect(404);

      expect(response.body.error).toBe('Data record not found');
    });

    it('should handle invalid MongoDB ObjectId', async () => {
      const response = await request(app)
        .get('/api/sound-data/invalid-id')
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Filtering and Pagination', () => {
    beforeEach(async () => {
      // Create test data
      const testData = [];
      for (let i = 1; i <= 25; i++) {
        testData.push({
          fileName: `test${i}.wav`,
          originalFileName: `test${i}.wav`,
          fileSize: 1000000 * i,
          mimeType: 'audio/wav',
          s3Key: `test${i}`,
          s3Bucket: 'test',
          s3Region: 'us-east-1',
          s3Url: `https://test.com/test${i}`,
          visitId: `visit_${i % 5}`,
          patientId: `patient_${i % 3}`,
          uploadedBy: `staff_${i % 2}`,
          recordingType: i % 2 === 0 ? 'visit_note' : 'patient_interview',
          processingStatus: i % 3 === 0 ? 'pending' : 'completed'
        });
      }
      await SoundData.insertMany(testData);
    });

    it('should paginate large result sets', async () => {
      const page1 = await request(app)
        .get('/api/sound-data?limit=10&offset=0')
        .expect(200);

      expect(page1.body.data.records).toHaveLength(10);
      expect(page1.body.data.pagination.hasMore).toBe(true);

      const page2 = await request(app)
        .get('/api/sound-data?limit=10&offset=10')
        .expect(200);

      expect(page2.body.data.records).toHaveLength(10);
      expect(page2.body.data.pagination.hasMore).toBe(true);

      const page3 = await request(app)
        .get('/api/sound-data?limit=10&offset=20')
        .expect(200);

      expect(page3.body.data.records).toHaveLength(5);
      expect(page3.body.data.pagination.hasMore).toBe(false);
    });

    it('should combine multiple filters', async () => {
      const response = await request(app)
        .get('/api/sound-data?patientId=patient_1&recordingType=visit_note&processingStatus=completed')
        .expect(200);

      expect(response.body.success).toBe(true);
      const records = response.body.data.records;
      
      records.forEach(record => {
        expect(record.patientId).toBe('patient_1');
        expect(record.recordingType).toBe('visit_note');
        expect(record.processingStatus).toBe('completed');
      });
    });
  });

  describe('Access Tracking', () => {
    it('should track file access patterns', async () => {
      const soundData = await SoundData.create({
        fileName: 'access-test.wav',
        originalFileName: 'access-test.wav',
        fileSize: 1024000,
        mimeType: 'audio/wav',
        s3Key: 'access-test',
        s3Bucket: 'test',
        s3Region: 'us-east-1',
        s3Url: 'https://test.com/access-test',
        visitId: 'visit_access',
        patientId: 'patient_access',
        uploadedBy: 'staff_access'
      });

      // Access the file multiple times
      for (let i = 0; i < 3; i++) {
        await request(app)
          .get(`/api/sound-data/${soundData._id}`)
          .expect(200);
      }

      // Check access count
      const updated = await SoundData.findById(soundData._id);
      expect(updated.accessCount).toBe(3);
      expect(updated.lastAccessedAt).toBeDefined();
    });
  });
});
