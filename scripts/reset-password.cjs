/**
 * Firebase Admin SDK를 사용하여 사용자 비밀번호 변경
 * 
 * 사용법:
 * node scripts/reset-password.js <이메일> <새비밀번호>
 * 
 * 예시:
 * node scripts/reset-password.js choi@yigolab.com newPassword123!
 */

const admin = require('firebase-admin');
const path = require('path');

// Firebase Admin SDK 초기화
const serviceAccountPath = path.join(__dirname, '../firebase-admin-key.json');

try {
  const serviceAccount = require(serviceAccountPath);
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  console.log('✅ Firebase Admin SDK 초기화 완료');
} catch (error) {
  console.error('❌ Firebase Admin SDK 초기화 실패:', error.message);
  console.log('\n📝 firebase-admin-key.json 파일이 필요합니다.');
  console.log('Firebase Console에서 다운로드: 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성');
  process.exit(1);
}

// 명령줄 인자 확인
const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.error('❌ 사용법: node scripts/reset-password.js <이메일> <새비밀번호>');
  console.error('예시: node scripts/reset-password.js choi@yigolab.com newPassword123!');
  process.exit(1);
}

// 비밀번호 유효성 검사
if (newPassword.length < 6) {
  console.error('❌ 비밀번호는 최소 6자 이상이어야 합니다.');
  process.exit(1);
}

// 비밀번호 변경 실행
async function resetPassword() {
  try {
    console.log(`\n🔄 사용자 조회 중: ${email}`);
    
    // 이메일로 사용자 조회
    const user = await admin.auth().getUserByEmail(email);
    console.log('✅ 사용자 찾음:', {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      providers: user.providerData.map(p => p.providerId)
    });
    
    // 비밀번호 변경
    console.log('\n🔄 비밀번호 변경 중...');
    await admin.auth().updateUser(user.uid, {
      password: newPassword
    });
    
    console.log('✅ 비밀번호 변경 완료!');
    console.log(`\n📧 이메일: ${email}`);
    console.log(`🔑 새 비밀번호: ${newPassword}`);
    console.log('\n⚠️  보안을 위해 로그인 후 비밀번호를 다시 변경하세요.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 비밀번호 변경 실패:', error.message);
    
    if (error.code === 'auth/user-not-found') {
      console.error('해당 이메일로 등록된 사용자를 찾을 수 없습니다.');
    }
    
    process.exit(1);
  }
}

// 실행
resetPassword();
