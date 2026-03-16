const admin = require('firebase-admin');
const serviceAccount = require('../firebase-admin-key.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function main() {
  const snapshot = await db.collection('members').get();
  const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`\n=== 전체 members 문서 수: ${all.length} ===\n`);

  // 분류
  const merged = all.filter(m => m.mergedInto);
  const guests = all.filter(m => !m.mergedInto && m.role === 'guest');
  const inactive = all.filter(m => !m.mergedInto && m.isActive === false && m.role !== 'guest');
  const active = all.filter(m => !m.mergedInto && m.isActive !== false && m.role !== 'guest');

  console.log(`병합된 계정 (mergedInto): ${merged.length}`);
  merged.forEach(m => console.log(`  - ${m.id} → ${m.mergedInto} (${m.name})`));

  console.log(`\n게스트: ${guests.length}`);
  console.log(`비활성: ${inactive.length}`);
  inactive.forEach(m => console.log(`  - ${m.id} (${m.name}, role=${m.role}, isActive=${m.isActive})`));

  console.log(`\n활성 회원 (전체회원 카운트 대상): ${active.length}`);

  // 전화번호 중복 체크 (활성 회원만)
  const phoneMap = {};
  active.forEach(m => {
    const phone = (m.phoneNumber || '').replace(/[-\s]/g, '');
    if (phone && phone.length >= 10) {
      if (!phoneMap[phone]) phoneMap[phone] = [];
      phoneMap[phone].push(m);
    }
  });

  const phoneDuplicates = Object.entries(phoneMap).filter(([, arr]) => arr.length > 1);
  if (phoneDuplicates.length > 0) {
    console.log(`\n⚠️ 전화번호 중복 (활성 회원 중):`);
    phoneDuplicates.forEach(([phone, members]) => {
      console.log(`  📱 ${phone}:`);
      members.forEach(m => console.log(`    - ${m.id} (${m.name}, role=${m.role}, provider=${m.authProvider || 'N/A'}, isActive=${m.isActive})`));
    });
  } else {
    console.log(`\n✅ 전화번호 중복 없음`);
  }

  // 이메일 중복 체크 (활성 회원만)
  const emailMap = {};
  active.forEach(m => {
    const email = (m.email || '').toLowerCase().trim();
    if (email) {
      if (!emailMap[email]) emailMap[email] = [];
      emailMap[email].push(m);
    }
  });

  const emailDuplicates = Object.entries(emailMap).filter(([, arr]) => arr.length > 1);
  if (emailDuplicates.length > 0) {
    console.log(`\n⚠️ 이메일 중복 (활성 회원 중):`);
    emailDuplicates.forEach(([email, members]) => {
      console.log(`  📧 ${email}:`);
      members.forEach(m => console.log(`    - ${m.id} (${m.name}, role=${m.role}, provider=${m.authProvider || 'N/A'}, isActive=${m.isActive})`));
    });
  } else {
    console.log(`\n✅ 이메일 중복 없음`);
  }

  // 이름 중복 체크 (활성 회원만)
  const nameMap = {};
  active.forEach(m => {
    const name = (m.name || '').trim();
    if (name) {
      if (!nameMap[name]) nameMap[name] = [];
      nameMap[name].push(m);
    }
  });

  const nameDuplicates = Object.entries(nameMap).filter(([, arr]) => arr.length > 1);
  if (nameDuplicates.length > 0) {
    console.log(`\n⚠️ 이름 중복 (활성 회원 중 - 동명이인 가능):`);
    nameDuplicates.forEach(([name, members]) => {
      console.log(`  👤 ${name}:`);
      members.forEach(m => console.log(`    - ${m.id} (phone=${m.phoneNumber || 'N/A'}, email=${m.email || 'N/A'}, provider=${m.authProvider || 'N/A'})`));
    });
  }

  // pre_ 접두사 문서 확인 (활성 회원 중)
  const preMembers = active.filter(m => m.id.startsWith('pre_'));
  const authMembers = active.filter(m => !m.id.startsWith('pre_'));
  console.log(`\npre_ 접두사 문서 (미등록): ${preMembers.length}`);
  console.log(`Auth UID 문서 (등록완료): ${authMembers.length}`);

  // pre_ 문서 중 동일 전화번호로 Auth UID 문서도 있는 경우 (병합 누락)
  console.log(`\n⚠️ 병합 누락 의심 (pre_ + Auth UID 동시 존재):`);
  let missedMergeCount = 0;
  preMembers.forEach(pre => {
    const phone = (pre.phoneNumber || '').replace(/[-\s]/g, '');
    if (phone) {
      const match = authMembers.find(a => {
        const aPhone = (a.phoneNumber || '').replace(/[-\s]/g, '');
        return aPhone === phone;
      });
      if (match) {
        missedMergeCount++;
        console.log(`  📱 ${phone}: pre_=${pre.id} (${pre.name}) ↔ auth=${match.id} (${match.name})`);
      }
    }
  });
  if (missedMergeCount === 0) {
    console.log(`  없음`);
  }
}

main().catch(err => {
  console.error('스크립트 오류:', err);
  process.exit(1);
});
