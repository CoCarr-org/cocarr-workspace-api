const {
  S3Client, PutObjectCommand, GetObjectCommand,
} = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const { CustomError } = require('../middlewares/error');

// Object storage for workspace attachments — today, candidate résumés.
//
// SAME BUCKET as the rest of the platform, deliberately. A second bucket would
// mean a second set of credentials, a second backup story and a second thing to
// migrate; the folder prefix is what separates concerns, exactly as it does for
// kyc/, licence/ and vehicle/.
//
// RÉSUMÉS ARE NOT PUBLIC, AND THIS IS THE POINT OF THE MIGRATION.
//
// The Apps Script backend this replaces did `file.setSharing(ANYONE_WITH_LINK)`
// on every uploaded CV, so a candidate's full name, address, phone number and
// employment history were readable by anyone who ever saw the URL — including
// anywhere the link was forwarded or logged. Here the object is private and
// only reachable through an authenticated workspace route, and the platform's
// public image proxy explicitly refuses the `resume/` prefix (see the gateway's
// core route). Both halves are required: dropping either one puts the CVs back
// on the open internet.
const RESUME_FOLDER = 'resume';

const pick = (...names) => names.map((n) => process.env[n]).find(Boolean);

const bucketName = () => {
  const bucket = pick(
    'AWS_S3_BUCKET_NAME', 'S3_BUCKET', 'BUCKET_NAME', 'AWS_BUCKET', 'STORAGE_BUCKET',
  );
  if (!bucket) {
    throw new CustomError(
      'Object storage is not configured on this service (AWS_S3_BUCKET_NAME).',
      503, 'STORAGE_UNAVAILABLE',
    );
  }
  return bucket;
};

const client = () => {
  const accessKeyId = pick('AWS_ACCESS_KEY_ID', 'S3_ACCESS_KEY_ID');
  const secretAccessKey = pick('AWS_SECRET_ACCESS_KEY', 'S3_SECRET_ACCESS_KEY');
  if (!accessKeyId || !secretAccessKey) {
    throw new CustomError(
      'Object storage credentials are not configured on this service.',
      503, 'STORAGE_UNAVAILABLE',
    );
  }
  return new S3Client({
    region: pick('AWS_REGION', 'AWS_DEFAULT_REGION', 'S3_REGION') || 'auto',
    endpoint: pick('S3_ENDPOINT', 'AWS_ENDPOINT_URL_S3', 'AWS_ENDPOINT_URL') || 'https://t3.storageapi.dev',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
};

// What a résumé may be. Anything else is refused rather than stored and
// discovered later by whoever tries to open it.
const ALLOWED = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};
const MAX_BYTES = 8 * 1024 * 1024;

// The careers site posts the file as a data URI, because the form is a single
// public POST with no prior authenticated round-trip to obtain an upload URL.
function decodeDataUri(dataUri) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(dataUri || '').trim());
  if (!match) {
    throw new CustomError('resume must be a base64 data URI', 400, 'VALIDATION_ERROR');
  }
  const [, contentType, b64] = match;
  if (!ALLOWED[contentType]) {
    throw new CustomError(
      `Résumé must be a PDF or Word document (got ${contentType}).`, 400, 'VALIDATION_ERROR',
    );
  }
  const buffer = Buffer.from(b64, 'base64');
  if (!buffer.length) throw new CustomError('Résumé file is empty.', 400, 'VALIDATION_ERROR');
  if (buffer.length > MAX_BYTES) {
    throw new CustomError(
      `Résumé is larger than ${MAX_BYTES / 1024 / 1024}MB.`, 413, 'FILE_TOO_LARGE',
    );
  }
  return { buffer, contentType, ext: ALLOWED[contentType] };
}

// Returns the KEY, never a URL. A URL implies a place it can be fetched from
// without asking, which is exactly what these must not have.
async function putResume(dataUri) {
  const { buffer, contentType } = decodeDataUri(dataUri);
  const key = `${RESUME_FOLDER}/${uuidv4()}`;
  await client().send(new PutObjectCommand({
    Bucket: bucketName(),
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return { key, contentType, size: buffer.length };
}

async function getResume(key) {
  // Refuse to fetch anything outside the résumé folder, so this route can never
  // be turned into a general reader for the platform's whole bucket by passing
  // it someone's KYC key.
  if (!String(key || '').startsWith(`${RESUME_FOLDER}/`)) {
    throw new CustomError('Not a résumé object', 400, 'VALIDATION_ERROR');
  }
  return client().send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
}

module.exports = {
  putResume, getResume, RESUME_FOLDER, ALLOWED, MAX_BYTES,
};
