import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import {
  ApplicationConfig,
  isDevMode,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

// Indian digit grouping (1,23,456.00) for amounts.
registerLocaleData(localeEnIn);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // Hash URLs (/#/reports/ledger) so static hosting such as GitHub Pages never needs server rewrites.
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
    { provide: LOCALE_ID, useValue: 'en-IN' },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
  ],
};
