import { S3Client } from '@aws-sdk/client-s3';

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!process.env.AWS_REGION) {
    // In local dev we still allow using env credentials, but region must exist.
    throw new Error('AWS_REGION não configurada.');
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION,
    });
  }

  return s3Client;
}

