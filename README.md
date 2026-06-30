# 림버스 인격 두들

림버스 컴퍼니 인격을 맞히는 웹 기반 추리 게임입니다.

## 인격 데이터 수정 방법

`CharacterTable.xlsx` 파일만 편집하고 git에 push하면 됩니다.  
Vercel이 빌드 시 자동으로 `data.json`을 다시 생성해서 반영합니다.  
`index.html`을 직접 수정할 필요는 없습니다.

### 엑셀 파일 구조

- 파일명: `CharacterTable.xlsx`
- 시트: `CharacterData` (변환 대상)
- 컬럼: `수감자`, `인격명`, `성급`, `키워드1`, `키워드2`, `키워드3`
- 시트 `출처_메모`는 변환에서 제외됩니다.

## 로컬 개발

```bash
npm install
npm run build   # data.json 생성
npx serve .     # 로컬 서버 실행 후 http://localhost:3000 접속
```

## 배포

```bash
vercel --prod
```
