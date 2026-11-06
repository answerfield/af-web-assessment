import { TestBed } from '@angular/core/testing';
import { BUNDLE_FORMAT, BUNDLE_VERSION, type Bundle } from '@answerfield/bundle';
import bundleJson from '../../public/bundles/example/booklet.bundle.json';
import { Run } from './run';
import { Preview } from './preview';
import { Start } from './start';
import { SessionStore } from './session-store';
import { App } from './app';

// Tracked example bundle, compiled from an own example booklet with `af compile --no-feedback`
const bundle = bundleJson as unknown as Bundle;

describe('Beispiel-Bundle', () => {
    it('hat Format und Version der Bundle-Runtime', () => {
        expect(bundle.format).toBe(BUNDLE_FORMAT);
        expect(bundle.version).toBe(BUNDLE_VERSION);
    });
});

describe('Start', () => {
    it('meldet Testcode, Testheft und Bedarfsprofil', () => {
        const fixture = TestBed.createComponent(Start);
        const entry = { file: 'bundles/example/booklet.bundle.json', booklet: 'brueche', title: 'Brüche verstehen', sha256: 'x' };
        fixture.componentRef.setInput('booklets', [entry]);
        fixture.detectChanges();
        let started: unknown;
        fixture.componentInstance.start.subscribe(s => started = s);
        fixture.componentInstance.code = ' ab-12 ';
        fixture.componentInstance.extended = true;
        fixture.componentInstance.readAloud = true;
        fixture.componentInstance.language = 'easy';
        fixture.componentInstance.submit();
        expect(started).toEqual({
            code: 'AB-12', entry,
            profile: {
                display: { scale: 1, contrast: 'normal', reflow: false, focus_emphasis: false },
                content: { extended_descriptions: false, read_aloud: 'on_demand', simple_language: false, easy_language: true },
                timing: { extension: 1.5 }
            }
        });
    });

    it('lehnt ungültige Testcodes ab', () => {
        const fixture = TestBed.createComponent(Start);
        fixture.componentRef.setInput('booklets', []);
        fixture.detectChanges();
        fixture.componentInstance.code = 'x';
        fixture.componentInstance.submit();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('gültigen Testcode');
    });
});

describe('SessionStore', () => {
    it('speichert und lädt Sitzungen', () => {
        const store = TestBed.inject(SessionStore);
        store.save({ code: 'AB-12', booklet: 'brueche', file: 'f', profile: {}, startedAt: 'jetzt' });
        expect(store.load('AB-12', 'brueche')?.file).toBe('f');
        store.remove('AB-12', 'brueche');
        expect(store.load('AB-12', 'brueche')).toBeUndefined();
    });
});

describe('Run', () => {
    it('zeigt Teil, Fortschritt und Zeit; Navigation folgt dem Testheft', async () => {
        const fixture = TestBed.createComponent(Run);
        fixture.componentRef.setInput('bundle', bundle);
        fixture.componentRef.setInput('name', 'brueche');
        fixture.componentRef.setInput('profile', {});
        fixture.detectChanges();
        await fixture.whenStable();
        const bar = () => (fixture.nativeElement.querySelector('.bar').textContent as string).replace(/\s+/g, ' ');
        const click = (label: string) => {
            [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) => b.textContent!.trim() === label)!.click();
            fixture.detectChanges();
        };
        expect(bar()).toContain('Einführung');
        expect(bar()).toContain('Instruktion');
        click('Teil abschließen');
        click('Abschließen');
        expect(bar()).toContain('Aufgabe 1 von 3');
        expect(bar()).toContain('20:00');
        expect(fixture.nativeElement.querySelector('af-booklet af-input')).not.toBeNull();
        click('Weiter');
        expect(bar()).toContain('Aufgabe 2 von 3');
        const coding = fixture.componentInstance.booklet.coding();
        expect(coding[0].variables['reduce']).toEqual({ missing: 'omitted' });
        expect(coding[2].variables['mark']).toEqual({ missing: 'not_reached' });
    });
});

describe('Preview', () => {
    it('listet alle Aufgaben nach Teilen, blättert frei und zeigt die Kodierung auf Wunsch', async () => {
        const fixture = TestBed.createComponent(Preview);
        fixture.componentRef.setInput('bundle', bundle);
        fixture.componentRef.setInput('name', 'brueche');
        fixture.detectChanges();
        await fixture.whenStable();
        const el = fixture.nativeElement as HTMLElement;
        const list = [...el.querySelectorAll('.preview-list button.link')].map(b => b.textContent!.replace(/\s+/g, ' ').trim());
        expect(list.length).toBe(4);
        expect(list[0]).toContain('Instruktion');
        expect(el.querySelector('.bar')!.textContent).toContain('Aufgabe 1 von 4');
        // jump freely, even across part boundaries
        (el.querySelectorAll('.preview-list button.link')[3] as HTMLButtonElement).click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(el.querySelector('.bar')!.textContent).toContain('Aufgabe 4 von 4');
        expect(el.querySelector('af-item af-root')).not.toBeNull();
        expect(el.querySelector('.preview-coding')).toBeNull();
        fixture.componentInstance.showCoding.set(true);
        fixture.detectChanges();
        await fixture.whenStable();
        expect(el.querySelector('.preview-coding')!.textContent).toContain('missing');
    });
});

describe('Preview: Seiten', () => {
    // A small bundle by hand: one item with two pages
    const page = (text: string) => ({ kind: 'element', element: 'page', args: {}, children: [{ kind: 'content', value: { op: 'lit', value: text } }] });
    const pages = {
        ...bundle,
        items: [{ name: 'zwei', title: 'Zwei Seiten', body: [page('Seite A'), page('Seite B')], variables: [] }],
        booklets: [{ name: 'b', title: 'Heft', parts: [{ name: 'T', title: 'Teil', navigation: 'free', entries: ['zwei'] }] }],
        codings: [], feedback: undefined
    } as unknown as Bundle;

    it('blättert über den Player: Seite 1 von 2, weiter, nicht über das Ende hinaus', async () => {
        const fixture = TestBed.createComponent(Preview);
        fixture.componentRef.setInput('bundle', pages);
        fixture.componentRef.setInput('name', 'b');
        fixture.detectChanges();
        await fixture.whenStable();
        const el = fixture.nativeElement as HTMLElement;
        const button = (label: string) => [...el.querySelectorAll('button')].find(b => b.textContent === label) as HTMLButtonElement;
        expect(el.textContent).toContain('Seite 1 von 2');
        expect(button('Vorige Seite').disabled).toBe(true);
        button('Nächste Seite').click();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(el.textContent).toContain('Seite 2 von 2');
        expect(button('Nächste Seite').disabled).toBe(true);
        expect(el.querySelector('af-page:not([hidden])')!.textContent).toContain('Seite B');
    });
});

describe('App: Sitzungen', () => {
    const entry = { file: 'bundles/example/booklet.bundle.json', booklet: 'brueche', title: 'Brüche', sha256: 'neu' };
    const respond = (url: string) => Promise.resolve(new Response(JSON.stringify(url.endsWith('index.json') ? [entry] : bundle)));
    const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
        for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 0)); await fixture.whenStable(); fixture.detectChanges(); }
    };

    it('beendeter Test: nach dem Neuladen Endbildschirm mit Download; derselbe Code überschreibt nichts', async () => {
        vi.stubGlobal('fetch', vi.fn(respond));
        const store = TestBed.inject(SessionStore);
        store.save({ code: 'ZZ-99', booklet: 'brueche', file: entry.file, profile: {}, startedAt: 'gestern', finished: true, results: { format: 'af-results' } });
        store.current = { code: 'ZZ-99', booklet: 'brueche' };
        const fixture = TestBed.createComponent(App);
        await settle(fixture);
        const el = fixture.nativeElement as HTMLElement;
        expect(el.querySelector('h1')?.textContent).toBe('Der Test ist beendet');
        expect(el.querySelector<HTMLButtonElement>('button.primary')!.disabled).toBe(false);
        await fixture.componentInstance.begin({ code: 'ZZ-99', entry, profile: {} });
        expect(store.load('ZZ-99', 'brueche')?.results).toEqual({ format: 'af-results' });
        store.remove('ZZ-99', 'brueche');
        store.current = undefined;
        vi.unstubAllGlobals();
    });

    it('geändertes Testheft: gespeicherter Zustand wird nicht auf das neue Bundle gelegt', async () => {
        vi.stubGlobal('fetch', vi.fn(respond));
        const store = TestBed.inject(SessionStore);
        store.save({ code: 'ZZ-98', booklet: 'brueche', file: entry.file, profile: {}, startedAt: 'gestern', sha256: 'alt',
            snapshot: { startedAt: 0, position: { part: 1, entry: 2 }, elapsed: {}, finished: false, items: {}, log: [] } as never });
        store.current = { code: 'ZZ-98', booklet: 'brueche' };
        const fixture = TestBed.createComponent(App);
        await settle(fixture);
        expect(fixture.componentInstance.message()).toMatch(/geändert/);
        // restarted: fresh state at the beginning instead of the old one at part 2
        expect(store.load('ZZ-98', 'brueche')?.snapshot?.position).toEqual({ part: 0, entry: 0 });
        expect(store.load('ZZ-98', 'brueche')?.snapshot?.startedAt).not.toBe(0);
        expect(store.load('ZZ-98', 'brueche')?.sha256).toBe('neu');
        store.remove('ZZ-98', 'brueche');
        store.current = undefined;
        vi.unstubAllGlobals();
    });
});

