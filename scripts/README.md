# 비밀번호 강제 변경 스크립트

Firebase Admin SDK를 사용하여 관리자가 사용자의 비밀번호를 강제로 변경할 수 있는 스크립트입니다.

## 사전 준비

### 1. Firebase Admin 키 다운로드

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 프로젝트 선택 (`sierra-be167`)
3. 프로젝트 설정(⚙️) → **서비스 계정** 탭
4. **새 비공개 키 생성** 버튼 클릭
5. 다운로드된 JSON 파일을 `hiking-club/firebase-admin-key.json`으로 저장

⚠️ **주의**: 이 파일은 절대 Git에 커밋하지 마세요! (.gitignore에 추가됨)

## 사용 방법

### 비밀번호 변경

```bash
cd hiking-club
node scripts/reset-password.js <이메일> <새비밀번호>
```

### 예시

```bash
# choi@yigolab.com 계정의 비밀번호를 "NewPass123!"로 변경
node scripts/reset-password.js choi@yigolab.com NewPass123!
```

## 출력 예시

```
✅ Firebase Admin SDK 초기화 완료

🔄 사용자 조회 중: choi@yigolab.com
✅ 사용자 찾음: {
  uid: 'abc123...',
  email: 'choi@yigolab.com',
  displayName: '최효준',
  providers: [ 'password', 'google.com' ]
}

🔄 비밀번호 변경 중...
✅ 비밀번호 변경 완료!

📧 이메일: choi@yigolab.com
🔑 새 비밀번호: NewPass123!

⚠️  보안을 위해 로그인 후 비밀번호를 다시 변경하세요.
```

## 주의사항

1. **비밀번호 최소 길이**: 6자 이상
2. **보안**: Admin 키는 절대 외부에 노출하지 마세요
3. **사후 조치**: 비밀번호 변경 후 사용자에게 새 비밀번호를 안전하게 전달하고, 로그인 후 즉시 변경하도록 안내하세요

## 문제 해결

### firebase-admin-key.json 파일이 없을 때
```
❌ Firebase Admin SDK 초기화 실패: Cannot find module './firebase-admin-key.json'

📝 firebase-admin-key.json 파일이 필요합니다.
Firebase Console에서 다운로드: 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성
```

→ Firebase Console에서 서비스 계정 키를 다운로드하여 `hiking-club/` 폴더에 `firebase-admin-key.json` 이름으로 저장하세요.

### 사용자를 찾을 수 없을 때
```
❌ 비밀번호 변경 실패: There is no user record corresponding to the provided identifier
해당 이메일로 등록된 사용자를 찾을 수 없습니다.
```

→ 이메일 주소를 정확히 입력했는지 확인하세요.
