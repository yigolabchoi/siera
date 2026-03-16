# 🎯 수정 우선순위 가이드

> 이 문서는 QA 이슈를 우선순위별로 빠르게 확인하기 위한 요약본입니다.
> 상세 내용은 `QA_ISSUES.md`를 참고하세요.

---

## 🔴 Phase 1: 즉시 수정 (1-2일) - CRITICAL

### 1️⃣ 하드코딩된 관리자 이메일 제거

```bash
파일: src/contexts/AuthContextEnhanced.tsx
위치: 84-92줄
소요: 10분
```

**제거할 코드**:
```typescript
const isDevAdmin = firebaseUser.email === 'choi@yigolab.com';
```

**이유**: 누구나 해당 이메일로 관리자 권한 획득 가능

---

### 2️⃣ 개인정보 노출 console.log 제거

```bash
주요 파일:
- src/pages/Home.tsx
- src/pages/Gallery.tsx
- src/pages/Admin/MemberManagement.tsx
- src/contexts/AuthContextEnhanced.tsx
- src/contexts/GuestApplicationContext.tsx
- src/contexts/PendingUserContext.tsx

소요: 1-2시간
```

**제거 대상**: 이메일, 이름 등 개인정보가 포함된 모든 console.log

**확인 방법**: 프로덕션 빌드 후 브라우저 콘솔 확인
```bash
npm run build
npm run preview
```

---

## 🟠 Phase 2: 보안 강화 (3-7일) - HIGH

### 3️⃣ XSS 방어 구현

```bash
파일:
- src/pages/Admin/ContentManagement.tsx
- src/pages/Admin/MemberManagement.tsx
소요: 2-3시간
```

**설치**:
```bash
npm install dompurify
npm install --save-dev @types/dompurify
```

**적용 코드**:
```typescript
import DOMPurify from 'dompurify';

// 모든 사용자 입력 콘텐츠에 적용
<div dangerouslySetInnerHTML={{
  __html: DOMPurify.sanitize(userContent)
}} />
```

---

### 4️⃣ 이메일 유효성 검사 강화

```bash
파일: src/pages/Register.tsx
위치: 62-117줄
소요: 30분
```

**옵션 1** (빠름):
```typescript
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
```

**옵션 2** (권장):
```bash
npm install validator
npm install --save-dev @types/validator
```

---

### 5️⃣ Firebase 보안 규칙 강화

```bash
파일: firestore.rules
위치: 303줄
소요: 30분
```

**수정**:
```javascript
match /guestApplications/{applicationId} {
  // 변경 전: allow create: if true;
  allow create: if request.auth != null;
}
```

**배포**:
```bash
firebase deploy --only firestore:rules
```

---

## 🟡 Phase 3: UX 및 코드 품질 (1-2주) - MEDIUM

### 6️⃣ Toast 알림 시스템 구현

```bash
소요: 4-6시간
영향: 53개 이상의 alert() 대체
```

**설치**:
```bash
npm install react-hot-toast
```

**적용**:
1. `src/utils/toast.ts` 생성
2. `App.tsx`에 `<Toaster />` 추가
3. 모든 `alert()` → `showSuccess()`, `showError()` 대체

---

### 7️⃣ 비밀번호 재인증 rate limiting

```bash
파일: src/pages/Admin/MemberManagement.tsx
위치: 107-141줄
소요: 1-2시간
```

**추가 로직**:
- 시도 횟수 제한 (3회)
- 실패 시 5분 잠금
- 남은 횟수 표시

---

### 8️⃣ TODO 기능 처리

```bash
소요: 개별 4-8시간
```

**위치**:
1. `src/pages/Events.tsx` (189줄) - 취소 로직
2. `src/pages/QuickEventApply.tsx` (140줄) - Firebase 연동
3. `src/pages/Admin/Attendance.tsx` (10-14줄) - 출석 시스템

**선택지**:
- 구현 OR
- UI에서 기능 숨김 (임시)

---

### 9️⃣ TypeScript any 타입 제거

```bash
소요: 2-3시간
```

**주요 위치**:
- `src/pages/Home.tsx` (93줄) - calculateStats
- `src/pages/Admin/MemberManagement.tsx` (52줄) - selectedGuestApplication

---

### 🔟 에러 처리 개선

```bash
소요: 3-4시간
```

**패턴 변경**:
```typescript
// 변경 전
catch (err) {
  logError(err);
  throw err;
}

// 변경 후
catch (err) {
  logError(err);
  showError('작업에 실패했습니다.');
}
```

---

### 1️⃣1️⃣ 하드코딩 값 제거

```bash
소요: 4-6시간
```

**주요 작업**:
1. 날씨 데이터 → API 연동
2. 과거 산행 → Firestore 조회
3. 이미지 URL → 환경 변수

---

### 1️⃣2️⃣ 메모리 누수 수정

```bash
소요: 1-2시간
```

**위치**:
- `src/pages/Gallery.tsx` - interval cleanup
- `src/pages/Gallery.tsx` - URL.revokeObjectURL

---

### 1️⃣3️⃣ prompt() → 모달 대체

```bash
파일: src/pages/Admin/MemberManagement.tsx
위치: 169줄
소요: 2-3시간
```

---

## 🟢 Phase 4: 장기 개선 (지속적) - LOW

### 1️⃣4️⃣ 성능 최적화

```bash
소요: 4-6시간
```

- useMemo/useCallback 적용
- 리렌더링 최적화

---

### 1️⃣5️⃣ 미사용 Mock 데이터 제거

```bash
소요: 10분
```

```bash
rm -rf src/data/
# 또는
mv src/data/ _archived/
```

---

## 📊 작업 시간 예상

| Phase | 소요 시간 | 우선순위 |
|-------|----------|---------|
| Phase 1 (Critical) | 2-3시간 | 즉시 |
| Phase 2 (High) | 1-2일 | 1주 내 |
| Phase 3 (Medium) | 1-2주 | 2주 내 |
| Phase 4 (Low) | 지속적 | 시간 날 때 |

---

## 🚀 빠른 시작 가이드

### 오늘 당장 해야 할 일 (2-3시간)

```bash
# 1. 하드코딩 이메일 제거 (10분)
code src/contexts/AuthContextEnhanced.tsx
# 84-92줄의 isDevAdmin 로직 삭제

# 2. console.log 제거 (2시간)
# 각 파일에서 개인정보 포함 로그 삭제
code src/pages/Home.tsx
code src/pages/Gallery.tsx
code src/pages/Admin/MemberManagement.tsx
code src/contexts/AuthContextEnhanced.tsx

# 3. 빌드 테스트
npm run build
npm run preview
# 브라우저 콘솔에 개인정보 로그 없는지 확인
```

### 이번 주 내에 해야 할 일 (1-2일)

```bash
# 1. XSS 방어 설치
npm install dompurify @types/dompurify

# 2. 이메일 검증 강화
npm install validator @types/validator

# 3. Toast 시스템 설치
npm install react-hot-toast

# 4. Firebase 규칙 수정
code firestore.rules
firebase deploy --only firestore:rules
```

---

## 🎯 브랜치 전략 제안

```bash
# Critical 수정
git checkout -b fix/critical-security-issues

# High priority 수정
git checkout -b fix/security-enhancements

# Medium priority 수정
git checkout -b feature/toast-notifications
git checkout -b fix/code-quality-improvements

# Low priority 수정
git checkout -b perf/optimize-components
```

---

## 📞 도움이 필요하면

1. **보안 이슈**: Phase 1, 2 최우선 처리
2. **기능 이슈**: Phase 3에서 TODO 항목 먼저
3. **성능 이슈**: Phase 4는 나중에

상세 내용은 `QA_ISSUES.md` 참고

---

**Last Updated**: 2026-02-08
