# GetDi

NN/g 기사를 수집하고 요약해 인스타그램 카드 초안을 만드는 로컬 도구입니다.

## 실행

Node.js 20 이상이 필요합니다.

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:5545](http://localhost:5545)를 엽니다.

번역·요약·초안 생성에는 로그인된 Claude Code가 필요합니다.
처음 사용하는 디자이너는 Claude Code에서 `/designer-guide`를 입력하세요.

## 사용 순서

1. 크롤링
2. 기사 선택
3. 요약본 만들기
4. 인스타 초안 만들기

## 자주 쓰는 명령

```bash
npm run crawl   # 기사 수집
npm test        # 테스트
npm run build   # 배포용 빌드
```

수집·번역·분석·초안과 공개용 스냅샷은 로컬에만 저장되며 Git에는
올라가지 않습니다.
코드, 테스트, 가이드와 개발일지만 버전 관리합니다.

자세한 설치와 사용법은 [디자이너 가이드](docs/designer-guide.md)를 참고하세요.
