// PNG -> WebP 일괄 변환 스크립트.
//
// images/ 아래 새 .png가 계속 추가되는 걸 전제로 만들어졌다: 이미 .webp로
// 변환된 파일은 건너뛰고, 새로 추가되거나 원본이 갱신된 .png만 변환한다.
// 변환은 sharp(로컬 이미지 처리 라이브러리)로 이 컴퓨터에서만 수행되며 외부
// 서비스로 파일을 보내지 않는다 — 원본 .png는 이미 로컬에 있고, 결과 .webp도
// 그대로 이 저장소의 파일이 된다.
//
// 변환 후 원본 .png는 삭제한다(용량 절감이 목적이므로). CharacterTable.xlsx
// 등 소스 데이터가 .png 경로를 가리켜도, scripts/lib/webp-path.js가 빌드
// 시점에 .webp로 자동 치환하므로 참조가 깨지지 않는다.
//
// 사용법:
//   node scripts/convert-images-to-webp.js            변환 + 원본 삭제
//   node scripts/convert-images-to-webp.js --keep-png  원본 보존(검증용)
//   node scripts/convert-images-to-webp.js --dir=images/identities  특정 폴더만

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const keepPng = args.includes('--keep-png');
const dirArg = args.find(a => a.startsWith('--dir='));
const targetDir = path.join(ROOT, dirArg ? dirArg.slice('--dir='.length) : 'images');
const QUALITY = 85;

function walkPngFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...walkPngFiles(full));
    else if (name.isFile() && /\.png$/i.test(name.name)) out.push(full);
  }
  return out;
}

function needsConversion(pngPath, webpPath) {
  if (!fs.existsSync(webpPath)) return true;
  return fs.statSync(pngPath).mtimeMs > fs.statSync(webpPath).mtimeMs;
}

async function convertOne(pngPath) {
  const webpPath = pngPath.replace(/\.png$/i, '.webp');
  if (!needsConversion(pngPath, webpPath)) return null;

  const beforeSize = fs.statSync(pngPath).size;
  await sharp(pngPath).webp({ quality: QUALITY }).toFile(webpPath);
  const afterSize = fs.statSync(webpPath).size;

  if (!keepPng) fs.unlinkSync(pngPath);

  return { pngPath, webpPath, beforeSize, afterSize };
}

async function main() {
  if (!fs.existsSync(targetDir)) {
    console.error(`✗ 대상 폴더가 없습니다: ${path.relative(ROOT, targetDir)}`);
    process.exit(1);
  }

  const pngFiles = walkPngFiles(targetDir);
  console.log(`검사 대상 PNG ${pngFiles.length}개 (${path.relative(ROOT, targetDir)})`);

  let converted = 0, skipped = 0, failed = 0;
  let beforeTotal = 0, afterTotal = 0;

  for (const pngPath of pngFiles) {
    const rel = path.relative(ROOT, pngPath);
    try {
      const result = await convertOne(pngPath);
      if (!result) { skipped++; continue; }
      converted++;
      beforeTotal += result.beforeSize;
      afterTotal += result.afterSize;
      const savedPct = ((1 - result.afterSize / result.beforeSize) * 100).toFixed(0);
      console.log(`✓ ${rel} → ${path.basename(result.webpPath)} (${savedPct}% 감소)`);
    } catch (e) {
      failed++;
      console.error(`✗ 변환 실패: ${rel} — ${e.message}`);
    }
  }

  console.log('---');
  console.log(`변환 ${converted}개, 건너뜀(이미 최신 webp 있음) ${skipped}개, 실패 ${failed}개`);
  if (converted) {
    const mb = n => (n / 1024 / 1024).toFixed(1);
    console.log(`용량: ${mb(beforeTotal)}MB → ${mb(afterTotal)}MB (${mb(beforeTotal - afterTotal)}MB 절감)`);
  }
  if (keepPng) console.log('ℹ --keep-png 옵션으로 원본 PNG를 보존했습니다.');
  if (failed) process.exit(1);
}

main();
