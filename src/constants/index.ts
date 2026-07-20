// 애플리케이션 전역 상수

/**
 * 슈퍼 관리자 이메일 목록 (운영진에 포함되지 않지만 모든 관리 권한 보유)
 */
export const SUPER_ADMIN_EMAILS: readonly string[] = ['choi@yigolab.com'];

/**
 * 페이지네이션 설정
 */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 12,
  MEMBER_PAGE_SIZE: 12,
  POST_PAGE_SIZE: 10,
  PHOTO_PAGE_SIZE: 12,
} as const;

/**
 * 난이도 레벨
 */
export const DIFFICULTY_LEVELS = {
  VERY_EASY: '하',
  EASY: '중하',
  MEDIUM: '중',
  HARD: '중상',
  VERY_HARD: '상',
} as const;

/**
 * 회원 직급
 */
export const MEMBER_POSITIONS = {
  CHAIRMAN: 'chairman',
  COMMITTEE: 'committee',
  MEMBER: 'member',
} as const;

/**
 * 회원 직급 한글명
 */
export const MEMBER_POSITION_NAMES = {
  [MEMBER_POSITIONS.CHAIRMAN]: '회장단',
  [MEMBER_POSITIONS.COMMITTEE]: '운영진',
  [MEMBER_POSITIONS.MEMBER]: '일반회원',
} as const;

/**
 * 신청 상태
 */
export const APPLICATION_STATUS = {
  OPEN: 'open',
  FULL: 'full',
  CLOSED: 'closed',
  NO_EVENT: 'no-event',
} as const;

/**
 * 신청 상태 한글명
 */
export const APPLICATION_STATUS_NAMES = {
  [APPLICATION_STATUS.OPEN]: '신청 가능',
  [APPLICATION_STATUS.FULL]: '정원 마감',
  [APPLICATION_STATUS.CLOSED]: '신청 마감',
  [APPLICATION_STATUS.NO_EVENT]: '산행 미정',
} as const;

/**
 * 입금 상태
 */
export const PAYMENT_STATUS = {
  COMPLETED: '입금 완료',
  PENDING: '입금 대기',
} as const;

/**
 * 게시판 카테고리
 */
export const BOARD_CATEGORIES = {
  NOTICE: 'notice',
  GENERAL: 'general',
  INFO: 'info',
  QUESTION: 'question',
  POEM: 'poem',
} as const;

/**
 * 게시판 카테고리 한글명
 */
export const BOARD_CATEGORY_NAMES = {
  [BOARD_CATEGORIES.NOTICE]: '공지사항',
  [BOARD_CATEGORIES.GENERAL]: '자유게시판',
  [BOARD_CATEGORIES.INFO]: '정보클럽',
  [BOARD_CATEGORIES.QUESTION]: '질문',
  [BOARD_CATEGORIES.POEM]: '시(詩)',
} as const;

/**
 * 날씨 상태
 */
export const WEATHER_CONDITIONS = {
  SUNNY: 'sunny',
  CLOUDY: 'cloudy',
  RAINY: 'rainy',
  SNOWY: 'snowy',
} as const;

/**
 * 배지 variant
 */
export const BADGE_VARIANTS = {
  PRIMARY: 'primary',
  SUCCESS: 'success',
  WARNING: 'warning',
  DANGER: 'danger',
  INFO: 'info',
} as const;

/**
 * 파일 업로드 제한
 */
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
} as const;

/**
 * 로컬 스토리지 키
 */
export const STORAGE_KEYS = {
  AUTH_USER: 'sierra_auth_user',
  USER: 'sierra_user',
  SAVED_EMAIL: 'sierra_saved_email',
  DEV_MODE: 'sierra_dev_mode',
  DEV_MODE_STATUS: 'sierra_dev_mode_status',
  THEME: 'sierra_theme',
  HIDE_APPLICATION_GUIDE: 'sierra_hide_application_guide',
} as const;

/**
 * API 엔드포인트 (미래 사용)
 */
export const API_ENDPOINTS = {
  EVENTS: '/api/events',
  MEMBERS: '/api/members',
  APPLICANTS: '/api/applicants',
  PAYMENTS: '/api/payments',
  NOTICES: '/api/notices',
  POSTS: '/api/posts',
  PHOTOS: '/api/photos',
  WEATHER: '/api/weather',
  EXECUTIVES: '/api/executives',
} as const;

/**
 * 날짜 포맷
 */
export const DATE_FORMATS = {
  KOREAN: 'YYYY년 MM월 DD일',
  ISO: 'YYYY-MM-DD',
  DISPLAY: 'YYYY.MM.DD',
  MONTH_YEAR: 'YYYY년 MM월',
} as const;

/**
 * 정규식 패턴
 */
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^01[0-9]-?[0-9]{4}-?[0-9]{4}$/,
  PASSWORD: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/,
  URL: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
} as const;

/**
 * 에러 메시지
 */
export const ERROR_MESSAGES = {
  REQUIRED_FIELD: '필수 입력 항목입니다.',
  INVALID_EMAIL: '올바른 이메일 형식이 아닙니다.',
  INVALID_PHONE: '올바른 전화번호 형식이 아닙니다.',
  INVALID_PASSWORD: '비밀번호는 8자 이상, 영문과 숫자를 포함해야 합니다.',
  FILE_TOO_LARGE: '파일 크기가 너무 큽니다. (최대 10MB)',
  INVALID_FILE_TYPE: '지원하지 않는 파일 형식입니다.',
  NETWORK_ERROR: '네트워크 오류가 발생했습니다.',
  UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
} as const;

/**
 * 성공 메시지
 */
export const SUCCESS_MESSAGES = {
  SAVE_SUCCESS: '저장되었습니다.',
  UPDATE_SUCCESS: '수정되었습니다.',
  DELETE_SUCCESS: '삭제되었습니다.',
  SUBMIT_SUCCESS: '제출되었습니다.',
  COPY_SUCCESS: '클립보드에 복사되었습니다.',
  UPLOAD_SUCCESS: '업로드되었습니다.',
} as const;

/**
 * 애니메이션 duration (ms)
 */
export const ANIMATION_DURATION = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
} as const;

/**
 * Debounce/Throttle 시간 (ms)
 */
export const TIMING = {
  DEBOUNCE_SEARCH: 300,
  DEBOUNCE_INPUT: 500,
  THROTTLE_SCROLL: 100,
  THROTTLE_RESIZE: 200,
  /** 인증 초기화 안전 타임아웃 (ms) - onAuthStateChanged가 완료되지 않을 때 강제 로딩 해제 */
  AUTH_INIT_TIMEOUT: 10_000,
  /** 페이지 로딩 안전 타임아웃 (ms) - Firestore 데이터 로딩이 지연될 때 강제 렌더링 */
  PAGE_LOADING_TIMEOUT: 8_000,
} as const;

/**
 * Z-index 레벨
 */
export const Z_INDEX = {
  DROPDOWN: 1000,
  STICKY: 1020,
  FIXED: 1030,
  MODAL_BACKDROP: 1040,
  MODAL: 1050,
  POPOVER: 1060,
  TOOLTIP: 1070,
} as const;

/**
 * Validation 규칙
 */
export const VALIDATION = {
  EMAIL: REGEX_PATTERNS.EMAIL,
  PHONE: REGEX_PATTERNS.PHONE,
  PASSWORD: REGEX_PATTERNS.PASSWORD,
  MIN_PASSWORD_LENGTH: 8,
  MAX_FILE_SIZE: FILE_UPLOAD.MAX_SIZE,
  ALLOWED_FILE_TYPES: FILE_UPLOAD.ALLOWED_TYPES,
} as const;

/**
 * 이벤트 관련 상수
 */
export const EVENT_CONSTANTS = {
  APPLICATION_DEADLINE_DAYS: 10, // 산행 출발일 기준 10일 전 마감
  MAX_PARTICIPANTS_DEFAULT: 100,
  MIN_PARTICIPANTS: 5,
  TEAM_SIZE_DEFAULT: 10,
} as const;

/**
 * UI 관련 상수
 */
export const UI_CONSTANTS = {
  MAX_UPLOAD_IMAGES: 10,
  SIDEBAR_WIDTH: 280,
  HEADER_HEIGHT: 64,
  MOBILE_BREAKPOINT: 768,
  TABLET_BREAKPOINT: 1024,
} as const;

/**
 * 메시지 템플릿
 */
export const MESSAGE_TEMPLATES = {
  CONFIRM_DELETE: '정말 삭제하시겠습니까?',
  CONFIRM_SAVE: '변경사항을 저장하시겠습니까?',
  CONFIRM_CANCEL: '작성을 취소하시겠습니까? 작성한 내용은 저장되지 않습니다.',
  CONFIRM_LOGOUT: '로그아웃 하시겠습니까?',
  REQUIRED_FIELD: '필수 입력 항목입니다.',
  INVALID_FORMAT: '올바른 형식이 아닙니다.',
} as const;

/**
 * 라우트 경로
 */
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  PROFILE: '/profile',
  EVENTS: '/home/events',
  MEMBERS: '/home/members',
  GALLERY: '/home/gallery',
  BOARD: '/home/board',
  ATTENDANCE: '/home/attendance',
  CLUB_INFO: '/home/club-info',
  HIKING_HISTORY: '/home/hiking-history',
  QUICK_APPLY: '/quick-apply',
  GUEST_APPLICATION: '/guest-application',
  ADMIN: {
    EVENTS: '/admin/events',
    MEMBERS: '/admin/members',
    PAYMENT: '/admin/payment',
    EXECUTIVES: '/admin/executives',
    POEMS: '/admin/poems',
  },
} as const;

