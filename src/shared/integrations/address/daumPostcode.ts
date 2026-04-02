declare global {
  interface Window {
    daum?: {
      Postcode: new (options: { oncomplete: (data: DaumPostcodeResult) => void }) => { open: () => void };
    };
  }
}

export type DaumPostcodeResult = {
  zonecode: string;
  address: string;
  buildingName?: string;
};

const DAUM_POSTCODE_SCRIPT_URL = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

let loadingPromise: Promise<void> | null = null;

function loadDaumPostcodeScript() {
  if (window.daum?.Postcode) {
    return Promise.resolve();
  }
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = DAUM_POSTCODE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('주소 검색 스크립트 로드에 실패했습니다.'));
    document.body.appendChild(script);
  });

  return loadingPromise;
}

export async function openDaumPostcode() {
  await loadDaumPostcodeScript();

  return new Promise<DaumPostcodeResult>((resolve, reject) => {
    if (!window.daum?.Postcode) {
      reject(new Error('주소 검색 모듈을 사용할 수 없습니다.'));
      return;
    }
    new window.daum.Postcode({
      oncomplete: (data) => resolve(data),
    }).open();
  });
}
