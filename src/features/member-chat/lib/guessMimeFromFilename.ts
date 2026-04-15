/** 브라우저가 `File.type` 을 비워 두는 경우(일부 이미지·다운로드 폴더 파일) 확장자로 보완 */
export function guessMimeFromFilename(filename: string): string | undefined {
  const i = filename.lastIndexOf('.');
  if (i < 0) return undefined;
  const ext = filename.slice(i).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.pdf':
      return 'application/pdf';
    default:
      return undefined;
  }
}
