import { Injectable, Logger } from '@nestjs/common';
import { Client } from 'minio';
import { URL } from 'node:url';
import { createHmac, createHash } from 'node:crypto';

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private client: Client;
  private bucket: string;
  private publicBaseUrl?: string; // Optional base URL for external clients (e.g., http://localhost:9000)
  private accessKey: string;
  private secretKey: string;
  private region: string;

  constructor() {
    const endPoint = process.env.MINIO_ENDPOINT ?? 'minio';
    const port = Number.parseInt(process.env.MINIO_PORT ?? '9000', 10);
    const useSSL = (process.env.MINIO_USE_SSL ?? 'false').toLowerCase() === 'true';
    const accessKey = process.env.MINIO_ACCESS_KEY ?? 'minioadmin';
    const secretKey = process.env.MINIO_SECRET_KEY ?? 'minioadmin';
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.bucket = process.env.MINIO_BUCKET_JOBS ?? 'jobs';
    this.publicBaseUrl = process.env.MINIO_PUBLIC_URL; // if set, used to produce presigned URLs for external usage
    this.region = process.env.MINIO_REGION || 'us-east-1';

    // Internal client talks to MinIO service inside the network
    this.client = new Client({ endPoint, port, useSSL, accessKey, secretKey });

    // Note: We avoid creating a second MinIO client pointed at a public host because
    // minio-js may attempt network calls (e.g., region lookup) to that host. Instead,
    // when a public URL is requested we locally compute an AWS SigV4 presign against
    // the public host while performing all bucket ops against the internal client.
  }

  async ensureBucket() {
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket, '');
      this.logger.log(`Created MinIO bucket: ${this.bucket}`);
    }
  }

  async presignPut(objectKey: string, expiresSeconds = 3600, opts?: { public?: boolean }) {
    await this.ensureBucket();
    if (opts?.public && this.publicBaseUrl) {
      return this.presignPublic('PUT', objectKey, expiresSeconds);
    }
    return this.client.presignedPutObject(this.bucket, objectKey, expiresSeconds);
  }

  async presignGet(objectKey: string, expiresSeconds = 3600, opts?: { public?: boolean }) {
    await this.ensureBucket();
    if (opts?.public && this.publicBaseUrl) {
      return this.presignPublic('GET', objectKey, expiresSeconds);
    }
    return this.client.presignedGetObject(this.bucket, objectKey, expiresSeconds);
  }

  async stat(objectKey: string) {
    await this.ensureBucket();
    return this.client.statObject(this.bucket, objectKey);
  }

  private presignPublic(method: 'GET' | 'PUT', objectKey: string, expiresSeconds: number) {
    if (!this.publicBaseUrl) throw new Error('MINIO_PUBLIC_URL not configured');
    const base = new URL(this.publicBaseUrl);
    const protocol = base.protocol; // 'http:' | 'https:'
    const hostName = base.hostname;
    const port = base.port ? parseInt(base.port, 10) : protocol === 'https:' ? 443 : 80;
    const isDefaultPort = (protocol === 'https:' && port === 443) || (protocol === 'http:' && port === 80);
    const hostHeader = isDefaultPort ? hostName : `${hostName}:${port}`;

    const now = new Date();
    const amzDate = this.formatAmzDate(now);
    const dateStamp = this.formatDate(now);
    const credential = `${this.accessKey}/${dateStamp}/${this.region}/s3/aws4_request`;

    const canonicalUri = `/${this.bucket}/${this.safePath(objectKey)}`;

    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresSeconds),
      'X-Amz-SignedHeaders': 'host',
    };

    const canonicalQuery = Object.keys(query)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
      .join('&');

    const canonicalHeaders = `host:${hostHeader}\n`;
    const signedHeaders = 'host';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const canonicalRequestHash = this.sha256Hex(canonicalRequest);
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, `${dateStamp}/${this.region}/s3/aws4_request`, canonicalRequestHash].join('\n');

    const signingKey = this.getSigningKey(this.secretKey, dateStamp, this.region, 's3');
    const signature = this.hmacHex(signingKey, stringToSign);

    const finalQuery = `${canonicalQuery}&X-Amz-Signature=${signature}`;
    const origin = `${protocol}//${hostHeader}`;
    return `${origin}${canonicalUri}?${finalQuery}`;
  }

  private safePath(p: string) {
    return p
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
  }

  private formatDate(d: Date) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  private formatAmzDate(d: Date) {
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const s = String(d.getUTCSeconds()).padStart(2, '0');
    return `${this.formatDate(d)}T${h}${m}${s}Z`;
  }

  private sha256Hex(data: string) {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  private hmac(key: Buffer | string, data: string) {
    return createHmac('sha256', key).update(data, 'utf8').digest();
  }

  private hmacHex(key: Buffer | string, data: string) {
    return createHmac('sha256', key).update(data, 'utf8').digest('hex');
  }

  private getSigningKey(secretKey: string, dateStamp: string, regionName: string, serviceName: string) {
    const kDate = this.hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = createHmac('sha256', kDate).update(regionName, 'utf8').digest();
    const kService = createHmac('sha256', kRegion).update(serviceName, 'utf8').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request', 'utf8').digest();
    return kSigning;
  }
}
