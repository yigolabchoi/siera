const admin = require('firebase-admin');
const serviceAccount = require('../firebase-admin-key.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

function pickBest(payments) {
  return payments.sort((a, b) => {
    const statusPriority = { confirmed: 0, completed: 1, pending: 2, refunded: 3, failed: 4, cancelled: 5 };
    const aP = statusPriority[a.data.paymentStatus] ?? 9;
    const bP = statusPriority[b.data.paymentStatus] ?? 9;
    if (aP !== bP) return aP - bP;

    const aLinked = a.data.participationId ? 0 : 1;
    const bLinked = b.data.participationId ? 0 : 1;
    if (aLinked !== bLinked) return aLinked - bLinked;

    const aTime = a.data.createdAt?.toDate?.() || new Date(a.data.createdAt || 0);
    const bTime = b.data.createdAt?.toDate?.() || new Date(b.data.createdAt || 0);
    return bTime.getTime() - aTime.getTime();
  })[0];
}

async function main() {
  console.log('=== Payment 중복 레코드 정리 스크립트 ===\n');

  const snap = await db.collection('payments').get();
  console.log(`전체 payment 문서 수: ${snap.size}`);

  const grouped = {};
  snap.docs.forEach(doc => {
    const d = doc.data();
    const key = `${d.userId}__${d.eventId}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ id: doc.id, data: d });
  });

  const totalGroups = Object.keys(grouped).length;
  let duplicateGroups = 0;
  let toDeleteCount = 0;
  const toDelete = [];

  for (const [key, items] of Object.entries(grouped)) {
    if (items.length <= 1) continue;
    duplicateGroups++;

    const best = pickBest(items);
    const rest = items.filter(i => i.id !== best.id);
    toDeleteCount += rest.length;

    console.log(`\n[${key}] 총 ${items.length}건 → 유지: ${best.id} (${best.data.paymentStatus}), 삭제: ${rest.length}건`);
    rest.forEach(r => toDelete.push(r.id));
  }

  console.log(`\n--- 요약 ---`);
  console.log(`고유 userId+eventId 조합: ${totalGroups}`);
  console.log(`중복이 있는 그룹: ${duplicateGroups}`);
  console.log(`삭제 대상: ${toDeleteCount}건`);
  console.log(`삭제 후 남는 문서: ${snap.size - toDeleteCount}건\n`);

  if (toDelete.length === 0) {
    console.log('✅ 중복 없음. 종료.');
    return;
  }

  console.log('삭제를 시작합니다...\n');

  const BATCH_SIZE = 500;
  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toDelete.slice(i, i + BATCH_SIZE);
    chunk.forEach(id => batch.delete(db.collection('payments').doc(id)));
    await batch.commit();
    console.log(`  삭제 완료: ${Math.min(i + BATCH_SIZE, toDelete.length)} / ${toDelete.length}`);
  }

  console.log(`\n✅ 총 ${toDelete.length}건 중복 payment 삭제 완료.`);

  const afterSnap = await db.collection('payments').get();
  console.log(`정리 후 전체 payment 문서 수: ${afterSnap.size}`);
}

main().catch(err => { console.error('오류:', err); process.exit(1); });
