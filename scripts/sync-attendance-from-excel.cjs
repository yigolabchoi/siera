/**
 * 엑셀 출석 데이터 → Firestore 동기화 스크립트
 *
 * 대상 파일: public/시애라 회원명부 및 참석통계.2026.Q1.xlsx
 * 수행 작업:
 *   1. attendances 레코드 upsert (228, 229, 230회)
 *   2. members.hikingCount 업데이트 (총 누계 기준)
 */

const admin = require('firebase-admin');
const XLSX = require('xlsx');
const path = require('path');

const serviceAccount = require('../firebase-admin-key.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// 228, 229, 230회 이벤트 ID (Firestore에서 확인된 값)
const EVENTS = [
  { col: 7, eventId: 'event-1769616225554', no: 228, title: '시애라 228차 정기산행', date: '2026-01-10' },
  { col: 8, eventId: 'event-past-229',      no: 229, title: '시애라 229차 정기산행', date: '2026-02-07' },
  { col: 9, eventId: 'event-1770718373681', no: 230, title: '시애라 230차 정기산행', date: '2026-03-14' },
];

async function main() {
  console.log('=== 엑셀 출석 데이터 동기화 시작 ===\n');

  // ── Step 1: 엑셀 파싱 ──────────────────────────────────────────
  const excelPath = path.join(__dirname, '../public/시애라 회원명부 및 참석통계.2026.Q1.xlsx');
  const wb = XLSX.readFile(excelPath);
  const ws = wb.Sheets['Sheet1'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 행 3부터 데이터 (행 0: 제목, 행 1: 날짜, 행 2: 헤더)
  const excelMembers = rows.slice(3).filter(function(r) { return r[1] && String(r[1]).trim(); });
  console.log('엑셀 회원 수:', excelMembers.length);

  // ── Step 2: Firestore 회원 조회 ────────────────────────────────
  // 활성(isApproved=true, isActive≠false) 계정 우선 매핑
  const memberSnap = await db.collection('members').get();
  const memberByName = {};
  memberSnap.docs.forEach(function(d) {
    const data = d.data();
    const name = (data.name || '').trim();
    if (!name) return;
    const isActive = data.isApproved === true && data.isActive !== false;
    const existing = memberByName[name];
    // 아직 없거나, 기존 항목이 비활성이고 현재가 활성이면 교체
    if (!existing || (!existing._isActive && isActive)) {
      memberByName[name] = Object.assign({ id: d.id, _isActive: isActive }, data);
    }
  });
  console.log('Firestore 회원 수(활성 우선):', Object.keys(memberByName).length);

  // ── Step 3: 매칭 ───────────────────────────────────────────────
  const matched = [];
  const unmatched = [];

  excelMembers.forEach(function(row) {
    const name = String(row[1]).trim();
    const member = memberByName[name];
    if (member) {
      matched.push({
        name: name,
        memberId: member.id,
        userName: member.name,
        col228: row[7] === 1 || row[7] === '1' || String(row[7]).startsWith('1'),
        col229: row[8] === 1 || row[8] === '1' || String(row[8]).startsWith('1'),
        col230: row[9] === 1 || row[9] === '1' || String(row[9]).startsWith('1'),
        hikingCount: typeof row[14] === 'number' ? row[14] : parseInt(row[14]) || 0,
        hikingCount2026: [row[7], row[8], row[9]].filter(function(v) {
          return v === 1 || v === '1' || (typeof v === 'string' && v.startsWith('1'));
        }).length, // 하위호환용 (마이그레이션 후 제거 가능)
      });
    } else {
      unmatched.push(name);
    }
  });

  console.log('\n매칭 결과:');
  console.log('  성공:', matched.length, '명');
  if (unmatched.length > 0) {
    console.log('  실패:', unmatched.length, '명 →', unmatched.join(', '));
  } else {
    console.log('  실패: 0명 (전원 매칭 성공)');
  }

  // ── Step 4: attendances upsert ─────────────────────────────────
  console.log('\n--- attendances 레코드 생성 중 ---');
  const now = new Date().toISOString();
  let attCount = 0;
  const batch1 = db.batch();

  matched.forEach(function(m) {
    EVENTS.forEach(function(ev) {
      const attended = ev.col === 7 ? m.col228 : ev.col === 8 ? m.col229 : m.col230;
      const docId = 'att_' + ev.eventId + '_' + m.memberId;
      const ref = db.collection('attendances').doc(docId);
      batch1.set(ref, {
        eventId: ev.eventId,
        userId: m.memberId,
        userName: m.userName,
        attendanceStatus: attended ? 'present' : 'absent',
        recordedBy: 'excel-import',
        createdAt: now,
        updatedAt: now,
      }, { merge: true });
      attCount++;
    });
  });

  await batch1.commit();
  console.log('  attendances 레코드 upsert 완료:', attCount, '건');

  // ── Step 5: hikingCount 업데이트 ───────────────────────────────
  console.log('\n--- members.hikingCount 업데이트 중 ---');
  // Firestore batch는 500개 제한이 있으므로 청크 처리
  const CHUNK = 400;
  let updated = 0;
  for (let i = 0; i < matched.length; i += CHUNK) {
    const chunk = matched.slice(i, i + CHUNK);
    const batch2 = db.batch();
    chunk.forEach(function(m) {
      const ref = db.collection('members').doc(m.memberId);
      batch2.update(ref, {
        hikingCount: m.hikingCount,
        hikingCount2026: m.hikingCount2026, // 하위호환용
        'hikingCountByYear.2026': m.hikingCount2026, // 연도별 맵
        updatedAt: now,
      });
      updated++;
    });
    await batch2.commit();
  }
  console.log('  hikingCount 업데이트 완료:', updated, '명');

  // ── 결과 요약 ──────────────────────────────────────────────────
  console.log('\n=== 동기화 완료 ===');
  console.log('  매칭 성공:', matched.length, '명');
  console.log('  매칭 실패:', unmatched.length, '명');
  console.log('  attendances 생성/갱신:', attCount, '건');
  console.log('  hikingCount 업데이트:', updated, '명');

  if (matched.length > 0) {
    console.log('\n히킹 카운트 상위 10명:');
    matched
      .sort(function(a, b) { return b.hikingCount - a.hikingCount; })
      .slice(0, 10)
      .forEach(function(m) {
        const flags = [m.col228 ? '228' : '', m.col229 ? '229' : '', m.col230 ? '230' : ''].filter(Boolean);
        console.log('  ' + m.name + ': 총 ' + m.hikingCount + '회' + (flags.length ? ' (2026: ' + flags.join(', ') + '회 참석)' : ''));
      });
  }
}

main().catch(function(err) {
  console.error('오류 발생:', err);
  process.exit(1);
});
