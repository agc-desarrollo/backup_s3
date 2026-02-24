import { s3Service } from './src/services/s3Service.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkS3() {
  try {
    console.log('Initializing S3 Service...');
    await s3Service.init();
    console.log('Fetching object list...');
    const result = await s3Service.listObjects();
    console.log(`There are ${result.objects.length} objects in the bucket.`);
    if (result.objects.length > 0) {
      console.log('First 5 objects:');
      result.objects.slice(0, 5).forEach(o => console.log(`- ${o.Key} (Size: ${o.Size})`));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

checkS3();
