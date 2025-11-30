const request = require('supertest');
const app = require('../src/server');
const SoundData = require('../src/models/SoundData');

describe('Sound Data Routes', () => {
  let testSoundData;

  beforeEach(async () => {
    // Create test sound data
    testSoundData = await SoundData.create([
      {
        fileName: 'test1.wav',
        originalFileName: 'recording1.wav',
        fileSize: 1024000,
        mimeType: 'audio/wav',
        duration: 120,
        s3Key: 'audio_recordings/visit_1/test1.wav',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
        s3Url: 'https://test-bucket.s3.us-east-1.amazonaws.com/test1.wav',
        visitId: 'visit_1',
        patientId: 'patient_1',
        staffId: 'staff_1',
        recordingType: 'visit_note',
        processingStatus: 'completed',
        uploadedBy: 'staff_1'
      },
      {
        fileName: 'test2.wav',
        originalFileName: 'recording2.wav',
        fileSize: 2048000,
        mimeType: 'audio/wav',
        duration: 240,
        s3Key: 'audio_recordings/visit_2/test2.wav',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
        s3Url: 'https://test-bucket.s3.us-east-1.amazonaws.com/test2.wav',
        visitId: 'visit_2',
        patientId: 'patient_1',
        staffId: 'staff_2',
        recordingType: 'patient_interview',
        processingStatus: 'completed',
        uploadedBy: 'staff_2'
      },
      {
        fileName: 'test3.wav',
        originalFileName: 'recording3.wav',
        fileSize: 512000,
        mimeType: 'audio/wav',
        duration: 60,
        s3Key: 'audio_recordings/visit_3/test3.wav',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
        s3Url: 'https://test-bucket.s3.us-east-1.amazonaws.com/test3.wav',
        visitId: 'visit_3',
        patientId: 'patient_2',
        staffId: 'staff_1',
        recordingType: 'visit_note',
        processingStatus: 'pending',
        uploadedBy: 'staff_1'
      }
    ]);
  });

  describe('GET /api/sound-data', () => {
    it('should get all sound data records', async () => {
      const response = await request(app)
        .get('/api/sound-data')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(3);
      expect(response.body.data.pagination.total).toBe(3);
    });

    it('should filter by visitId', async () => {
      const response = await request(app)
        .get('/api/sound-data?visitId=visit_1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(1);
      expect(response.body.data.records[0].visitId).toBe('visit_1');
    });

    it('should filter by patientId', async () => {
      const response = await request(app)
        .get('/api/sound-data?patientId=patient_1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(2);
      expect(response.body.data.records.every(r => r.patientId === 'patient_1')).toBe(true);
    });

    it('should filter by recordingType', async () => {
      const response = await request(app)
        .get('/api/sound-data?recordingType=visit_note')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(2);
      expect(response.body.data.records.every(r => r.recordingType === 'visit_note')).toBe(true);
    });

    it('should filter by processingStatus', async () => {
      const response = await request(app)
        .get('/api/sound-data?processingStatus=completed')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(2);
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/sound-data?limit=2&offset=0')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(2);
      expect(response.body.data.pagination.hasMore).toBe(true);
    });

    it('should sort by fileSize ascending', async () => {
      const response = await request(app)
        .get('/api/sound-data?sortBy=fileSize&sortOrder=asc')
        .expect(200);

      expect(response.body.success).toBe(true);
      const sizes = response.body.data.records.map(r => r.fileSize);
      expect(sizes[0]).toBeLessThan(sizes[1]);
    });

    it('should sort by uploadedAt descending (default)', async () => {
      const response = await request(app)
        .get('/api/sound-data')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(3);
    });
  });

  describe('GET /api/sound-data/:id', () => {
    it('should get sound data by ID', async () => {
      const response = await request(app)
        .get(`/api/sound-data/${testSoundData[0]._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.fileName).toBe('test1.wav');
      expect(response.body.data.visitId).toBe('visit_1');
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/sound-data/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Sound data not found');
    });

    it('should increment access count', async () => {
      const initialData = await SoundData.findById(testSoundData[0]._id);
      const initialCount = initialData.accessCount || 0;

      await request(app)
        .get(`/api/sound-data/${testSoundData[0]._id}`)
        .expect(200);

      const updatedData = await SoundData.findById(testSoundData[0]._id);
      expect(updatedData.accessCount).toBe(initialCount + 1);
      expect(updatedData.lastAccessedAt).toBeDefined();
    });
  });

  describe('PUT /api/sound-data/:id', () => {
    it('should update sound data metadata', async () => {
      const updateData = {
        description: 'Updated description',
        tags: ['urgent', 'follow-up'],
        recordingType: 'medication_reminder'
      };

      const response = await request(app)
        .put(`/api/sound-data/${testSoundData[0]._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.description).toBe('Updated description');
      expect(response.body.data.tags).toEqual(['urgent', 'follow-up']);
      expect(response.body.data.recordingType).toBe('medication_reminder');
    });

    it('should update access level', async () => {
      const updateData = {
        accessLevel: 'staff_only'
      };

      const response = await request(app)
        .put(`/api/sound-data/${testSoundData[0]._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessLevel).toBe('staff_only');
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .put(`/api/sound-data/${fakeId}`)
        .send({ description: 'Test' })
        .expect(404);

      expect(response.body.error).toBe('Sound data not found');
    });

    it('should validate update data', async () => {
      const invalidData = {
        description: 'a'.repeat(600) // Exceeds max length
      };

      const response = await request(app)
        .put(`/api/sound-data/${testSoundData[0]._id}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation error');
    });
  });

  describe('DELETE /api/sound-data/:id', () => {
    it('should delete sound data record', async () => {
      const response = await request(app)
        .delete(`/api/sound-data/${testSoundData[0]._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Sound data deleted successfully');

      // Verify deletion
      const deleted = await SoundData.findById(testSoundData[0]._id);
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .delete(`/api/sound-data/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Sound data not found');
    });
  });

  describe('GET /api/sound-data/:id/download', () => {
    it('should generate download URL', async () => {
      const response = await request(app)
        .get(`/api/sound-data/${testSoundData[0]._id}/download`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.downloadUrl).toBeDefined();
      expect(response.body.data.expires).toBeDefined();
      expect(response.body.data.fileName).toBe('recording1.wav');
      expect(response.body.data.fileSize).toBe(1024000);
    });

    it('should accept custom expiration time', async () => {
      const response = await request(app)
        .get(`/api/sound-data/${testSoundData[0]._id}/download?expiresIn=7200`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.downloadUrl).toBeDefined();
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/sound-data/${fakeId}/download`)
        .expect(404);

      expect(response.body.error).toBe('Sound data not found');
    });

    it('should increment access count on download', async () => {
      const initialData = await SoundData.findById(testSoundData[0]._id);
      const initialCount = initialData.accessCount || 0;

      await request(app)
        .get(`/api/sound-data/${testSoundData[0]._id}/download`)
        .expect(200);

      const updatedData = await SoundData.findById(testSoundData[0]._id);
      expect(updatedData.accessCount).toBe(initialCount + 1);
    });
  });

  describe('GET /api/sound-data/visit/:visitId', () => {
    it('should get all sound data for a visit', async () => {
      const response = await request(app)
        .get('/api/sound-data/visit/visit_1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.visitId).toBe('visit_1');
      expect(response.body.data.records).toHaveLength(1);
      expect(response.body.data.count).toBe(1);
    });

    it('should return empty array for visit with no recordings', async () => {
      const response = await request(app)
        .get('/api/sound-data/visit/visit_999')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(0);
      expect(response.body.data.count).toBe(0);
    });
  });

  describe('GET /api/sound-data/patient/:patientId', () => {
    it('should get all sound data for a patient', async () => {
      const response = await request(app)
        .get('/api/sound-data/patient/patient_1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.patientId).toBe('patient_1');
      expect(response.body.data.records).toHaveLength(2);
      expect(response.body.data.count).toBe(2);
    });

    it('should return empty array for patient with no recordings', async () => {
      const response = await request(app)
        .get('/api/sound-data/patient/patient_999')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(0);
      expect(response.body.data.count).toBe(0);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('s3-bucket-service');
      expect(response.body.version).toBe('1.0.0');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown-route')
        .expect(404);

      expect(response.body.error).toBe('Route not found');
      expect(response.body.path).toBe('/api/unknown-route');
    });
  });
});
