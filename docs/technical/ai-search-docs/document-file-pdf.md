# 문서·파일·PDF 처리

## 개요

WORKFORCE는 HR 문서, 계약서, 결재 첨부, 채팅 파일, 급여명세서, 평가 리포트 등 여러 종류의 파일을 다룹니다. 저장은 S3를 기본으로 하고, 도메인별로 PDF 생성 또는 presigned URL을 조합합니다.

## 파일 처리 영역

| 영역 | 처리 |
|------|------|
| 프로필/일반 파일 | 공통 `S3Uploader` 사용 |
| 채팅 첨부 | 업로드, confirm, 다운로드 프록시, presigned URL |
| 계약서 | 서명 완료 후 PDF 생성 및 저장 |
| 결재 첨부 | 결재 문서와 첨부 파일 연결 |
| 급여명세서 | PDF 생성 및 다운로드 |
| 평가 리포트 | HTML/PDF 기반 리포트 생성 |
| AI 정책 문서 | 업로드 후 텍스트 추출, chunking, vector DB 저장 |

## PDF 생성

- approval-service는 계약/결재 문서 PDF 생성을 담당합니다.
- salary-service는 급여명세서 PDF를 생성합니다.
- goal-service는 평가 리포트 생성에 HTML-to-PDF 계열 라이브러리를 사용합니다.

## 보안 고려

- 파일 URL은 가능하면 직접 공개 URL 대신 presigned URL 또는 서버 프록시를 사용합니다.
- 회사 ID와 사용자 권한을 확인한 뒤 다운로드 경로를 제공합니다.
- 채팅 이미지처럼 브라우저가 Authorization 헤더를 붙이기 어려운 경우 별도 다운로드 프록시가 필요합니다.
