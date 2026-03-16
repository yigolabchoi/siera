const admin = require('firebase-admin');
const serviceAccount = require('../firebase-admin-key.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const TARGET_NAMES = ['정호철', '백종훈', '박내성'];

async function main() {
  console.log('=== 환불 처리된 회원 참석 리스트 복구 ===\n');

  // 1. 진행 중인 산행 확인
  const eventsSnap = await db.collection('events').get();
  const now = new Date();
  const activeEvents = eventsSnap.docs
    .filter(d => {
      const data = d.data();
      return data.isPublished && !data.isDraft && new Date(data.date) >= now;
    })
    .map(d => ({ id: d.id, ...d.data() }));

  console.log('활성 이벤트:');
  activeEvents.forEach(e => console.log(`  ${e.id}: ${e.title} (${e.date})`));

  // 2. 회원 정보 조회
  const membersSnap = await db.collection('members').get();
  
  for (const name of TARGET_NAMES) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`[ ${name} ]`);
    console.log('='.repeat(50));

    const memberDoc = membersSnap.docs.find(d => d.data().name === name);
    if (!memberDoc) {
      console.log(`  ❌ 회원을 찾을 수 없습니다.`);
      continue;
    }
    const memberData = memberDoc.data();
    const userId = memberDoc.id;
    console.log(`  회원 ID: ${userId}`);
    console.log(`  이메일: ${memberData.email}, 전화: ${memberData.phoneNumber}`);

    // 3. participation 확인
    console.log('\n  --- participation ---');
    const partSnap = await db.collection('participations').where('userId', '==', userId).get();
    if (partSnap.empty) {
      console.log('  ❌ participation 없음');
    } else {
      partSnap.docs.forEach(d => {
        const data = d.data();
        console.log(`  ${d.id}: event=${data.eventId}, status=${data.status}, cancelled=${data.cancelledAt || 'N/A'}`);
      });
    }

    // 4. payment 확인
    console.log('\n  --- payment ---');
    const paySnap = await db.collection('payments').where('userId', '==', userId).get();
    if (paySnap.empty) {
      console.log('  ❌ payment 없음');
    } else {
      paySnap.docs.forEach(d => {
        const data = d.data();
        console.log(`  ${d.id}: event=${data.eventId}, paymentStatus=${data.paymentStatus}, refundStatus=${data.refundStatus || 'N/A'}`);
      });
    }

    // 5. 활성 이벤트에 대한 participation 복구
    for (const event of activeEvents) {
      const eventParts = partSnap.docs.filter(d => d.data().eventId === event.id);
      const eventPays = paySnap.docs.filter(d => d.data().eventId === event.id);

      // Case A: participation이 cancelled 상태 → confirmed로 복구
      const cancelledPart = eventParts.find(d => d.data().status === 'cancelled');
      if (cancelledPart) {
        console.log(`\n  🔧 [${event.title}] participation 복구: cancelled → confirmed`);
        await db.collection('participations').doc(cancelledPart.id).update({
          status: 'confirmed',
          cancelledAt: admin.firestore.FieldValue.delete(),
          cancellationReason: admin.firestore.FieldValue.delete(),
          updatedAt: new Date().toISOString(),
        });
        console.log('  ✅ participation 복구 완료');
      }

      // Case B: participation 자체가 없음 → 새로 생성
      const activePart = eventParts.find(d => d.data().status !== 'cancelled');
      if (!cancelledPart && !activePart) {
        console.log(`\n  🔧 [${event.title}] participation 생성`);
        const partId = `participation_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const nowISO = new Date().toISOString();
        await db.collection('participations').doc(partId).set({
          id: partId,
          eventId: event.id,
          userId: userId,
          userName: memberData.name,
          userEmail: memberData.email || '',
          isGuest: false,
          status: 'confirmed',
          registeredAt: nowISO,
          createdAt: nowISO,
          updatedAt: nowISO,
        });
        console.log(`  ✅ participation 생성 완료: ${partId}`);
      }

      // Case C: payment가 refunded 상태 → confirmed로 복구
      const refundedPay = eventPays.find(d => {
        const data = d.data();
        return data.paymentStatus === 'refunded' || data.refundStatus === 'completed';
      });
      if (refundedPay) {
        console.log(`\n  🔧 [${event.title}] payment 복구: refunded → confirmed`);
        await db.collection('payments').doc(refundedPay.id).update({
          paymentStatus: 'confirmed',
          paymentDate: new Date().toISOString(),
          refundStatus: admin.firestore.FieldValue.delete(),
          refundDate: admin.firestore.FieldValue.delete(),
          refundAmount: admin.firestore.FieldValue.delete(),
          refundReason: admin.firestore.FieldValue.delete(),
          updatedAt: new Date().toISOString(),
        });
        console.log('  ✅ payment 복구 완료');
      }

      // Case D: payment가 없음 → 새로 생성
      if (eventPays.length === 0) {
        const partForPayment = cancelledPart || activePart;
        const partId = partForPayment ? partForPayment.id : `participation_${Date.now()}`;
        const cost = event.cost ? parseInt(String(event.cost).replace(/[^0-9]/g, '')) : 50000;

        console.log(`\n  🔧 [${event.title}] payment 생성`);
        const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        await db.collection('payments').doc(paymentId).set({
          id: paymentId,
          participationId: partId,
          eventId: event.id,
          userId: userId,
          userName: memberData.name,
          email: memberData.email || '',
          company: memberData.company || '',
          position: memberData.position || '',
          phoneNumber: memberData.phoneNumber || '',
          applicationDate: new Date().toISOString(),
          paymentStatus: 'confirmed',
          paymentDate: new Date().toISOString(),
          amount: cost,
          memo: '환불 후 참석 리스트 복구',
          isGuest: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        console.log(`  ✅ payment 생성 완료: ${paymentId}`);
      }
    }
  }

  console.log('\n\n========================================');
  console.log('✅ 전체 복구 완료');
  console.log('========================================');
}

main().catch(err => { console.error(err); process.exit(1); });
