// salary-service API 진입점. 새 코드는 attendanceApi / salaryApi / salaryServiceApi 중 하나만 골라 쓰면 됨.
export { attendanceApi } from './attendanceApi';
export { salaryApi } from './salaryApi';

/** @deprecated 호환용. 가능하면 attendanceApi + salaryApi 쪽 import 권장 */
export { salaryServiceApi } from './salaryServiceApi';
