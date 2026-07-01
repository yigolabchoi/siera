# 시애라 (Siera) - 등산 클럽 웹사이트

50-70대 CEO 및 임원들을 위한 프리미엄 등산 클럽 웹사이트입니다.

**운영 사이트**: https://sierra-be167.web.app

## 🚀 기술 스택

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 3
- **Routing**: React Router v7
- **Icons**: Lucide React
- **Backend**: Firebase (Authentication / Firestore / Storage) — 프로젝트 `sierra-be167`
- **Deployment**: Firebase Hosting (GitHub Actions 자동 배포)

## 📋 주요 기능

### 회원 기능
- ✅ 로그인 / 회원가입 (이메일·Google, 관리자 승인 필요)
- ✅ 게스트 모드 산행 신청
- ✅ 프로필 관리 및 사진 업로드
- ✅ 로그인 정보 저장 (Remember Me)

### 산행 관리
- ✅ 월별 정기 산행 일정
- ✅ 산행 신청 및 참석자 관리
- ✅ 조 편성 시스템 (조장/조원)
- ✅ 다중 코스 관리 (A코스/B코스)
- ✅ 일정별 상세 동선 정보
- ✅ 특별산행(해외/국내 다일간) — 일차별 일정, 회원/게스트 경비, 예약금·잔금 관리

### 커뮤니티
- ✅ 게시판 (자유게시판/정보공유/질문)
- ✅ 글쓰기 및 댓글 / 대댓글(답글) 시스템
- ✅ 좋아요 기능
- ✅ 사진 갤러리 (그리드/메이슨리 뷰) 및 공유 앨범 링크
- ✅ 이미지 뷰어 (확대/축소/슬라이드쇼)
- ✅ 다중 사진 업로드 (드래그 앤 드롭)

### 등산 정보
- ✅ 산행 당일 날씨 정보 (기상청 KMA API)
- ✅ 추천 산 정보 / 안전 수칙 및 준비물

### 회원 관리
- ✅ 회원명부 (이름, 회사, 직책)
- ✅ 참여율 통계 / 연도별 산행 횟수
- ✅ 입금 정보 및 연회비 관리

### 관리자 기능
- ✅ 산행 일정 등록/수정/삭제 + 프린트 뷰
- ✅ 회원 승인 및 관리
- ✅ 조 편성 관리
- ✅ 결제/연회비 관리
- ✅ 운영진·콘텐츠(회칙, 이달의 詩) 관리

## 🛠️ 로컬 개발

### 사전 준비
1. `npm install`
2. 프로젝트 루트에 `.env.local` 파일 생성 후 Firebase 및 API 키 입력 (아래 [환경 변수](#-환경-변수) 참고)

### 명령어
```bash
npm run dev       # 개발 서버 (http://localhost:3000)
npm run build     # 타입 체크(tsc) + 프로덕션 빌드(vite)
npm run preview   # 빌드 결과 미리보기 (http://localhost:4173)
npm run lint      # ESLint 검사
```

## 🌐 배포

### 자동 배포
`main` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 자동으로
빌드 후 **Firebase Hosting**(`sierra-be167`)에 배포합니다.

```bash
git add .
git commit -m "Update: 기능 추가"
git push origin main
```

GitHub Actions 탭에서 "Deploy to Firebase Hosting" workflow를 수동 실행할 수도 있습니다.

### 수동 배포 (로컬)
```bash
npm run build
firebase deploy --only hosting
```

## 🔐 환경 변수

### 로컬 (`.env.local`)
```bash
# Firebase
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=sierra-be167
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...

# 기상청(KMA) 날씨 API
VITE_KMA_API_KEY=...

# Kakao Map (주소 검색)
VITE_KAKAO_REST_API_KEY=...
```
> 전체 키 목록은 `.env.example` 참고. Firebase 설정 값은 Firebase Console → 프로젝트 설정에서 확인할 수 있습니다.

### GitHub Secrets (배포용)
GitHub Actions가 사용하는 시크릿:
- `VITE_FIREBASE_*` (위 Firebase 설정 값 전체)
- `VITE_KMA_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT` (Firebase 배포용 서비스 계정 JSON)

## 🔑 권한 / 계정

- 회원가입 후 **관리자 승인**을 받아야 로그인 가능합니다.
- 관리자 권한은 Firebase Custom Claims로 부여합니다 (`scripts/set-custom-claims.cjs` 참고).
- 비밀번호 강제 변경 등 운영 작업은 `scripts/` 폴더의 Firebase Admin SDK 스크립트로 수행합니다.

## 📂 프로젝트 구조

```
hiking-club/
├── .github/workflows/       # CI(ci.yml) + 배포(deploy.yml)
├── src/
│   ├── components/          # 재사용 컴포넌트 (Layout, ui, EventManagement 등)
│   ├── contexts/            # 도메인별 React Context (Event, Member, Payment, ...)
│   ├── pages/               # 페이지 컴포넌트
│   │   ├── Admin/           # 관리자 페이지 (회원/결제/조편성/콘텐츠 등)
│   │   └── Landing/         # 랜딩 페이지
│   ├── hooks/ services/ lib/ utils/ constants/
│   ├── types/index.ts       # TypeScript 타입 정의 (도메인 모델)
│   ├── App.tsx              # 라우팅 + Context Provider 트리
│   └── main.tsx             # 진입점
├── scripts/                 # Firebase Admin SDK 운영 스크립트 (.cjs)
├── public/                  # 정적 파일
├── firebase.json            # Firebase Hosting/Firestore/Storage 설정
├── firestore.rules          # Firestore 보안 규칙
└── storage.rules            # Storage 보안 규칙
```

> 데이터 모델과 보안 규칙 상세는 `FIRESTORE_STRUCTURE.md`, `DATABASE.md`, `database-schema.dbml`,
> 프로젝트 현황은 `PROJECT_STATUS.md`를 참고하세요.

## 🎨 디자인 시스템

- **Primary**: Emerald/Green 계열
- 카드 기반 레이아웃, 부드러운 라운드, 호버/트랜지션
- 50-70대 가독성을 우선한 타이포그래피

자세한 내용은 `DESIGN_SYSTEM.md` 참고.

## 📝 TODO

- [ ] 커스텀 도메인 연결 (sierraclub.co.kr — 인증서 발급 대기)
- [ ] 이메일/푸시 알림 기능
- [ ] 온라인 결제(PG) 연동

## 📄 라이선스

Private - All Rights Reserved

---

**함께 오르는 산, 함께 나누는 가치** 🏔️
