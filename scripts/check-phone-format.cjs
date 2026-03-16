const admin = require('firebase-admin');
const serviceAccount = require('../firebase-admin-key.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function main() {
  // pre_ 문서의 전화번호 형식과 preRegisteredMembers의 전화번호 형식 비교
  const preRegSnap = await db.collection('preRegisteredMembers').get();
  const membersSnap = await db.collection('members').get();

  // 김정겸, 박보경 관련 데이터 확인
  const targets = ['김정겸', '박보경'];

  console.log('=== preRegisteredMembers에서 검색 ===');
  preRegSnap.docs.forEach(d => {
    const data = d.data();
    if (targets.includes(data.name)) {
      console.log(`  ${data.name}: phone="${data.phoneNumber}", matched=${data.matched}, id=${d.id}`);
    }
  });

  console.log('\n=== members에서 검색 ===');
  membersSnap.docs.forEach(d => {
    const data = d.data();
    if (targets.includes(data.name)) {
      console.log(`  ${data.name}: id=${d.id}, phone="${data.phoneNumber}", email="${data.email || 'N/A'}", provider=${data.authProvider || 'N/A'}, mergedInto=${data.mergedInto || 'N/A'}`);
    }
  });

  // 신규 등록 15명의 Auth UID 문서에서 전화번호 형식 확인
  console.log('\n=== Auth UID 문서 (등록완료) 전화번호 형식 ===');
  const authDocs = membersSnap.docs.filter(d => !d.id.startsWith('pre_') && !d.data().mergedInto);
  authDocs.forEach(d => {
    const data = d.data();
    if (data.phoneNumber && data.authProvider) {
      const phone = data.phoneNumber;
      const hasHyphen = phone.includes('-');
      if (hasHyphen) {
        console.log(`  ⚠️ 하이픈 포함: ${data.name} phone="${phone}" id=${d.id}`);
      }
    }
  });
}

main().catch(err => { console.error(err); process.exit(1); });
