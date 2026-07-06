import * as SplashScreen from "expo-splash-screen";

// Zaman çizelgesi (root layout preventAutoHideAsync çağırıyor):
//   1. Native splash görünür (JS yüklenirken).
//   2. JS klon katmanı (placeholder / login cover) native'in ALTINDA çizilir
//      ve releaseNativeSplash() çağırır.
//   3. Native splash, minimum gösterim süresi VE klonun altta en az
//      CLONE_OVERLAP_MS beklemesi sağlandıktan sonra kapatılır.
//   4. Promise resolve olur → animasyon zinciri başlar.
const MIN_NATIVE_SPLASH_MS = 600;
const CLONE_OVERLAP_MS = 250;

const jsLoadedAtMs = Date.now();
let releasePromise: Promise<void> | null = null;

export function releaseNativeSplash(): Promise<void> {
  if (!releasePromise) {
    const sinceJsLoad = Date.now() - jsLoadedAtMs;
    const wait = Math.max(MIN_NATIVE_SPLASH_MS - sinceJsLoad, CLONE_OVERLAP_MS);
    releasePromise = new Promise((resolve) => {
      setTimeout(() => {
        SplashScreen.hideAsync()
          .catch(() => {})
          .finally(resolve);
      }, wait);
    });
  }
  return releasePromise;
}

// Splash → ilk ekran geçiş animasyonu yalnızca uygulama açılışında bir kez
// oynamalı. İlk mount olan ekran hakkı "claim" eder; sonraki mount'lar
// (logout → login, onboarding → login) animasyonu atlar.
let claimed = false;

export function claimSplashHandoff(): boolean {
  if (claimed) return false;
  claimed = true;
  // JS başlangıcından çok sonra mount olan ekran splash'ten gelmiyordur.
  return Date.now() - jsLoadedAtMs < 8000;
}
