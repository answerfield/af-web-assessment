import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AfItem, assetResolver, codeResponses, type NeedsProfile } from '@answerfield/angular';
import type { Bundle, CodingResult, ResponseSet, StateSnapshot, VariableCode } from '@answerfield/bundle';
import { ASSET_BASE } from './app.config';

/** Entry in the item list: an item or instruction page of a part. */
interface Entry {
    name: string;
    title: string;
    part: string;
    instruction: boolean;
    /** Number of coding rules (sub-tasks). */
    rules: number;
}

/**
 * Booklet preview: browse and operate items freely, without test code, time limit, part boundaries or
 * persistence. The needs profile can be switched, audio phases skipped, and coding shown on demand.
 */
@Component({
    selector: 'app-preview',
    imports: [AfItem, FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'preview' },
    template: `
      <header class="bar">
        <div class="where">
          <strong>Vorschau: {{ title() }}</strong>
          <span class="muted">{{ position() }}</span>
        </div>
        <nav class="actions" aria-label="Aufgaben">
          <button type="button" (click)="go(-1)" [disabled]="index() === 0">Vorige Aufgabe</button>
          <button type="button" (click)="go(1)" [disabled]="index() === entries().length - 1">Nächste Aufgabe</button>
          <button type="button" (click)="close.emit()">Vorschau beenden</button>
        </nav>
      </header>
      <div class="preview-layout">
        <nav class="preview-list" aria-label="Aufgaben des Testhefts">
          @for (group of parts(); track group.part) {
            <h2>{{ group.part }}</h2>
            <ol>
              @for (e of group.entries; track e.name) {
                <li>
                  <button type="button" class="link" [attr.aria-current]="e.name === current()?.name ? 'true' : null"
                          (click)="select(e.name)">
                    {{ e.title }}
                    <span class="muted">{{ e.instruction ? 'Instruktion' : e.rules + ' TA' }}</span>
                  </button>
                </li>
              }
            </ol>
          }
        </nav>
        <main class="preview-main">
          <div class="preview-tools" role="group" aria-label="Vorschau-Einstellungen">
            @if (pageCount() > 1) {
              <span class="pages">
                <button type="button" (click)="page(-1)" [disabled]="pageIndex() === 0">Vorige Seite</button>
                <span class="muted">Seite {{ pageIndex() + 1 }} von {{ pageCount() }}</span>
                <button type="button" (click)="page(1)" [disabled]="pageIndex() === pageCount() - 1">Nächste Seite</button>
              </span>
            }
            @if (hasClock()) {
              <button type="button" (click)="skip()" title="Wiedergabe beenden oder laufende Uhren (Lesezeit, Pause) ablaufen lassen">Phase überspringen</button>
            }
            <label class="row">Vergrößerung
              <select name="scale" [ngModel]="scale()" (ngModelChange)="scale.set($event)">
                <option [ngValue]="1">100 %</option>
                <option [ngValue]="1.5">150 %</option>
                <option [ngValue]="2">200 %</option>
              </select>
            </label>
            <label class="row"><input type="checkbox" name="contrast" [ngModel]="contrast()" (ngModelChange)="contrast.set($event)" /> Hoher Kontrast</label>
            <label class="row"><input type="checkbox" name="reflow" [ngModel]="reflow()" (ngModelChange)="reflow.set($event)" /> Umbruch</label>
            <label class="row"><input type="checkbox" name="simple" [ngModel]="simple()" (ngModelChange)="simple.set($event)" /> Einfache Sprache</label>
            <label class="row"><input type="checkbox" name="easy" [ngModel]="easy()" (ngModelChange)="easy.set($event)" /> Leichte Sprache</label>
            <label class="row"><input type="checkbox" name="descriptions" [ngModel]="descriptions()" (ngModelChange)="descriptions.set($event)" /> Bildbeschreibungen</label>
            <label class="row"><input type="checkbox" name="readAloud" [ngModel]="readAloud()" (ngModelChange)="readAloud.set($event)" /> Vorlesen</label>
            <label class="row"><input type="checkbox" name="focus" [ngModel]="focus()" (ngModelChange)="focus.set($event)" /> Fokus</label>
            <label class="row"><input type="checkbox" name="coding" [ngModel]="showCoding()" (ngModelChange)="showCoding.set($event)" /> Kodierung anzeigen</label>
          </div>
          @if (current(); as e) {
            <af-item [bundle]="bundle()" [item]="e.name" [profile]="profile()" [asset]="asset"
                     [restore]="snapshots.get(e.name)" [attr.aria-label]="e.title"
                     (responsesChange)="answered($event)" (snapshotChange)="snapshots.set(e.name, $event)" />
            @if (showCoding() && !e.instruction) {
              <section class="preview-coding" aria-label="Antworten und Kodierung">
                <h2>Antworten und Kodierung</h2>
                <table>
                  <thead><tr><th scope="col">Variable</th><th scope="col">Antwort</th><th scope="col">Ergebnis</th></tr></thead>
                  <tbody>
                    @for (row of rows(); track row.name) {
                      <tr><th scope="row">{{ row.name }}</th><td>{{ row.value }}</td><td>{{ row.result }}</td></tr>
                    }
                  </tbody>
                </table>
                @if (scores()) { <p class="muted">Scores: {{ scores() }}</p> }
              </section>
            }
          }
        </main>
      </div>
    `
})
export class Preview {
    readonly bundle = input.required<Bundle>();
    /** Name of the booklet in the bundle. */
    readonly name = input.required<string>();
    readonly close = output<void>();

    readonly asset = assetResolver(inject(ASSET_BASE));
    private readonly item = viewChild(AfItem);

    readonly scale = signal(1);
    readonly contrast = signal(false);
    readonly reflow = signal(false);
    readonly simple = signal(false);
    readonly easy = signal(false);
    readonly descriptions = signal(false);
    readonly readAloud = signal(false);
    readonly focus = signal(false);
    readonly showCoding = signal(false);

    readonly index = signal(0);
    readonly responses = signal<ResponseSet | undefined>(undefined);
    /** Page, page count and timers of the mounted item. */
    readonly pageIndex = computed(() => this.item()?.state()?.page ?? 0);
    readonly pageCount = computed(() => this.item()?.state()?.pageCount ?? 1);
    readonly hasClock = computed(() => this.item()?.state()?.timed ?? false);
    /** State per item, so responses survive navigation and profile switches (in memory only). */
    readonly snapshots = new Map<string, StateSnapshot>();

    readonly booklet = computed(() => this.bundle().booklets?.find(b => b.name === this.name()));
    readonly title = computed(() => this.booklet()?.title ?? this.name());

    readonly entries = computed<Entry[]>(() => {
        const bundle = this.bundle();
        return (this.booklet()?.parts ?? []).flatMap(part => part.entries.map(name => {
            const item = bundle.items.find(i => i.name === name);
            return {
                name, title: item?.title ?? name, part: part.title ?? part.name, instruction: item?.instruction === true,
                rules: bundle.codings.find(c => c.item === name)?.rules.length ?? 0
            };
        }));
    });

    readonly parts = computed(() => {
        const groups: Array<{ part: string; entries: Entry[] }> = [];
        for (const e of this.entries()) {
            if (groups.at(-1)?.part !== e.part) groups.push({ part: e.part, entries: [] });
            groups.at(-1)!.entries.push(e);
        }
        return groups;
    });

    readonly current = computed<Entry | undefined>(() => this.entries()[this.index()]);
    readonly position = computed(() => `Aufgabe ${this.index() + 1} von ${this.entries().length}`);

    readonly profile = computed<NeedsProfile>(() => ({
        display: { scale: this.scale(), contrast: this.contrast() ? 'high' : 'normal', reflow: this.reflow(), focus_emphasis: this.focus() },
        content: {
            simple_language: this.simple(), easy_language: this.easy(), extended_descriptions: this.descriptions(),
            read_aloud: this.readAloud() ? 'on_demand' : 'off'
        }
    }));

    readonly coding = computed<CodingResult | undefined>(() => {
        const responses = this.responses();
        return responses && responses.item === this.current()?.name ? codeResponses(this.bundle(), responses) : undefined;
    });

    readonly rows = computed(() => {
        const responses = this.responses(), coding = this.coding();
        if (!responses || !coding) return [];
        const names = [...new Set([...Object.keys(responses.variables), ...Object.keys(coding.variables)])];
        return names.map(name => ({
            name,
            value: name in responses.variables ? JSON.stringify(responses.variables[name].value) : '–',
            result: describe(coding.variables[name])
        }));
    });

    readonly scores = computed(() => Object.entries(this.coding()?.scores ?? {}).map(([k, v]) => `${k} = ${v}`).join(', '));

    /** Selects an entry by name. */
    select(name: string): void {
        const i = this.entries().findIndex(e => e.name === name);
        if (i >= 0) this.index.set(i);
    }

    /** Moves through the item list by `delta` entries. */
    go(delta: number): void {
        this.index.update(i => Math.min(this.entries().length - 1, Math.max(0, i + delta)));
    }

    /** Pages within the current item by `delta` (clamped by the player). */
    page(delta: number): void {
        this.item()?.player?.page(this.pageIndex() + delta);
    }

    /** Ends the running play, else lets the running timers elapse. */
    skip(): void {
        this.item()?.player?.skip();
    }

    /** Receives responses from the item. */
    answered(responses: ResponseSet): void {
        this.responses.set(responses);
    }
}

/** Coding result of a variable as text. */
function describe(code: VariableCode | undefined): string {
    if (!code) return '–';
    if (code.error) return `Fehler: ${code.error}`;
    if (code.pending) return `offen (manuell: ${code.pending.map(q => q.criterion).join('; ')})`;
    if (code.missing) return `missing ${code.missing}`;
    return `Code ${code.code}${code.label ? ` „${code.label}“` : ''}, Score ${code.score ?? 0}`;
}
