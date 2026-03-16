const admin = require('firebase-admin');
const serviceAccount = require('../firebase-admin-key.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function main() {
  // 1. 최효준 회원 정보 확인
  console.log('=== 최효준 회원 정보 확인 ===\n');

  const membersSnap = await db.collection('members').get();
  const member = membersSnap.docs.find(d => d.data().name === '최효준');
  if (member) {
    const data = member.data();
    console.log(`회원 ID: ${member.id}`);
    console.log(`이름: ${data.name}, 이메일: ${data.email}, 전화: ${data.phoneNumber}`);
  } else {
    console.log('❌ 최효준 회원을 찾을 수 없습니다.');
    return;
  }

  const userId = member.id;

  // 2. participation 확인
  console.log('\n=== participation 확인 ===');
  const partSnap = await db.collection('participations').where('userId', '==', userId).get();
  partSnap.docs.forEach(d => {
    const data = d.data();
    console.log(`  ${d.id}: event=${data.eventId}, status=${data.status}, cancelled=${data.cancelledAt || 'N/A'}`);
  });

  // 3. payment 확인
  console.log('\n=== payment 확인 ===');
  const paySnap = await db.collection('payments').where('userId', '==', userId).get();
  if (paySnap.empty) {
    console.log('  ❌ payment 문서 없음 (삭제됨)');
  } else {
    paySnap.docs.forEach(d => {
      const data = d.data();
      console.log(`  ${d.id}: event=${data.eventId}, status=${data.paymentStatus}, refund=${data.refundStatus || 'N/A'}`);
    });
  }

  // 4. 현재 진행 중인 산행 확인
  console.log('\n=== 진행 중인 산행 확인 ===');
  const eventsSnap = await db.collection('events').get();
  const now = new Date();
  const activeEvents = eventsSnap.docs
    .filter(d => {
      const data = d.data();
      return data.isPublished && !data.isDraft && new Date(data.date) >= now;
    })
    .map(d => ({ id: d.id, ...d.data() }));

  activeEvents.forEach(e => {
    console.log(`  ${e.id}: ${e.title} (${e.date})`);
  });

  // 5. 취소된 participation의 eventId와 매칭하여 복구 필요성 확인
  const cancelledParts = partSnap.docs.filter(d => d.data().status === 'cancelled');
  if (cancelledParts.length > 0) {
    console.log('\n=== 복구 대상 ===');
    for (const cp of cancelledParts) {
      const cpData = cp.data();
      const event = activeEvents.find(e => e.id === cpData.eventId);
      if (event) {
        console.log(`  ✅ 복구 필요: participation=${cp.id}, event=${event.title}`);
        console.log(`     취소사유: ${cpData.cancellationReason || 'N/A'}`);

        // participation 복구 (confirmed 상태로)
        await db.collection('participations').doc(cp.id).update({
          status: 'confirmed',
          cancelledAt: admin.firestore.FieldValue.delete(),
          cancellationReason: admin.firestore.FieldValue.delete(),
          updatedAt: new Date().toISOString(),
        });
        console.log(`     ✅ participation 복구 완료 (confirmed)`);

        // payment 복구 (재생성)
        const memberData = member.data();
        const paymentId = `payment_${Date.now()}_restored`;
        const cost = event.cost ? parseInt(String(event.cost).replace(/[^0-9]/g, '')) : 50000;

        await db.collection('payments').doc(paymentId).set({
          id: paymentId,
          participationId: cp.id,
          eventId: cpData.eventId,
          userId: userId,
          userName: memberData.name,
          email: memberData.email || '',
          company: memberData.company || '',
          position: memberData.position || '',
          phoneNumber: memberData.phoneNumber || '',
          applicationDate: cpData.registeredAt || cpData.createdAt || new Date().toISOString(),
          paymentStatus: 'confirmed',
          paymentDate: new Date().toISOString(),
          amount: cost,
          memo: '환불 취소 → 입금확인 복구',
          isGuest: cpData.isGuest || false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        console.log(`     ✅ payment 복구 완료 (confirmed, ${cost}원)`);
      }
    }
  }

  console.log('\n========================================');
  console.log('✅ 복구 완료');
  console.log('========================================');
}

main().catch(err => { console.error(err); process.exit(1); });
