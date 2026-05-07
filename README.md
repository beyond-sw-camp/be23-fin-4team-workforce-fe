<div align="center">
<img width="845" alt="WORKFORCE" src="https://github.com/user-attachments/assets/a8d3b7b8-4880-491f-9073-0dad92340ea5" />

**중소·중견기업을 위한 AI 챗봇 기반 맞춤형 인사관리 플랫폼**
  
</div>

<hr>


## 팀원 소개

<div align="center">

| ![김정훈](url1) | ![박세민](url2) | ![이다은](url3) | ![이지연](url4) |
|----------------|-----------------|-----------------|-----------------|
| [김정훈](github1) | [박세민](github1) | [@leeda973](https://github.com/leeda973) | [이지연](github1) |

</div>

---

## 목차

1. [프로젝트 배경 & 기획 의도](#프로젝트-배경--기획-의도)
2. [주요 기능](#주요-기능)
3. [시스템 아키텍처](#시스템-아키텍처)
4. [기술 스택](#기술-스택)
5. [화면 설계 & 주요 화면](#화면-설계--주요-화면)
6. [AI 기능](#ai-기능)
7. [트러블슈팅](#트러블슈팅)

---


## 프로젝트 배경 & 기획 의도

자체 인사관리 시스템을 구축하기 어려운 중소·중견기업은 시중 프로그램을 도입하더라도 우리 회사 정책과 맞지 않거나, 기능이 복잡해 제대로 활용하지 못하는 문제가 있습니다.

**WORKFORCE**는 회사별 정책에 맞게 설정하여 사용할 수 있고, 사용 중 어려운 부분은 AI 챗봇에게 물어보며 쉽게 해결할 수 있는 인사관리 플랫폼입니다.

<details>
<summary><strong>기존 인사관리 프로그램의 문제점</strong></summary>

| 문제 | 해결 |
|------|------|
| 실정에 맞는 정책 설정이 어렵다 | **회사 맞춤형 설정** — JSON 동적 폼 스키마로 결재 양식 자유 구성, 회사별 휴가 종류·공휴일·조직 구조 독립 관리 |
| 급여 항목이 복잡하고 수기 검증에 한계가 있다 | **급여·근태 자동화** — 급여 계산·상여금·퇴직금·세금·소급 정산 자동 처리, 연차 촉진 알림·52시간 초과근로 위반 감지 |
| IT 담당 인력이 부족하고 겸직 부담이 크다 | **AI 챗봇** — 사용법과 회사 정책을 자연어로 질문하면 우리 회사 상황에 맞는 답변 제공, 특정 담당자에게 질문이 몰리는 문제 해소 |
| 성과 관리가 체계적이지 않다 | **성과관리 풀사이클** — 목표 설정 → 활동 기록 → 평가 → 피드백 → 보정(Calibration)까지 하나의 흐름으로 관리 |
| 평균 5개의 개별 솔루션을 파편화된 상태로 운영한다 | **통합 플랫폼** — 결재, 계약, 근태, 급여, 목표/평가, ESG, 캘린더, 채팅까지 하나의 플랫폼에서 운영. 통합 검색(Elasticsearch)으로 흩어진 데이터를 한 번에 조회 |

</details>

또한 ESG 경영의 중요성이 높아지는 흐름에 맞춰, 인사관리 플랫폼 안에서 ESG 활동 신청/승인, 포인트 적립, 캠페인 관리, 포인트 교환까지 통합하여 별도 시스템 없이 직원 참여를 유도할 수 있도록 구성했습니다.

> 📎 [Figma 기획서 보기](https://www.figma.com/proto/6suak3PIQpHGzS3UBatOF1/%ED%95%9C%ED%99%94-BEYOND-SW-CAMP-23%EA%B8%B0?node-id=618-102&viewport=696%2C533%2C0.2&t=o5woH0kckAYE5DgS-1&scaling=min-zoom&content-scaling=fixed&starting-point-node-id=618%3A102&page-id=612%3A67) · [기획서 PDF 다운로드](docs/WORKFORCE_프로젝트_기획서.pdf)

<br>
<div align="right"><a href="#목차">맨 위로</a></div>

---

## 주요 기능

<details>
<summary><strong>조직 · 인사</strong></summary>

| 기능 | 설명 |
|------|------|
| 조직 관리 | 회사별 조직 구조, 직급(Job Grade), 직책(Job Title) 관리 |
| 역할·권한 | 13개 리소스 × 4개 액션 × 4단계 범위(본인/팀/부서/전사). 기본 역할 4개 자동 생성 + 커스텀 역할 추가 |
| 회사별 설정 | 공휴일, 휴가 종류, 근무 정책 등 회사별 독립 관리 |

</details>

<details>
<summary><strong>근태 · 급여</strong></summary>

| 기능 | 설명 |
|------|------|
| 근태 관리 | 출퇴근 기록, 연장·야간·휴일근무 신청, 출퇴근 정정, 조기퇴근, 외근/출장 관리 |
| 휴가 관리 | 회사별 휴가 종류 설정, 연차 잔고 자동 차감(Pessimistic Locking), 연차 사용 촉진 자동 알림 |
| 급여 자동 연산 | 급여 계산, 상여금, 퇴직금, 세금, 소급 정산까지 자동 처리. 근태/급여/상여 배치 모듈로 대량 데이터 처리 |
| 노동법 준수 | 근기법 제61조 연차 촉진 1차/2차 자동 알림, 주 52시간 초과근로 위반 감지, 근태 이상 실시간 감지 |

</details>

<details>
<summary><strong>결재 · 계약</strong></summary>

| 기능 | 설명 |
|------|------|
| 전자결재 | 결재 요청(상신) → 단계별 승인/반려 → 후속 처리 자동화. 임시저장, 결재 회수, 대리결재, 참조/공람 지원 |
| 동적 결재 양식 | JSON 기반 formSchema로 회사가 직접 결재 양식을 만들고 필드를 자유롭게 구성. text, date, select, textarea 등 다양한 필드 타입 지원 |
| 결재 후속 처리 | 승인 완료 시 요청 타입별 자동 처리 — 휴가 잔고 차감, 근태 정산 반영, 인사 발령 이력 생성, 캘린더 연동 등 |
| 전자계약 | 계약서 생성 → 발송 → 서명 → PDF 저장. 일괄 발송, 법인인감 자동 서명, 계약 재발행 이력 관리 |

</details>

<details>
<summary><strong>목표 · 평가</strong></summary>

| 기능 | 설명 |
|------|------|
| 목표 관리 | 목표 설정 → 활동 기록 → 진척률 관리 |
| 평가 관리 | 평가 시즌 관리, 평가 설계(Design), 다면 피드백, 부서 간 보정(Calibration) |
| 리포트 | 평가 결과 리포트 자동 생성 |

</details>

<details>
<summary><strong>ESG</strong></summary>

| 기능 | 설명 |
|------|------|
| ESG 활동 | 활동 신청/승인, 포인트 적립, 캠페인 관리 |
| 포인트 교환 | 적립 포인트로 물품 교환 쇼핑 |
| 참여 현황 | 인사 데이터 연동으로 부서별/직급별 ESG 참여 현황 분석 |

</details>

<details>
<summary><strong>협업 · 공통</strong></summary>

| 기능 | 설명 |
|------|------|
| 실시간 채팅 | WebSocket(STOMP) 기반 사내 메신저, 파일 공유 |
| 통합 검색 | Elasticsearch 기반으로 결재, 인사, 조직 등 흩어진 데이터를 한 번에 검색 |
| 알림 | Kafka → Redis Pub/Sub → SSE 파이프라인으로 결재·근태·계약 등 실시간 알림 |
| 캘린더 | 결재 승인 건 캘린더 자동 연동, 회사 공휴일 관리 |

</details>

<br>
<div align="right"><a href="#목차">맨 위로</a></div>

---

## 시스템 아키텍처

<!-- TODO: 아키텍처 다이어그램 이미지 -->

<br>
<div align="right"><a href="#목차">맨 위로</a></div>

---


## 기술 스택

### Backend - Spring
![Java](https://img.shields.io/badge/java-007396?style=for-the-badge&logo=java&logoColor=white)
![Spring Boot](https://img.shields.io/badge/spring%20boot-6DB33F?style=for-the-badge&logo=springboot&logoColor=white)
![Spring Security](https://img.shields.io/badge/spring%20security-6DB33F?style=for-the-badge&logo=springsecurity&logoColor=white)
![Spring Data JPA](https://img.shields.io/badge/spring%20data%20jpa-6DB33F?style=for-the-badge)
![JWT](https://img.shields.io/badge/jwt-000000?style=for-the-badge)
![Lombok](https://img.shields.io/badge/lombok-BC4521?style=for-the-badge)
![Gradle](https://img.shields.io/badge/gradle-02303A?style=for-the-badge&logo=gradle&logoColor=white)
![Swagger](https://img.shields.io/badge/swagger-85EA2D?style=for-the-badge&logo=swagger&logoColor=white)
![WebSocket](https://img.shields.io/badge/websocket-000000?style=for-the-badge&logo=socketdotio&logoColor=white)

### Backend - Python
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![ChatGPT](https://img.shields.io/badge/chatGPT-74aa9c?style=for-the-badge&logo=openai&logoColor=white)
![LangChain](https://img.shields.io/badge/langchain-%231C3C3C.svg?style=for-the-badge&logo=langchain&logoColor=white)

### Frontend
![Vue.js](https://img.shields.io/badge/vue.js-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white)
![Pinia](https://img.shields.io/badge/pinia-FFD859?style=for-the-badge)
![Vue Router](https://img.shields.io/badge/vue%20router-4FC08D?style=for-the-badge)
![Vite](https://img.shields.io/badge/vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Axios](https://img.shields.io/badge/axios-5A29E4?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/typescript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Chart.js](https://img.shields.io/badge/chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)
![HTML5](https://img.shields.io/badge/html5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-1572B6?style=for-the-badge&logo=css3&logoColor=white)

### Database
![MariaDB](https://img.shields.io/badge/mariadb-003545?style=for-the-badge&logo=mariadb&logoColor=white)
![Amazon RDS](https://img.shields.io/badge/amazon%20rds-527FFF?style=for-the-badge&logo=amazonrds&logoColor=white)

### Cloud / Infrastructure
![AWS](https://img.shields.io/badge/aws-232F3E?style=for-the-badge&logo=amazonaws&logoColor=white)
![AWS IAM](https://img.shields.io/badge/aws%20iam-FF9900?style=for-the-badge)
![Amazon S3](https://img.shields.io/badge/amazon%20s3-569A31?style=for-the-badge&logo=amazons3&logoColor=white)

### CI / CD
![GitHub Actions](https://img.shields.io/badge/github%20actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)

### Tools
![Git](https://img.shields.io/badge/git-F05032?style=for-the-badge&logo=git&logoColor=white)
![GitHub](https://img.shields.io/badge/github-181717?style=for-the-badge&logo=github)
![Notion](https://img.shields.io/badge/notion-000000?style=for-the-badge&logo=notion)
![Discord](https://img.shields.io/badge/discord-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![Figma](https://img.shields.io/badge/figma-F24E1E?style=for-the-badge&logo=figma&logoColor=white)

<br>
<div align="right"><a href="#목차">맨 위로</a></div>

---

## 화면 설계 & 주요 화면

- [Figma 전체 보기](https://www.figma.com/design/FftNc7FU8cuQZS2VnKm3NR/be23-fin-team4-workforce?node-id=0-1&t=AZ9PaJjekutgn9fR-1)

<!-- TODO: 주요 화면 스크린샷/GIF 추가 -->

<br>
<div align="right"><a href="#목차">맨 위로</a></div>

---

## AI 기능

<!-- TODO: RAG 챗봇, 결재 초안 자동 생성 등 AI 기능 소개 -->

<br>
<div align="right"><a href="#목차">맨 위로</a></div>

---

## 트러블슈팅

<!-- TODO: 주요 기술적 문제 → 원인 → 해결 사례 3개 정도 -->

<br>
<div align="right"><a href="#목차">맨 위로</a></div>

---

## 부록

- [ERD 전체 보기](https://www.erdcloud.com/d/Er4amBY2KpweBcKTk)
- [프로그램 사양서 및 단위테스트결과서](https://documenter.getpostman.com/view/51059789/2sBXqDrNZT)
- [요구사항 명세서](https://docs.google.com/spreadsheets/d/107CuIWefCSjBbwO0mnKdQJzK5WCFDKYtw5Rs18liJw8/edit?gid=63147339#gid=63147339)
- [WBS](https://docs.google.com/spreadsheets/d/107CuIWefCSjBbwO0mnKdQJzK5WCFDKYtw5Rs18liJw8/edit?gid=395838842#gid=395838842)
- [Figma 기획서](https://www.figma.com/proto/6suak3PIQpHGzS3UBatOF1/%ED%95%9C%ED%99%94-BEYOND-SW-CAMP-23%EA%B8%B0?node-id=618-102&viewport=696%2C533%2C0.2&t=o5woH0kckAYE5DgS-1&scaling=min-zoom&content-scaling=fixed&starting-point-node-id=618%3A102&page-id=612%3A67)
- [기획서 PDF](docs/WORKFORCE_프로젝트_기획서.pdf)
