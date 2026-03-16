const admin = require('firebase-admin');
const serviceAccount = require('../firebase-admin-key.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const MISSED_MERGES = [
  { preId: 'pre_01053830806', authId: 'OM0N278AWEaihMCZRrdIXVIgvg73', name: '김정겸' },
  { preId: 'pre_01071943533', authId: 'hUqDTUdLP3bSzkOV52MyDZfLIzl1', name: '박보경' },
];

const RELATED_COLLECTIONS = [
  { name: 'executives', fields: ['memberId'] },
  { name: 'participations', fields: ['userId'] },
  { name: 'attendances', fields: ['memberId'] },
  { name: 'payments', fields: ['userId', 'memberId'] },
  { name: 'hikingHistory', fields: ['memberId', 'userId'] },
];

async function migrateRelatedData(oldId, newId) {
  let totalMigrated = 0;
  for (const col of RELATED_COLLECTIONS) {
    for (const field of col.fields) {
      const snap = await db.collection(col.name).where(field, '==', oldId).get();
      for (const doc of snap.docs) {
        await doc.ref.update({ [field]: newId });
        totalMigrated++;
      }
      if (snap.size > 0) {
        console.log(`  ✅ ${col.name}.${field}: ${snap.size}건 → ${newId}`);
      }
    }
  }
  return totalMigrated;
}

async function main() {
  for (const { preId, authId, name } of MISSED_MERGES) {
    console.log(`\n🔗 병합 처리: ${name} (${preId} → ${authId})`);

    const preDoc = await db.collection('members').doc(preId).get();
    if (!preDoc.exists) {
      console.log(`  ⚠️ pre_ 문서가 이미 삭제됨`);
      continue;
    }

    const preData = preDoc.data();
    const authDoc = await db.collection('members').doc(authId).get();
    if (!authDoc.exists) {
      console.log(`  ⚠️ Auth 문서가 없음`);
      continue;
    }

    const authData = authDoc.data();

    // pre_ 문서의 company, position 등 기존 정보를 Auth 문서에 보존
    const preserveFields = {};
    if (preData.company && !authData.company) preserveFields.company = preData.company;
    if (preData.position && !authData.position) preserveFields.position = preData.position;
    if (preData.bio && !authData.bio) preserveFields.bio = preData.bio;
    if (preData.joinDate && !authData.joinDate) preserveFields.joinDate = preData.joinDate;

    if (Object.keys(preserveFields).length > 0) {
      await db.collection('members').doc(authId).update(preserveFields);
      console.log(`  📋 기존 정보 보존:`, Object.keys(preserveFields).join(', '));
    }

    // 관련 데이터 마이그레이션
    const migrated = await migrateRelatedData(preId, authId);
    console.log(`  📦 관련 데이터 ${migrated}건 마이그레이션`);

    // pre_ 문서 삭제
    await db.collection('members').doc(preId).delete();
    console.log(`  🗑️ pre_ 문서 삭제 완료`);
  }

  // 최종 카운트 확인
  const snapshot = await db.collection('members').get();
  const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  const active = all.filter(m => !m.mergedInto && m.isActive !== false && m.role !== 'guest');
  console.log(`\n========================================`);
  console.log(`✅ 최종 활성 회원 수: ${active.length}`);
  console.log(`========================================`);
}

main().catch(err => {
  console.error('오류:', err);
  process.exit(1);
});
