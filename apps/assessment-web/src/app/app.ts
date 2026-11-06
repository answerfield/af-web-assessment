import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { bundleProblem, type Bundle } from '@answerfield/bundle';
import type { BookletSnapshot } from '@answerfield/angular';
import { Start, type BookletEntry, type StartRequest } from './start';
import { Run } from './run';
import { Preview } from './preview';
import { SessionStore, type StoredSession } from './session-store';

type Screen = 'loading' | 'start' | 'run' | 'preview' | 'end';

/**
 * Web assessment in the browser, currently serverless: responses and state stay in local storage and can be
 * exported as a file at the end.
 */
@Component({
    selector: 'app-root',
    imports: [Start, Run, Preview],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
      @switch (screen()) {
        @case ('loading') { <p class="card" role="status">Lade …</p> }
        @case ('start') { <app-start [booklets]="booklets()" (start)="begin($event)" (preview)="preview($event)" /> }
        @case ('preview') { <app-preview [bundle]="bundle()!" [name]="previewName()" (close)="restart()" /> }
        @case ('run') {
          <app-run [bundle]="bundle()!" [name]="session()!.booklet" [profile]="session()!.profile"
                   [restore]="session()!.snapshot" (snapshot)="store($event)" (finished)="end()" />
        }
        @case ('end') {
          <main class="card">
            <h1>Der Test ist beendet</h1>
            @if (!results()) { <p>Die Ergebnisse dieser Sitzung sind nicht mehr verfügbar.</p> }
            <p>Vielen Dank! Testcode <strong>{{ session()?.code }}</strong>.</p>
            <button type="button" class="primary" (click)="download()" [disabled]="!results()">Ergebnisse herunterladen</button>
            <button type="button" (click)="restart()">Neue Sitzung</button>
          </main>
        }
      }
      @if (message()) { <p class="card error" role="alert">{{ message() }}</p> }
    `
})
export class App {
    private readonly store_ = inject(SessionStore);
    private readonly run = viewChild(Run);

    readonly screen = signal<Screen>('loading');
    readonly booklets = signal<BookletEntry[]>([]);
    readonly bundle = signal<Bundle | undefined>(undefined);
    readonly session = signal<StoredSession | undefined>(undefined);
    readonly message = signal('');
    readonly previewName = signal('');
    /** Results captured on finish (for export); also kept in the stored session. */
    readonly results = signal<unknown>(undefined);

    constructor() {
        void this.init();
    }

    private async init(): Promise<void> {
        try {
            this.booklets.set(await json<BookletEntry[]>('bundles/index.json'));
        } catch {
            this.message.set('Testhefte konnten nicht geladen werden.');
        }
        // Resume after reload: the running test, or the end screen with its results
        const current = this.store_.current;
        const saved = current && this.store_.load(current.code, current.booklet);
        if (saved?.finished) return this.showEnd(saved);
        if (saved) {
            await this.open(saved);
            return;
        }
        this.store_.current = undefined;
        this.screen.set('start');
    }

    /** Starts or resumes the session for a test code and booklet. */
    async begin(request: StartRequest): Promise<void> {
        const existing = this.store_.load(request.code, request.entry.booklet);
        // A finished test is never silently overwritten: show its end screen and results
        if (existing?.finished) {
            this.store_.current = { code: existing.code, booklet: existing.booklet };
            return this.showEnd(existing, 'Mit diesem Testcode ist das Testheft bereits beendet.');
        }
        const session: StoredSession = existing ?? {
            code: request.code, booklet: request.entry.booklet, file: request.entry.file,
            profile: request.profile, sha256: request.entry.sha256, startedAt: new Date().toISOString()
        };
        await this.open(session);
    }

    private showEnd(session: StoredSession, message = ''): void {
        this.session.set(session);
        this.results.set(session.results);
        this.message.set(message);
        this.screen.set('end');
    }

    private async open(session: StoredSession): Promise<void> {
        try {
            const bundle = await json<Bundle>(session.file);
            const problem = bundleProblem(bundle);
            if (problem) throw new Error(problem);
            // Bundle changed since the state was saved (items, pages, timing may differ): do not restore
            const sha256 = this.booklets().find(b => b.booklet === session.booklet)?.sha256;
            if (sha256 && session.sha256 !== sha256) {
                if (session.snapshot) this.message.set('Das Testheft wurde inzwischen geändert. Der Test beginnt neu.');
                delete session.snapshot;
                session.sha256 = sha256;
            }
            this.bundle.set(bundle);
            this.session.set(session);
            this.store_.current = { code: session.code, booklet: session.booklet };
            this.store_.save(session);
            this.screen.set('run');
        } catch {
            this.store_.current = undefined;
            this.message.set('Das Testheft konnte nicht geladen werden.');
            this.screen.set('start');
        }
    }

    /** Opens a booklet in preview mode without creating a session. */
    async preview(entry: BookletEntry): Promise<void> {
        try {
            this.bundle.set(await json<Bundle>(entry.file));
            this.previewName.set(entry.booklet);
            this.message.set('');
            this.screen.set('preview');
        } catch {
            this.message.set('Das Testheft konnte nicht geladen werden.');
        }
    }

    /** Persists the booklet snapshot in the current session. */
    store(snapshot: BookletSnapshot): void {
        const session = this.session();
        if (!session) return;
        // Mutate in place rather than via the signal; setting the signal would rebuild the booklet
        session.snapshot = snapshot;
        this.store_.save(session);
    }

    /** Finishes the session: captures results and shows the end screen. */
    end(): void {
        const session = this.session();
        const booklet = this.run()?.booklet;
        if (!session || !booklet) return;
        const results = {
            format: 'af-results', version: '0.1',
            code: session.code, booklet: session.booklet, startedAt: session.startedAt, finishedAt: new Date().toISOString(),
            ...booklet.accommodations(),
            responses: booklet.responses(),
            coding: booklet.coding(),
            log: booklet.log()
        };
        session.finished = true;
        session.results = results;
        delete session.snapshot;
        this.store_.save(session);
        // stays the current session so that a reload shows the end screen with the download
        this.results.set(results);
        this.screen.set('end');
    }

    /** Downloads the results as JSON. */
    download(): void {
        const session = this.session();
        const results = this.results();
        if (!results || !session) return;
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `results-${session.booklet}-${session.code}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    /** Returns to the start screen for a new session. */
    restart(): void {
        this.session.set(undefined);
        this.bundle.set(undefined);
        this.results.set(undefined);
        this.message.set('');
        this.store_.current = undefined;
        this.screen.set('start');
    }
}

/** Fetches JSON; an HTTP error (e.g. a 404 HTML page) throws instead of failing as unparsable JSON. */
async function json<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return await res.json() as T;
}
