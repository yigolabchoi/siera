# ⚡ 빠른 수정 가이드

> Cursor에서 복사-붙여넣기로 빠르게 수정할 수 있는 코드 스니펫 모음

---

## 🔴 Critical Fix #1: 하드코딩 이메일 제거

### 파일: `src/contexts/AuthContextEnhanced.tsx`

**찾기** (84-92줄 근처):
```typescript
// 🔥 개발용: 특정 이메일을 관리자로 설정
const isDevAdmin = firebaseUser.email === 'choi@yigolab.com';

const newUser: User = {
  id: firebaseUser.uid,
  name: firebaseUser.displayName || (isDevAdmin ? '최효준 (개발자)' : ''),
  email: firebaseUser.email || '',
  role: isDevAdmin ? 'chairman' : 'member',
  isApproved: isDevAdmin ? true : false,
```

**바꾸기**:
```typescript
const newUser: User = {
  id: firebaseUser.uid,
  name: firebaseUser.displayName || '',
  email: firebaseUser.email || '',
  role: 'member', // Custom Claims로 override됨
  isApproved: false, // 관리자가 승인 후 true로 변경
```

---

## 🔴 Critical Fix #2: 개인정보 로그 제거

### 전체 프로젝트에서 제거할 패턴

**VS Code / Cursor 검색**:
```
Ctrl/Cmd + Shift + F
검색: console.log.*email
검색: console.log.*user
검색: console.log.*pendingUser
```

**제거 대상 예시**:

#### `src/contexts/AuthContextEnhanced.tsx` (261-264줄)
```typescript
// ❌ 삭제
console.log('🚀 회원가입 시작:', {
  email: userData.email,
  name: userData.name,
});
```

#### `src/pages/Home.tsx` (29-38줄)
```typescript
// ❌ 삭제
console.log('🏠 [Home] 렌더링 상태:', {
  eventsLoading,
  eventsCount: events.length,
  hasCurrentEvent: !!currentEvent,
});
```

#### `src/pages/Gallery.tsx` (125-131줄)
```typescript
// ❌ 삭제
console.log('🚀 사진 업로드 버튼 클릭됨! [v2.0]');
console.log('👤 현재 사용자:', user?.email || 'null');
```

**에러 로깅만 남기기**:
```typescript
// ✅ 유지 (에러만)
console.error('작업 실패:', error.code); // OK - 개인정보 없음

// ❌ 삭제
console.log('사용자 정보:', user); // NO - 개인정보 포함
```

---

## 🟠 High Priority Fix #1: XSS 방어

### 1. 설치

```bash
npm install dompurify
npm install --save-dev @types/dompurify
```

### 2. 유틸 함수 생성

**파일**: `src/utils/sanitize.ts` (새 파일)
```typescript
import DOMPurify from 'dompurify';

/**
 * 사용자 입력 HTML을 안전하게 정제
 */
export const sanitizeHtml = (dirty: string): string => {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target'],
  });
};

/**
 * 텍스트만 추출 (HTML 태그 완전 제거)
 */
export const sanitizeText = (dirty: string): string => {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });
};
```

### 3. 적용

#### `src/pages/Admin/ContentManagement.tsx` (299줄)

**변경 전**:
```typescript
<p className="text-slate-700">{notice.content}</p>
```

**변경 후**:
```typescript
import { sanitizeHtml } from '../../utils/sanitize';

<p
  className="text-slate-700"
  dangerouslySetInnerHTML={{ __html: sanitizeHtml(notice.content) }}
/>
```

#### `src/pages/Admin/MemberManagement.tsx` (1173줄)

**변경 전**:
```typescript
<p className="text-slate-700 whitespace-pre-wrap">
  {selectedPendingUser.applicationMessage}
</p>
```

**변경 후**:
```typescript
import { sanitizeHtml } from '../../utils/sanitize';

<p
  className="text-slate-700 whitespace-pre-wrap"
  dangerouslySetInnerHTML={{
    __html: sanitizeHtml(selectedPendingUser.applicationMessage)
  }}
/>
```

### 4. 모든 사용자 콘텐츠 위치

다음 위치에도 동일하게 적용:
- 게시판 글 내용 (`src/pages/Board.tsx`)
- 댓글 내용 (`src/components/Comment.tsx`)
- 공지사항 (`src/pages/Admin/ContentManagement.tsx`)
- 프로필 소개 (`src/pages/Profile.tsx`)

---

## 🟠 High Priority Fix #2: 이메일 검증 강화

### 1. 설치

```bash
npm install validator
npm install --save-dev @types/validator
```

### 2. 적용

**파일**: `src/pages/Register.tsx` (62-117줄의 validateForm 함수)

**변경 전**:
```typescript
else if (!/\S+@\S+\.\S+/.test(formData.email)) {
  newErrors.email = '올바른 이메일 형식이 아닙니다.';
}
```

**변경 후**:
```typescript
import validator from 'validator';

else if (!validator.isEmail(formData.email)) {
  newErrors.email = '올바른 이메일 형식이 아닙니다.';
}
```

---

## 🟠 High Priority Fix #3: Firebase 규칙 강화

### 파일: `firestore.rules`

#### 수정 1: guestApplications (303줄)

**변경 전**:
```javascript
match /guestApplications/{applicationId} {
  allow create: if true;
}
```

**변경 후**:
```javascript
match /guestApplications/{applicationId} {
  // 인증 필수 + 데이터 검증
  allow create: if request.auth != null
    && request.resource.data.name is string
    && request.resource.data.name.size() > 0
    && request.resource.data.name.size() <= 100
    && request.resource.data.email is string
    && request.resource.data.email.matches('.*@.*\\..*')
    && request.resource.data.phone is string
    && request.resource.data.phone.size() > 0;

  allow read, update, delete: if isAdmin() || isChairman();
}
```

#### 수정 2: participations (258-261줄)

**변경 전**:
```javascript
match /participations/{participationId} {
  allow create: if isAuthenticated();
}
```

**변경 후**:
```javascript
match /participations/{participationId} {
  // 승인된 회원만 참가 신청 가능
  allow create: if isAuthenticated()
    && isApproved()
    && request.resource.data.userId == request.auth.uid;

  allow read: if isAuthenticated();
  allow update: if isAdmin() || isChairman() || request.auth.uid == resource.data.userId;
  allow delete: if isAdmin() || isChairman();
}
```

### 배포

```bash
firebase deploy --only firestore:rules
```

---

## 🟡 Medium Priority Fix #1: Toast 시스템

### 1. 설치

```bash
npm install react-hot-toast
```

### 2. 유틸 함수 생성

**파일**: `src/utils/toast.ts` (새 파일)
```typescript
import toast from 'react-hot-toast';

export const showSuccess = (message: string) => {
  toast.success(message, {
    duration: 3000,
    position: 'top-right',
    style: {
      background: '#10B981',
      color: '#fff',
    },
  });
};

export const showError = (message: string) => {
  toast.error(message, {
    duration: 4000,
    position: 'top-right',
    style: {
      background: '#EF4444',
      color: '#fff',
    },
  });
};

export const showInfo = (message: string) => {
  toast(message, {
    duration: 3000,
    position: 'top-right',
    icon: 'ℹ️',
  });
};

export const showLoading = (message: string) => {
  return toast.loading(message, {
    position: 'top-right',
  });
};
```

### 3. App.tsx에 추가

**파일**: `src/App.tsx`

```typescript
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" />
      <Routes>
        {/* 기존 라우트 */}
      </Routes>
    </AuthProvider>
  );
}
```

### 4. alert() 대체 예시

**변경 전**:
```typescript
alert('신청이 완료되었습니다.');
alert('오류가 발생했습니다.');
```

**변경 후**:
```typescript
import { showSuccess, showError } from '../utils/toast';

showSuccess('신청이 완료되었습니다.');
showError('오류가 발생했습니다.');
```

### 5. 일괄 변경 스크립트

**VS Code / Cursor 찾기-바꾸기** (정규식 사용):

```
찾기: alert\(['"](.+?)['"]\);?
바꾸기: showError('$1');
```

수동으로 success/error/info 구분 필요

---

## 🟡 Medium Priority Fix #2: Rate Limiting

### 파일: `src/pages/Admin/MemberManagement.tsx`

**추가할 상태** (컴포넌트 상단):
```typescript
const [failedAttempts, setFailedAttempts] = useState(0);
const [isLocked, setIsLocked] = useState(false);
const [lockUntil, setLockUntil] = useState<Date | null>(null);
```

**handlePasswordConfirm 함수 전체 교체** (107-141줄):
```typescript
const handlePasswordConfirm = async () => {
  if (!user || !auth.currentUser) {
    showError('사용자 정보를 찾을 수 없습니다.');
    return;
  }

  // 잠금 확인
  if (isLocked) {
    const remainingTime = lockUntil
      ? Math.ceil((lockUntil.getTime() - Date.now()) / 1000 / 60)
      : 5;
    showError(`계정이 일시적으로 잠겼습니다. ${remainingTime}분 후 다시 시도해주세요.`);
    return;
  }

  // 최대 시도 횟수 확인
  if (failedAttempts >= 3) {
    const lockTime = new Date(Date.now() + 5 * 60 * 1000); // 5분
    setIsLocked(true);
    setLockUntil(lockTime);

    setTimeout(() => {
      setIsLocked(false);
      setFailedAttempts(0);
      setLockUntil(null);
    }, 5 * 60 * 1000);

    showError('계정이 5분간 잠겼습니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  try {
    const credential = EmailAuthProvider.credential(
      user.email,
      passwordInput
    );

    await reauthenticateWithCredential(auth.currentUser, credential);

    // 성공 - 초기화
    setFailedAttempts(0);
    setIsPasswordModalOpen(false);
    setPasswordInput('');

    // 다음 작업 진행
    if (pendingAction) {
      pendingAction();
    }
  } catch (error: any) {
    // 실패 횟수 증가
    const newAttempts = failedAttempts + 1;
    setFailedAttempts(newAttempts);

    console.error('비밀번호 확인 실패:', error);

    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      const remaining = 3 - newAttempts;
      showError(`비밀번호가 올바르지 않습니다. (${remaining}회 남음)`);
    } else if (error.code === 'auth/too-many-requests') {
      showError('너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.');
      setIsLocked(true);
      setTimeout(() => setIsLocked(false), 5 * 60 * 1000);
    } else {
      showError('비밀번호 확인에 실패했습니다.');
    }

    setPasswordInput('');
  }
};
```

---

## 🟡 Medium Priority Fix #3: TypeScript any 제거

### `src/pages/Home.tsx` (93-95줄)

**변경 전**:
```typescript
const calculateStats = {
  getTotalMembers: (members: any[]) => members.length,
  getActiveMembers: (members: any[]) => members.filter(m => m.attendanceRate > 0).length,
  getAverageAttendanceRate: (members: any[]) => {
    // ...
  }
};
```

**변경 후**:
```typescript
import { useMemo } from 'react';
import { Member } from '../types';

const calculateStats = useMemo(() => ({
  getTotalMembers: (members: Member[]) => members.length,
  getActiveMembers: (members: Member[]) =>
    members.filter(m => m.attendanceRate > 0).length,
  getAverageAttendanceRate: (members: Member[]) => {
    if (members.length === 0) return 0;
    const total = members.reduce((sum, m) => sum + (m.attendanceRate || 0), 0);
    return Math.round(total / members.length);
  }
}), []);
```

### `src/pages/Admin/MemberManagement.tsx` (52줄)

**변경 전**:
```typescript
const [selectedGuestApplication, setSelectedGuestApplication] = useState<any | null>(null);
```

**변경 후**:
```typescript
import { GuestApplication } from '../../types';

const [selectedGuestApplication, setSelectedGuestApplication] = useState<GuestApplication | null>(null);
```

---

## 🟡 Medium Priority Fix #4: 에러 처리 개선

### 공통 패턴

**변경 전**:
```typescript
try {
  // 작업
} catch (err: any) {
  logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE);
  throw err; // ❌ 사용자 피드백 없음
}
```

**변경 후**:
```typescript
import { showError } from '../utils/toast';

try {
  // 작업
} catch (err: any) {
  const message = err instanceof Error ? err.message : '알 수 없는 오류';
  console.error('작업 실패:', err);
  logError(err, ErrorLevel.ERROR, ErrorCategory.DATABASE);
  showError(`작업에 실패했습니다: ${message}`);
  // throw 제거 - 사용자에게 피드백 제공됨
}
```

### 적용 위치

1. `src/contexts/PendingUserContext.tsx` - approvePendingUser, rejectPendingUser
2. `src/contexts/GuestApplicationContext.tsx` - addGuestApplication
3. `src/pages/Admin/MemberManagement.tsx` - 모든 catch 블록

---

## 🟡 Medium Priority Fix #5: prompt() 제거

### `src/pages/Admin/MemberManagement.tsx` (169줄)

**변경 전**:
```typescript
const handleReject = async (userId: string) => {
  const reason = prompt('거절 사유를 입력해주세요 (선택):');
  try {
    await rejectPendingUser(userId, reason || undefined);
    // ...
  }
};
```

**변경 후**:

1. **상태 추가** (컴포넌트 상단):
```typescript
const [showRejectModal, setShowRejectModal] = useState(false);
const [rejectUserId, setRejectUserId] = useState<string>('');
const [rejectReason, setRejectReason] = useState('');
```

2. **함수 수정**:
```typescript
const handleReject = (userId: string) => {
  setRejectUserId(userId);
  setShowRejectModal(true);
};

const confirmReject = async () => {
  try {
    await rejectPendingUser(rejectUserId, rejectReason || undefined);
    showSuccess('가입 신청이 거절되었습니다.');
    setShowRejectModal(false);
    setRejectReason('');
    setRejectUserId('');
  } catch (error) {
    showError('거절 처리에 실패했습니다.');
  }
};
```

3. **모달 JSX 추가** (return 문 안):
```typescript
{showRejectModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 className="text-lg font-semibold mb-4">거절 사유 입력</h3>
      <textarea
        value={rejectReason}
        onChange={(e) => setRejectReason(e.target.value)}
        placeholder="거절 사유를 입력해주세요 (선택)"
        className="w-full border rounded p-2 mb-4 min-h-[100px]"
        maxLength={500}
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => {
            setShowRejectModal(false);
            setRejectReason('');
            setRejectUserId('');
          }}
          className="px-4 py-2 border rounded hover:bg-gray-50"
        >
          취소
        </button>
        <button
          onClick={confirmReject}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          거절
        </button>
      </div>
    </div>
  </div>
)}
```

---

## 🟡 Medium Priority Fix #6: 메모리 누수 수정

### `src/pages/Gallery.tsx` - Interval cleanup

**찾기** (135-145줄 근처):
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    // slideshow logic
  }, 3000);
  // cleanup 누락!
}, []);
```

**바꾸기**:
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    // slideshow logic
  }, 3000);

  return () => clearInterval(interval); // ✅ cleanup 추가
}, []);
```

### `src/pages/Gallery.tsx` - URL cleanup

**processFiles 함수에 추가**:
```typescript
const processFiles = async (selectedFiles: File[]) => {
  const processedFiles: ProcessedFile[] = [];

  try {
    for (const file of selectedFiles) {
      const preview = URL.createObjectURL(file);
      processedFiles.push({ file, preview });
    }

    setFiles(prev => [...prev, ...processedFiles]);
  } catch (error) {
    console.error('파일 처리 실패:', error);
  } finally {
    // ✅ cleanup 추가
    processedFiles.forEach(({ preview }) => {
      if (preview) URL.revokeObjectURL(preview);
    });
  }
};
```

---

## 🔍 빠른 테스트 체크리스트

수정 후 다음을 확인하세요:

```bash
# 1. 타입 체크
npm run lint

# 2. 빌드 테스트
npm run build

# 3. 프리뷰 실행
npm run preview

# 4. Firebase 규칙 테스트
firebase emulators:start --only firestore
```

### 브라우저 확인 사항

- [ ] 콘솔에 개인정보 로그 없음
- [ ] XSS 테스트: `<script>alert('test')</script>` 입력 시 차단됨
- [ ] Toast 알림 정상 작동
- [ ] 잘못된 이메일 입력 시 거부됨
- [ ] 비밀번호 3회 실패 시 잠금

---

**Last Updated**: 2026-02-08
**Next**: 수정 완료 후 `FIX_PRIORITY.md`의 체크리스트 확인
