/**
 * 로그인·비밀번호 재설정 등과 동일한 백엔드 정책.
 * 영문·숫자·특수문자(@$!%*#?&) 조합, 8자 이상 20자 이하.
 */
export const PASSWORD_POLICY_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,20}$/;

export const PASSWORD_POLICY_RULE_MESSAGE =
  '8~20자이며 영문·숫자·특수문자(@$!%*#?&)를 모두 포함해야 합니다.';
