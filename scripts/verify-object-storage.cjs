// One-time infrastructure probe. Run with admin bootstrap file only in an
// ephemeral container; never mount that file into the application container.
const {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { readFileSync } = require("node:fs");
const {
  randomUUID,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} = require("node:crypto");
const assert = require("node:assert/strict");
let stage = "create-bucket";
async function main() {
  const config = {
    region: process.env.S3_REGION,
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true,
  };
  const bootstrap = JSON.parse(readFileSync("/run/bootstrap.json", "utf8"));
  const admin = new S3Client({
    ...config,
    credentials: {
      accessKeyId: bootstrap.adminAccess,
      secretAccessKey: bootstrap.adminSecret,
    },
  });
  const runtime = new S3Client({
    ...config,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
  const Bucket = process.env.S3_BUCKET;
  try {
    await admin.send(new CreateBucketCommand({ Bucket }));
  } catch (e) {
    if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(e.name))
      throw e;
  }
  const Key = "private/infrastructure-probe/" + randomUUID();
  const key = Buffer.from(process.env.DOCUMENT_ENCRYPTION_KEY, "hex"),
    iv = randomBytes(12),
    plain = Buffer.from("jdatna-private-storage-verification");
  const cipher = createCipheriv("aes-256-gcm", key, iv),
    body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const encrypted = Buffer.concat([iv, cipher.getAuthTag(), body]);
  let uploaded = false;
  try {
    stage = "put-encrypted-object";
    await runtime.send(
      new PutObjectCommand({
        Bucket,
        Key,
        Body: encrypted,
        ContentType: "application/octet-stream",
        ServerSideEncryption: "AES256",
      }),
    );
    uploaded = true;
    stage = "get-encrypted-object";
    const response = await runtime.send(new GetObjectCommand({ Bucket, Key }));
    const stored = Buffer.from(await response.Body.transformToByteArray());
    assert.notDeepEqual(stored, plain);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      stored.subarray(0, 12),
    );
    decipher.setAuthTag(stored.subarray(12, 28));
    assert.deepEqual(
      Buffer.concat([decipher.update(stored.subarray(28)), decipher.final()]),
      plain,
    );
    const anonymous = await fetch(config.endpoint + "/" + Bucket + "/" + Key);
    assert.equal(anonymous.status, 403);
    console.log(
      "PASS: real TLS S3 write/read, encrypted bytes, authenticated decryption, anonymous access denied",
    );
  } finally {
    if (uploaded) await runtime.send(new DeleteObjectCommand({ Bucket, Key }));
    admin.destroy();
    runtime.destroy();
  }
  console.log("PASS: verification object removed");
}
main().catch((e) => {
  let message = e.message;
  const secrets = JSON.parse(readFileSync("/run/bootstrap.json", "utf8"));
  for (const value of [
    ...Object.values(secrets),
    process.env.S3_SECRET_ACCESS_KEY,
    process.env.DOCUMENT_ENCRYPTION_KEY,
  ])
    if (value) message = message.split(value).join("[redacted]");
  console.error("Object storage verification failed", {
    stage,
    name: e.name,
    message,
    code: e.Code || e.code,
    status: e.$metadata?.httpStatusCode,
  });
  process.exitCode = 1;
});
