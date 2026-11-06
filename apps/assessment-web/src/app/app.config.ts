import { ApplicationConfig, InjectionToken, provideBrowserGlobalErrorListeners } from '@angular/core';

/**
 * Base URL of the content-addressed media (`af compile --assets`), e.g. a CDN.
 * Can be changed at deployment without a rebuild via `<meta name="af-asset-base" content="https://cdn…/af/">`
 * in index.html.
 */
export const ASSET_BASE = new InjectionToken<string>('ASSET_BASE', {
  providedIn: 'root',
  factory: () => document.querySelector<HTMLMetaElement>('meta[name="af-asset-base"]')?.content || 'assets/'
});

/** Root application config. */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners()]
};
