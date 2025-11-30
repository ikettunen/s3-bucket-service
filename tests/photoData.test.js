const request = require('supertest');
const app = require('../src/server');
const PhotoData = require('../src/models/PhotoData');

describe('Photo Data Routes', () => {
  let testPhotoData;

  beforeEach(async () => {
    // Create test photo data
    testPhotoData = await PhotoData.create([
      {
        fileName: 'test1.jpg',
        originalFileName: 'wound_photo1.jpg',
        fileSize: 2048000,
        mimeType: 'image/jpeg',
        dimensions: { width: 1920, height: 1080 },
        s3Key: 'photos/visit_1/test1.jpg',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
        s3Url: 'https://test-bucket.s3.us-east-1.amazonaws.com/test1.jpg',
        visitId: 'visit_1',
        patientId: 'patient_1',
        staffId: 'staff_1',
        photoType: 'wound',
        processingStatus: 'completed',
        uploadedBy: 'staff_1'
      },
      {
        fileName: 'test2.png',
        originalFileName: 'skin_condition2.png',
        fileSize: 3072000,
        mimeType: 'image/png',
        dimensions: { width: 2560, height: 1440 },
        s3Key: 'photos/visit_2/test2.png',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
        s3Url: 'https://test-bucket.s3.us-east-1.amazonaws.com/test2.png',
        visitId: 'visit_2',
        patientId: 'patient_1',
        staffId: 'staff_2',
        photoType: 'skin_condition',
        processingStatus: 'completed',
        uploadedBy: 'staff_2'
      },
      {
        fileName: 'test3.jpg',
        originalFileName: 'medication3.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        dimensions: { width: 1280, height: 720 },
        s3Key: 'photos/visit_3/test3.jpg',
        s3Bucket: 'test-bucket',
        s3Region: 'us-east-1',
        s3Url: 'https://test-bucket.s3.us-east-1.amazonaws.com/test3.jpg',
        visitId: 'visit_3',
        patientId: 'patient_2',
        staffId: 'staff_1',
        photoType: 'medication',
        processingStatus: 'pending',
        uploadedBy: 'staff_1'
      }
    ]);
  });

  describe('GET /api/photo-data', () => {
    it('should get all photo data records', async () => {
      const response = await request(app)
        .get('/api/photo-data')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(3);
      expect(response.body.data.pagination.total).toBe(3);
    });

    it('should filter by visitId', async () => {
      const response = await request(app)
        .get('/api/photo-data?visitId=visit_1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(1);
      expect(response.body.data.records[0].visitId).toBe('visit_1');
    });

    it('should filter by patientId', async () => {
      const response = await request(app)
        .get('/api/photo-data?patientId=patient_1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(2);
      expect(response.body.data.records.every(r => r.patientId === 'patient_1')).toBe(true);
    });

    it('should filter by photoType', async () => {
      const response = await request(app)
        .get('/api/photo-data?photoType=wound')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(1);
      expect(response.body.data.records[0].photoType).toBe('wound');
    });

    it('should filter by processingStatus', async () => {
      const response = await request(app)
        .get('/api/photo-data?processingStatus=completed')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(2);
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/photo-data?limit=2&offset=0')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(2);
      expect(response.body.data.pagination.hasMore).toBe(true);
    });

    it('should sort by fileSize ascending', async () => {
      const response = await request(app)
        .get('/api/photo-data?sortBy=fileSize&sortOrder=asc')
        .expect(200);

      expect(response.body.success).toBe(true);
      const sizes = response.body.data.records.map(r => r.fileSize);
      expect(sizes[0]).toBeLessThan(sizes[1]);
    });
  });

  describe('GET /api/photo-data/:id', () => {
    it('should get photo data by ID', async () => {
      const response = await request(app)
        .get(`/api/photo-data/${testPhotoData[0]._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.fileName).toBe('test1.jpg');
      expect(response.body.data.visitId).toBe('visit_1');
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/photo-data/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Photo data not found');
    });

    it('should increment access count', async () => {
      const initialData = await PhotoData.findById(testPhotoData[0]._id);
      const initialCount = initialData.accessCount || 0;

      await request(app)
        .get(`/api/photo-data/${testPhotoData[0]._id}`)
        .expect(200);

      const updatedData = await PhotoData.findById(testPhotoData[0]._id);
      expect(updatedData.accessCount).toBe(initialCount + 1);
      expect(updatedData.lastAccessedAt).toBeDefined();
    });
  });

  describe('PUT /api/photo-data/:id', () => {
    it('should update photo data metadata', async () => {
      const updateData = {
        description: 'Updated wound photo description',
        tags: ['urgent', 'follow-up'],
        photoType: 'wound',
        location: {
          bodyPart: 'left leg',
          notes: 'Lower calf area'
        }
      };

      const response = await request(app)
        .put(`/api/photo-data/${testPhotoData[0]._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.description).toBe('Updated wound photo description');
      expect(response.body.data.tags).toEqual(['urgent', 'follow-up']);
      expect(response.body.data.location.bodyPart).toBe('left leg');
    });

    it('should update access level', async () => {
      const updateData = {
        accessLevel: 'patient_accessible'
      };

      const response = await request(app)
        .put(`/api/photo-data/${testPhotoData[0]._id}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.accessLevel).toBe('patient_accessible');
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .put(`/api/photo-data/${fakeId}`)
        .send({ description: 'Test' })
        .expect(404);

      expect(response.body.error).toBe('Photo data not found');
    });
  });

  describe('DELETE /api/photo-data/:id', () => {
    it('should delete photo data record', async () => {
      const response = await request(app)
        .delete(`/api/photo-data/${testPhotoData[0]._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Photo data deleted successfully');

      // Verify deletion
      const deleted = await PhotoData.findById(testPhotoData[0]._id);
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .delete(`/api/photo-data/${fakeId}`)
        .expect(404);

      expect(response.body.error).toBe('Photo data not found');
    });
  });

  describe('GET /api/photo-data/:id/download', () => {
    it('should generate download URL', async () => {
      const response = await request(app)
        .get(`/api/photo-data/${testPhotoData[0]._id}/download`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.downloadUrl).toBeDefined();
      expect(response.body.data.expires).toBeDefined();
      expect(response.body.data.fileName).toBe('wound_photo1.jpg');
      expect(response.body.data.fileSize).toBe(2048000);
      expect(response.body.data.dimensions).toEqual({ width: 1920, height: 1080 });
    });

    it('should accept custom expiration time', async () => {
      const response = await request(app)
        .get(`/api/photo-data/${testPhotoData[0]._id}/download?expiresIn=7200`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.downloadUrl).toBeDefined();
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/photo-data/${fakeId}/download`)
        .expect(404);

      expect(response.body.error).toBe('Photo data not found');
    });

    it('should increment access count on download', async () => {
      const initialData = await PhotoData.findById(testPhotoData[0]._id);
      const initialCount = initialData.accessCount || 0;

      await request(app)
        .get(`/api/photo-data/${testPhotoData[0]._id}/download`)
        .expect(200);

      const updatedData = await PhotoData.findById(testPhotoData[0]._id);
      expect(updatedData.accessCount).toBe(initialCount + 1);
    });
  });

  describe('GET /api/photo-data/visit/:visitId', () => {
    it('should get all photo data for a visit', async () => {
      const response = await request(app)
        .get('/api/photo-data/visit/visit_1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.visitId).toBe('visit_1');
      expect(response.body.data.records).toHaveLength(1);
      expect(response.body.data.count).toBe(1);
    });

    it('should return empty array for visit with no photos', async () => {
      const response = await request(app)
        .get('/api/photo-data/visit/visit_999')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(0);
      expect(response.body.data.count).toBe(0);
    });
  });

  describe('GET /api/photo-data/patient/:patientId', () => {
    it('should get all photo data for a patient', async () => {
      const response = await request(app)
        .get('/api/photo-data/patient/patient_1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.patientId).toBe('patient_1');
      expect(response.body.data.records).toHaveLength(2);
      expect(response.body.data.count).toBe(2);
    });

    it('should return empty array for patient with no photos', async () => {
      const response = await request(app)
        .get('/api/photo-data/patient/patient_999')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.records).toHaveLength(0);
      expect(response.body.data.count).toBe(0);
    });
  });
});
