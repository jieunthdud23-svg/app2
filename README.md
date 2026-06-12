# 약속(藥束) - 스마트 복약 관리

별도 빌드 과정 없이 GitHub와 Vercel에 바로 올릴 수 있는 정적 웹앱입니다.

## 포함 기능

- 이메일 회원가입/로그인, Google 로그인
- 사용자 기본 정보와 보호자 연락처 관리
- 복용약 등록, 수정, 삭제
- 오늘 복용 일정과 복용 완료/건너뛰기 기록
- 복용 성공률과 복용 이력
- 혈압/혈당 입력과 최근 추이 그래프
- 브라우저가 열린 상태에서 복용 시간 알림
- Firebase 설정 전 `localStorage` 데모 모드

## Firebase 연결

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트를 만듭니다.
2. `Authentication > Sign-in method`에서 `이메일/비밀번호`와 `Google`을 사용 설정합니다.
3. `Realtime Database`를 만들고 위치를 선택합니다.
4. 프로젝트 설정에서 웹 앱을 추가한 뒤 SDK 설정값을 `firebase-config.js`에 붙여 넣습니다.
5. Realtime Database의 `규칙` 탭에 `database.rules.json` 내용을 붙여 넣고 게시합니다.
6. `Authentication > Settings > Authorized domains`에 배포할 Vercel 도메인을 추가합니다.

`firebase-config.js`의 웹 설정값은 비밀번호가 아닙니다. 데이터 보호는 반드시 `database.rules.json`과 Authentication으로 적용합니다.

## GitHub에 올리기

이 폴더 안의 파일을 GitHub 저장소 최상위에 그대로 올립니다. `node_modules`, 빌드, 압축 해제 과정이 없습니다.

## Vercel 게시

1. Vercel에서 `Add New > Project`를 선택합니다.
2. GitHub 저장소를 연결합니다.
3. Framework Preset은 `Other`, Build Command는 비워 둡니다.
4. Output Directory는 `.`으로 지정하고 배포합니다.

## 알림 범위

현재 버전은 앱 페이지가 열려 있을 때 브라우저 알림을 제공합니다. 앱이 닫혀 있어도 오는 푸시 알림은 Firebase Cloud Messaging, 서비스 워커, 서버 측 예약 발송 기능을 추가해야 합니다.

## 카카오 로그인

Firebase Authentication은 카카오를 기본 로그인 제공자로 지원하지 않습니다. 카카오 로그인은 카카오 OAuth 결과를 검증한 뒤 Firebase Custom Token을 발급하는 안전한 서버 함수가 추가로 필요합니다. 이 정적 MVP에는 이메일과 Google 로그인이 포함되어 있습니다.

## 의료 안내

표시되는 혈압·혈당 메시지는 기록 보조용이며 진단이 아닙니다. 이상 수치가 반복되거나 증상이 있으면 의료진과 상담해야 합니다.
