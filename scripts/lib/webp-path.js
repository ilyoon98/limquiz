const fs = require('fs');
const path = require('path');

function fileExists(root, relPath) {
  return Boolean(relPath) && fs.existsSync(path.join(root, relPath.replace(/^\.\//, '')));
}

// CharacterTable.xlsx 등 원본 데이터는 항상 .png 경로를 담고 있다(신규 인격이
// 계속 .png로 들어오기 때문). scripts/convert-images-to-webp.js가 같은 이름의
// .webp를 만들어두면, 빌드 시점에 실제로 존재하는 .webp를 우선 사용하도록 경로를
// 바꿔치기한다. .webp가 아직 없으면(변환 전 신규 이미지) 원래 .png 경로를 그대로
// 반환해 빌드가 깨지지 않게 한다.
function preferWebp(root, relPath) {
  if (!relPath || !/\.png$/i.test(relPath)) return relPath;
  const webpPath = relPath.replace(/\.png$/i, '.webp');
  return fileExists(root, webpPath) ? webpPath : relPath;
}

module.exports = { fileExists, preferWebp };
