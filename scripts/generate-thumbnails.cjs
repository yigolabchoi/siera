/**
 * 기존 갤러리 사진에 대해 썸네일(400px) + 중간(1200px) 크기를 일괄 생성하는 마이그레이션 스크립트
 *
 * 사용법: node scripts/generate-thumbnails.js
 *
 * - Firebase Admin SDK로 Storage에서 원본 다운로드
 * - sharp로 리사이즈
 * - 리사이즈된 파일을 Storage에 업로드
 * - Firestore photos 문서에 thumbnailUrl, mediumUrl 업데이트
 */

const admin = require('firebase-admin');
const sharp = require('sharp');
const path = require('path');

const serviceAccount = require('../firebase-admin-key.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'sierra-be167.firebasestorage.app',
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket();

const BATCH_SIZE = 8;
const SIZES = [
  { name: 'thumb', maxWidth: 400, quality: 75, subDir: 'thumb' },
  { name: 'medium', maxWidth: 1200, quality: 80, subDir: 'medium' },
];

async function getPublicUrl(file) {
  await file.makePublic().catch(() => {});
  const [signedUrls] = await file.getSignedUrl({
    action: 'read',
    expires: '2099-01-01',
  });
  return signedUrls;
}

async function processPhoto(photoDoc) {
  const data = photoDoc.data();
  const photoId = photoDoc.id;

  if (data.thumbnailUrl && data.mediumUrl) {
    return { id: photoId, status: 'skipped' };
  }

  const imageUrl = data.imageUrl;
  if (!imageUrl) {
    return { id: photoId, status: 'no-url' };
  }

  // Storage 경로 추출: gallery/{eventId}/{filename}
  const pathMatch = imageUrl.match(/\/o\/(.+?)\?/);
  if (!pathMatch) {
    return { id: photoId, status: 'bad-url' };
  }

  const storagePath = decodeURIComponent(pathMatch[1]);
  const dir = path.dirname(storagePath);
  const fileName = path.basename(storagePath);
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);

  try {
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      return { id: photoId, status: 'file-missing' };
    }

    const [buffer] = await file.download();

    const urls = {};

    for (const size of SIZES) {
      if (size.name === 'thumb' && data.thumbnailUrl) continue;
      if (size.name === 'medium' && data.mediumUrl) continue;

      const resized = await sharp(buffer)
        .resize(size.maxWidth, null, { withoutEnlargement: true })
        .jpeg({ quality: size.quality })
        .toBuffer();

      const destPath = `${dir}/${size.subDir}/${baseName}.jpg`;
      const destFile = bucket.file(destPath);

      await destFile.save(resized, {
        metadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000',
        },
      });

      const url = await getPublicUrl(destFile);
      urls[size.name] = url;
    }

    const updateData = {};
    if (urls.thumb) updateData.thumbnailUrl = urls.thumb;
    if (urls.medium) updateData.mediumUrl = urls.medium;

    if (Object.keys(updateData).length > 0) {
      await db.collection('photos').doc(photoId).update(updateData);
    }

    return { id: photoId, status: 'ok', sizes: Object.keys(urls) };
  } catch (err) {
    return { id: photoId, status: 'error', error: err.message };
  }
}

async function processBatch(docs, batchNum, totalBatches) {
  const results = await Promise.all(docs.map(processPhoto));
  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error');

  console.log(
    `  배치 ${batchNum}/${totalBatches}: 성공 ${ok}, 스킵 ${skipped}, 에러 ${errors.length}`
  );
  errors.forEach(e => console.log(`    ❌ ${e.id}: ${e.error}`));

  return results;
}

async function main() {
  console.log('🔍 Firestore에서 사진 목록 조회...');
  const snapshot = await db.collection('photos').get();
  const docs = snapshot.docs;
  console.log(`📷 총 ${docs.length}장 처리 대상`);

  const needsProcessing = docs.filter(d => {
    const data = d.data();
    return !(data.thumbnailUrl && data.mediumUrl);
  });
  console.log(`🔧 썸네일 미생성: ${needsProcessing.length}장\n`);

  if (needsProcessing.length === 0) {
    console.log('✅ 모든 사진에 썸네일이 이미 존재합니다.');
    return;
  }

  const totalBatches = Math.ceil(needsProcessing.length / BATCH_SIZE);
  let totalOk = 0;
  let totalErr = 0;

  for (let i = 0; i < needsProcessing.length; i += BATCH_SIZE) {
    const batch = needsProcessing.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const results = await processBatch(batch, batchNum, totalBatches);
    totalOk += results.filter(r => r.status === 'ok').length;
    totalErr += results.filter(r => r.status === 'error').length;

    const processed = Math.min(i + BATCH_SIZE, needsProcessing.length);
    const pct = ((processed / needsProcessing.length) * 100).toFixed(1);
    console.log(`  진행률: ${processed}/${needsProcessing.length} (${pct}%)\n`);
  }

  console.log('========================================');
  console.log(`✅ 완료: 성공 ${totalOk}, 에러 ${totalErr}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('💥 스크립트 실행 실패:', err);
  process.exit(1);
});
