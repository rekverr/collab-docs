import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AppEnvironment } from "../common/config/environment";

const uploadUrlLifetimeSeconds = 10 * 60;
const downloadUrlLifetimeSeconds = 5 * 60;

@Injectable()
export class ObjectStorageService {
  private readonly bucket: string;
  private readonly internalClient: S3Client;
  private readonly publicClient: S3Client;

  constructor(config: ConfigService<AppEnvironment, true>) {
    this.bucket = config.getOrThrow("S3_BUCKET", { infer: true });
    const shared = {
      region: config.getOrThrow("S3_REGION", { infer: true }),
      credentials: {
        accessKeyId: config.getOrThrow("S3_ACCESS_KEY", { infer: true }),
        secretAccessKey: config.getOrThrow("S3_SECRET_KEY", { infer: true }),
      },
      forcePathStyle: true,
    };
    this.internalClient = new S3Client({
      ...shared,
      endpoint: config.getOrThrow("S3_ENDPOINT", { infer: true }),
    });
    this.publicClient = new S3Client({
      ...shared,
      endpoint: config.getOrThrow("S3_PUBLIC_ENDPOINT", { infer: true }),
    });
  }

  bucketName(): string {
    return this.bucket;
  }

  async createUploadUrl(objectKey: string, mimeType: string): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: mimeType }),
      { expiresIn: uploadUrlLifetimeSeconds },
    );
  }

  async createDownloadUrl(objectKey: string, fileName: string, mimeType: string): Promise<string> {
    const disposition = `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`;
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ResponseContentDisposition: disposition,
        ResponseContentType: mimeType,
      }),
      { expiresIn: downloadUrlLifetimeSeconds },
    );
  }

  async statObject(
    objectKey: string,
  ): Promise<{ sizeBytes: number; mimeType: string | undefined }> {
    const result = await this.internalClient.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    return { sizeBytes: result.ContentLength ?? -1, mimeType: result.ContentType };
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.internalClient.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }
}
