/**
 * hikingCount2026 → hikingCountByYear["2026"] 마이그레이션 스크립트
 *
 * hikingCount2026 필드가 있는 모든 members 문서에 대해
 * hikingCountByYear: { "2026": N } 필드를 추가한다.
 * (hikingCount2026 필드는 하위호환을 위해 그대로 유지)
 */

const admin = require('firebase-admin');

const serviceAccount = require('../firebase-admin-key.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function main() {
  console.log('=== hikingCountByYear 마이그레이션 시작 ===\n');

  const snap = await db.collection('members').get();
  const toMigrate = snap.docs.filter(d => {
    const data = d.data();
    return data.hikingCount2026 !== undefined;
  });

  console.log('마이그레이션 대상:', toMigrate.length, '명');
  if (toMigrate.length === 0) {
    console.log('이미 마이그레이션 완료 또는 대상 없음.');
    return;
  }

  const CHUNK = 400;
  let updated = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < toMigrate.length; i += CHUNK) {
    const chunk = toMigrate.slice(i, i + CHUNK);
    const batch = db.batch();
    chunk.forEach(function(d) {
      const data = d.data();
      batch.update(d.ref, {
        'hikingCountByYear.2026': data.hikingCount2026,
        updatedAt: now,
      });
      updated++;
    });
    await batch.commit();
    console.log('  처리:', updated, '명');
  }

  console.log('\n=== 마이그레이션 완료 ===');
  console.log('  업데이트:', updated, '명');
}

main().catch(function(err) {
  console.error('오류 발생:', err);
  process.exit(1);
});
