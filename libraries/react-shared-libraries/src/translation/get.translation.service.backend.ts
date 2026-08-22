import { cookies, headers } from 'next/headers';
import i18next from './i18next';
import { cookieName, fallbackLng, headerName, languages } from './i18n.config';

/**
 * The request's language, read from where `proxy.ts:52` already puts it.
 *
 * Without this every server component rendered English in every language. The
 * shared i18next instance is built with `lng: undefined` and
 * `i18next-browser-languagedetector`, which resolves nothing off the browser —
 * so `i18next.resolvedLanguage` is unset on the server and `getFixedT` fell
 * through to `fallbackLng` on every request. The header the proxy sets was
 * written and never read.
 *
 * `headers()`/`cookies()` throw outside a request scope (a build-time render),
 * so each read falls through to the next rather than taking the page down.
 */
async function requestLanguage(): Promise<string> {
  try {
    const fromHeader = (await headers()).get(headerName);
    if (fromHeader && languages.includes(fromHeader)) {
      return fromHeader;
    }
  } catch {
    /* no request scope — fall through */
  }

  try {
    const fromCookie = (await cookies()).get(cookieName)?.value;
    if (fromCookie && languages.includes(fromCookie)) {
      return fromCookie;
    }
  } catch {
    /* no request scope — fall through */
  }

  return i18next.resolvedLanguage || fallbackLng;
}

export async function getT(ns?: string, options?: any) {
  if (ns && !i18next.hasLoadedNamespace(ns)) {
    await i18next.loadNamespaces(ns);
  }
  return i18next.getFixedT(
    await requestLanguage(),
    Array.isArray(ns) ? ns[0] : ns,
    options?.keyPrefix
  );
}
