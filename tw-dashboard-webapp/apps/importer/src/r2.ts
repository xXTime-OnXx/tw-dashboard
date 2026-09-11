import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
export class Archive {
  client: S3Client;
  bucket: string;
  constructor(env: NodeJS.ProcessEnv = process.env) {
    for (const k of ['R2_ENDPOINT_URL', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'])
      if (!env[k]) throw Error(`${k} required`);
    this.bucket = env.R2_BUCKET!;
    this.client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT_URL,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  async get(key: string) {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  async json(key: string) {
    return JSON.parse((await this.get(key)).toString());
  }
  async *list(prefix: string) {
    let ContinuationToken: string | undefined;
    do {
      const r = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken }),
      );
      for (const o of r.Contents ?? []) if (o.Key) yield { key: o.Key, size: o.Size ?? 0 };
      ContinuationToken = r.NextContinuationToken;
    } while (ContinuationToken);
  }
}
