import { CheckCircleOutlined } from '@ant-design/icons';
import { Collapse, Typography } from 'antd';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';
import { AppButton } from '@/shared/ui/AppButton';

/** Pexels 영상 8033299 (다운로드 페이지와 동일 CDN, 25fps HD 경로가 브라우저에서 안정적으로 재생됨) */
const HERO_VIDEO_SRC =
  'https://videos.pexels.com/video-files/8033299/8033299-hd_1920_1080_25fps.mp4';

const FAQS = [
  {
    key: '1',
    label: 'WORKFORCE는 어떤 기업을 위한 서비스인가요?',
    children:
      '스타트업부터 중견·중소기업까지 모든 규모에서 사용할 수 있는 유연한 HR 플랫폼입니다.',
  },
  {
    key: '2',
    label: '기존에 사용하던 데이터는 어떻게 옮길 수 있나요?',
    children: '담당 매니저가 안전하고 신속하게 기존 데이터를 마이그레이션해 드립니다.',
  },
  {
    key: '3',
    label: '보안은 안전한가요?',
    children: '최신 보안 기술을 적용하여 고객의 소중한 정보를 안전하게 보호합니다.',
  },
  {
    key: '4',
    label: '요금은 어떻게 되나요?',
    children: '기업 규모와 필요 기능에 따라 맞춤형 요금제를 제공합니다. 자세한 내용은 문의해 주세요.',
  },
] as const;

function ScrollReveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setVisible(true);
          else setVisible(false);
        });
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={twMerge(
        'tw-transition-[opacity,transform] tw-duration-700 tw-ease-out',
        visible ? 'tw-opacity-100 tw-translate-y-0' : 'tw-opacity-0 tw-translate-y-8',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 홈(`/`) 인덱스 라우트: 헤더는 `HomePublicLayout`에 있고, 여기는 랜딩 본문만 렌더링합니다. */
export function LandingHomePage() {
  const navigate = useNavigate();

  const goToOnboarding = () => {
    void navigate({ to: '/company/onboarding' });
  };

  return (
    <div className="tw-overflow-x-hidden">
      <header className="tw-relative tw-flex tw-min-h-[90vh] tw-items-center tw-justify-center tw-overflow-hidden tw-px-5 tw-pt-24">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="tw-absolute tw-inset-0 tw-z-0 tw-h-full tw-w-full tw-object-cover"
        >
          <source src={HERO_VIDEO_SRC} type="video/mp4" />
        </video>
        <div className="tw-absolute tw-inset-0 tw-z-[1] tw-bg-slate-50/60" aria-hidden />
        <div className="tw-relative tw-z-[2] tw-mx-auto tw-max-w-3xl tw-text-center">
          <Typography.Title
            level={1}
            className="!tw-mb-4 !tw-text-[2.25rem] !tw-font-extrabold !tw-leading-tight !tw-text-slate-900 md:!tw-text-5xl"
          >
            혁신적인 HR 솔루션, WORKFORCE
          </Typography.Title>
          <p className="tw-mb-10 tw-text-base tw-leading-relaxed tw-text-slate-600 md:tw-text-lg">
            인사 관리의 모든 것을 하나의 플랫폼에서 경험하세요.
          </p>
          <AppButton type="primary" size="large" className="tw-h-12 tw-min-w-[200px] tw-px-10 tw-text-base" onClick={goToOnboarding}>
            무료로 시작하기
          </AppButton>
        </div>
      </header>

      <main id="features" className="tw-py-16 md:tw-py-24">
        <ScrollReveal className="tw-mx-auto tw-grid tw-max-w-6xl tw-items-stretch tw-gap-10 tw-px-5 tw-py-12 md:tw-grid-cols-2 md:tw-gap-16">
          <div>
            <h2 className="tw-mb-4 tw-text-2xl tw-font-bold tw-text-slate-900 md:tw-text-3xl">간편한 근태 관리</h2>
            <p className="tw-mb-8 tw-text-base tw-leading-relaxed tw-text-slate-600">
              출퇴근 기록, 휴가 신청 및 승인, 근무 시간 관리까지. WORKFORCE로 복잡한 근태 관리를 한 번에 해결하세요.
            </p>
            <ul className="tw-space-y-3 tw-pl-0">
              {['실시간 출퇴근 현황', '유연한 근무 정책 설정', '간편한 휴가 신청 및 승인'].map((t) => (
                <li key={t} className="tw-flex tw-items-start tw-gap-2 tw-text-slate-800">
                  <CheckCircleOutlined className="tw-mt-0.5 tw-text-[#2563EB]" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="tw-relative tw-h-full tw-min-h-[220px] tw-w-full tw-min-w-0 tw-self-stretch tw-overflow-hidden tw-rounded-2xl tw-shadow-xl tw-shadow-slate-900/10 tw-ring-1 tw-ring-slate-200/80">
            <img
              src="https://images.unsplash.com/photo-1552664730-d307ca884978?q=80&w=2070&auto=format&fit=crop"
              alt=""
              className="tw-absolute tw-inset-0 tw-h-full tw-w-full tw-object-cover"
            />
          </div>
        </ScrollReveal>

        <ScrollReveal className="tw-mx-auto tw-grid tw-max-w-6xl tw-items-stretch tw-gap-10 tw-px-5 tw-py-12 md:tw-grid-cols-2 md:tw-gap-16">
          <div className="tw-order-2 md:tw-order-1">
            <h2 className="tw-mb-4 tw-text-2xl tw-font-bold tw-text-slate-900 md:tw-text-3xl">자동화된 급여 정산</h2>
            <p className="tw-mb-8 tw-text-base tw-leading-relaxed tw-text-slate-600">
              더 이상 복잡한 엑셀 작업은 그만. 클릭 몇 번으로 급여 계산부터 이체, 명세서 발급까지 처리합니다.
            </p>
            <ul className="tw-space-y-3 tw-pl-0">
              {['자동 세금 및 4대 보험 계산', '원클릭 급여 이체', '개인별 급여 명세서 자동 발급'].map((t) => (
                <li key={t} className="tw-flex tw-items-start tw-gap-2 tw-text-slate-800">
                  <CheckCircleOutlined className="tw-mt-0.5 tw-text-[#2563EB]" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="tw-relative tw-order-1 tw-min-h-[220px] tw-h-full tw-w-full tw-min-w-0 tw-overflow-hidden tw-rounded-2xl tw-shadow-xl tw-shadow-slate-900/10 tw-ring-1 tw-ring-slate-200/80 md:tw-order-2">
            <img
              src="https://images.unsplash.com/photo-1554224155-1696413565d3?q=80&w=2070&auto=format&fit=crop"
              alt=""
              className="tw-absolute tw-inset-0 tw-h-full tw-w-full tw-object-cover"
            />
          </div>
        </ScrollReveal>

        <ScrollReveal className="tw-mx-auto tw-grid tw-max-w-6xl tw-items-stretch tw-gap-10 tw-px-5 tw-py-12 md:tw-grid-cols-2 md:tw-gap-16">
          <div>
            <h2 className="tw-mb-4 tw-text-2xl tw-font-bold tw-text-slate-900 md:tw-text-3xl">스마트한 전자결재</h2>
            <p className="tw-mb-8 tw-text-base tw-leading-relaxed tw-text-slate-600">
              모바일에서도 가능한 전자결재로 언제 어디서든 신속하게 의사를 결정하고 업무를 처리할 수 있습니다.
            </p>
            <ul className="tw-space-y-3 tw-pl-0">
              {['커스텀 결재 양식 설정', '실시간 결재 상태 알림', '모바일 완벽 지원'].map((t) => (
                <li key={t} className="tw-flex tw-items-start tw-gap-2 tw-text-slate-800">
                  <CheckCircleOutlined className="tw-mt-0.5 tw-text-[#2563EB]" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="tw-relative tw-h-full tw-min-h-[220px] tw-w-full tw-min-w-0 tw-self-stretch tw-overflow-hidden tw-rounded-2xl tw-shadow-xl tw-shadow-slate-900/10 tw-ring-1 tw-ring-slate-200/80">
            <img
              src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=2071&auto=format&fit=crop"
              alt=""
              className="tw-absolute tw-inset-0 tw-h-full tw-w-full tw-object-cover"
            />
          </div>
        </ScrollReveal>

        <ScrollReveal className="tw-mx-auto tw-grid tw-max-w-6xl tw-items-stretch tw-gap-10 tw-px-5 tw-py-12 md:tw-grid-cols-2 md:tw-gap-16">
          <div className="tw-order-2 md:tw-order-1">
            <h2 className="tw-mb-4 tw-text-2xl tw-font-bold tw-text-slate-900 md:tw-text-3xl">지능형 HR AI 챗봇</h2>
            <p className="tw-mb-8 tw-text-base tw-leading-relaxed tw-text-slate-600">
              인사 규정·복리후생·업무 절차를 물으면 대화로 바로 안내합니다. 필요한 메뉴와 문서로 이어져 반복 질문을 줄이고 업무 속도를 높입니다.
            </p>
            <ul className="tw-space-y-3 tw-pl-0">
              {['정책·규정을 자연어로 질문하고 즉시 답변', '대화형 안내로 필요한 화면·기능까지 연결', '업무 시간에 맞춰 활용 가능한 내부 도우미'].map((t) => (
                <li key={t} className="tw-flex tw-items-start tw-gap-2 tw-text-slate-800">
                  <CheckCircleOutlined className="tw-mt-0.5 tw-text-[#2563EB]" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="tw-relative tw-order-1 tw-min-h-[220px] tw-h-full tw-w-full tw-min-w-0 tw-overflow-hidden tw-rounded-2xl tw-shadow-xl tw-shadow-slate-900/10 tw-ring-1 tw-ring-slate-200/80 md:tw-order-2">
            <img
              src="https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=2070&auto=format&fit=crop"
              alt=""
              className="tw-absolute tw-inset-0 tw-h-full tw-w-full tw-object-cover"
            />
          </div>
        </ScrollReveal>

        <ScrollReveal className="tw-mx-auto tw-grid tw-max-w-6xl tw-items-stretch tw-gap-10 tw-px-5 tw-py-12 md:tw-grid-cols-2 md:tw-gap-16">
          <div>
            <h2 className="tw-mb-4 tw-text-2xl tw-font-bold tw-text-slate-900 md:tw-text-3xl">명확한 성과평가 관리</h2>
            <p className="tw-mb-8 tw-text-base tw-leading-relaxed tw-text-slate-600">
              목표 설정부터 자기평가, 평가 결과 확인까지 한 흐름으로 관리합니다. 구성원의 성장과 보상 의사결정을 더 투명하게 연결하세요.
            </p>
            <ul className="tw-space-y-3 tw-pl-0">
              {['평가 시즌 및 대상자 관리', '목표·자기평가 진행 현황 확인', '평가 결과와 피드백 체계화'].map((t) => (
                <li key={t} className="tw-flex tw-items-start tw-gap-2 tw-text-slate-800">
                  <CheckCircleOutlined className="tw-mt-0.5 tw-text-[#2563EB]" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="tw-relative tw-h-full tw-min-h-[220px] tw-w-full tw-min-w-0 tw-self-stretch tw-overflow-hidden tw-rounded-2xl tw-shadow-xl tw-shadow-slate-900/10 tw-ring-1 tw-ring-slate-200/80">
            <img
              src="https://images.unsplash.com/photo-1556761175-b413da4baf72?q=80&w=2074&auto=format&fit=crop"
              alt=""
              className="tw-absolute tw-inset-0 tw-h-full tw-w-full tw-object-cover"
            />
          </div>
        </ScrollReveal>
      </main>

      <section id="faq" className="tw-bg-slate-50 tw-py-16 md:tw-py-24">
        <ScrollReveal className="tw-mx-auto tw-max-w-3xl tw-px-5">
          <h2 className="tw-mb-10 tw-text-center tw-text-2xl tw-font-bold tw-text-slate-900 md:tw-text-3xl">자주 묻는 질문</h2>
          <Collapse
            accordion
            bordered={false}
            className="tw-rounded-2xl tw-bg-white tw-px-2 tw-py-1 tw-shadow-md tw-shadow-slate-900/5 tw-ring-1 tw-ring-slate-200/80"
            items={[...FAQS]}
          />
        </ScrollReveal>
      </section>

      <ScrollReveal className="tw-bg-[#2563EB] tw-py-16 tw-text-center tw-text-white md:tw-py-24">
        <h2 className="tw-mb-4 tw-text-2xl tw-font-bold md:tw-text-3xl">지금 바로 WORKFORCE를 시작하세요</h2>
        <p className="tw-mb-10 tw-text-base tw-opacity-90 md:tw-text-lg">복잡한 인사 관리, WORKFORCE로 해결할 수 있습니다.</p>
        <AppButton
          variant="secondary"
          size="large"
          className="tw-h-12 tw-min-w-[200px] !tw-border-0 !tw-bg-white !tw-text-[#2563EB] !tw-shadow-none hover:!tw-bg-slate-100 hover:!tw-text-[#1D4ED8]"
          onClick={goToOnboarding}
        >
          무료로 시작하기
        </AppButton>
      </ScrollReveal>

      <footer className="tw-bg-slate-900 tw-py-12 tw-text-slate-300">
        <div className="tw-mx-auto tw-flex tw-max-w-6xl tw-flex-col tw-items-center tw-justify-between tw-gap-6 tw-px-5 md:tw-flex-row">
          <p className="tw-m-0 tw-text-sm">© 2026 WORKFORCE. All rights reserved.</p>
          <div className="tw-flex tw-gap-8 tw-text-sm tw-font-medium">
            <a href="#" className="tw-text-inherit tw-no-underline hover:tw-text-white">
              이용약관
            </a>
            <a href="#" className="tw-text-inherit tw-no-underline hover:tw-text-white">
              개인정보처리방침
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
