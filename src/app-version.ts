// 화면에 표시하는 앱 버전 (package.json의 version 한 곳에서 관리)
// 이름 있는 가져오기라 번들에는 version 값만 들어갑니다.
import { version } from '../package.json';

export const APP_VERSION: string = version;
