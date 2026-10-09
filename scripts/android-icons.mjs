// 안드로이드 테스트 앱 아이콘·시작 화면 생성
// 원본: assets/app-icon-source.png (정사각형 픽셀아트, 600×600 이상)
// 1) @capacitor/assets 입력 이미지를 만들고 2) 안드로이드 리소스를 생성한 뒤
// 3) 세로 고정 앱에서 쓰지 않는 가로·다크 모드·ldpi 시작 화면을 지웁니다(APK 용량 절약).
// 사용: npm run icons:android
import { execSync } from 'node:child_process';
import { rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const SOURCE = 'assets/app-icon-source.png';
const BACKGROUND = '#FDF3CA'; // 원본 그림의 크림색 바탕
const BG = { r: 253, g: 243, b: 202, alpha: 1 };

async function centered(size, artSize, out) {
  // 픽셀아트가 번지지 않도록 nearest로 확대합니다.
  const art = await sharp(SOURCE).resize(artSize, artSize, { kernel: 'nearest' }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(out);
}

// 레거시 아이콘(안드로이드 7 이하): 원본 그대로
await sharp(SOURCE).resize(1024, 1024, { kernel: 'nearest' }).png().toFile('assets/icon-only.png');
// 적응형 아이콘 전경: @capacitor/assets가 16.7% 안쪽 여백을 따로 주므로 그림은 85%로만 줄입니다.
// 원형 마스크에서도 지붕·랜턴·화분이 잘리지 않는 크기입니다.
await centered(1024, 870, 'assets/icon-foreground.png');
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } }).png().toFile('assets/icon-background.png');
// 시작 화면: 크림 바탕 가운데에 그림
await centered(2732, 900, 'assets/splash.png');

const colors = ['--iconBackgroundColor', '--iconBackgroundColorDark', '--splashBackgroundColor', '--splashBackgroundColorDark']
  .map((flag) => `${flag} "${BACKGROUND}"`)
  .join(' ');
execSync(`npx capacitor-assets generate --android ${colors}`, { stdio: 'inherit' });

const res = 'android/app/src/main/res';
for (const dir of readdirSync(res)) {
  if (/^drawable-(land|night|port-night|port-ldpi)/.test(dir) || dir === 'drawable-night' || dir === 'mipmap-ldpi') {
    rmSync(join(res, dir), { recursive: true, force: true });
  }
}
console.log('안드로이드 아이콘·시작 화면을 갱신했습니다.');
