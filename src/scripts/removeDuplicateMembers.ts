/**
 * 중복 회원 삭제 스크립트 (firebase-admin 사용)
 * 
 * 동일한 이메일을 가진 회원이 여러 명 존재하는 경우,
 * 가장 먼저 가입한 1명만 남기고 나머지를 삭제합니다.
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Firebase Admin 초기화
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serviceAccountPath = resolve(__dirname, '../../scripts/serviceAccountKey.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

interface MemberDoc {
  id: string;
  name: string;
  email: string;
  joinDate?: string;
  createdAt?: string;
  [key: string]: any;
}

async function removeDuplicateMembers() {
  console.log('🔍 중복 회원 검색 시작...\n');

  try {
    // 1. 모든 회원 가져오기
    const snapshot = await db.collection('members').get();
    const members: MemberDoc[] = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as MemberDoc));

    console.log(`✅ 전체 회원 ${members.length}명 로드 완료\n`);

    // 2. 이메일 기준으로 중복 찾기
    const emailMap = new Map<string, MemberDoc[]>();
    members.forEach(member => {
      const email = member.email?.toLowerCase();
      if (!email) return;

      if (!emailMap.has(email)) {
        emailMap.set(email, []);
      }
      emailMap.get(email)!.push(member);
    });

    // 3. 중복된 이메일 필터링
    const duplicates: { email: string; members: MemberDoc[] }[] = [];
    emailMap.forEach((memberList, email) => {
      if (memberList.length > 1) {
        duplicates.push({ email, members: memberList });
      }
    });

    if (duplicates.length === 0) {
      console.log('✅ 중복 회원이 없습니다. 정상입니다.\n');
      return;
    }

    console.log(`⚠️  중복 이메일 ${duplicates.length}건 발견:\n`);

    let totalDeleted = 0;

    for (const dup of duplicates) {
      console.log(`📧 이메일: ${dup.email}`);

      // 가입일 기준 오름차순 정렬 (가장 먼저 가입한 사람이 먼저)
      const sorted = dup.members.sort((a, b) => {
        const dateA = new Date(a.joinDate || a.createdAt || '9999-12-31').getTime();
        const dateB = new Date(b.joinDate || b.createdAt || '9999-12-31').getTime();
        return dateA - dateB;
      });

      const keep = sorted[0];
      const toDelete = sorted.slice(1);

      console.log(`   ✅ 유지: ${keep.name} (ID: ${keep.id}, 가입: ${keep.joinDate || keep.createdAt || '알 수 없음'})`);

      for (const member of toDelete) {
        console.log(`   🗑️  삭제: ${member.name} (ID: ${member.id}, 가입: ${member.joinDate || member.createdAt || '알 수 없음'})`);

        await db.collection('members').doc(member.id).delete();
        console.log(`      → 삭제 완료`);
        totalDeleted++;
      }
      console.log('');
    }

    console.log(`\n🎉 완료! 총 ${totalDeleted}개의 중복 회원이 삭제되었습니다.`);
    console.log(`   남은 회원 수: ${members.length - totalDeleted}명\n`);

  } catch (error) {
    console.error('❌ 스크립트 실행 중 오류 발생:', error);
  }

  process.exit(0);
}

removeDuplicateMembers();
