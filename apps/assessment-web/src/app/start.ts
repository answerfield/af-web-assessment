import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { NeedsProfile } from '@answerfield/angular';

/** Booklet listed in `bundles/index.json`. */
export interface BookletEntry {
    file: string;
    booklet: string;
    title: string;
    /** Hash of the bundle file; a mismatch invalidates saved state. */
    sha256: string;
}

/** Data entered on the start screen. */
export interface StartRequest {
    code: string;
    entry: BookletEntry;
    profile: NeedsProfile;
}

/** Sign-in with a test code; the needs profile is set by the test administrator. */
@Component({
    selector: 'app-start',
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
      <main class="card">
        <h1>Testung starten</h1>
        <form (ngSubmit)="submit()">
          <label for="code">Testcode</label>
          <input id="code" name="code" [(ngModel)]="code" autocomplete="off" autocapitalize="characters"
                 spellcheck="false" required pattern="[A-Za-z0-9-]{4,20}" aria-describedby="code-hint" />
          <p id="code-hint" class="hint">4 bis 20 Zeichen, Buchstaben, Ziffern und Bindestrich.</p>

          <label for="booklet">Testheft</label>
          <select id="booklet" name="booklet" [(ngModel)]="selected">
            @for (b of booklets(); track b.booklet) {
              <option [ngValue]="b">{{ b.title }}</option>
            }
          </select>

          <fieldset>
            <legend>Bedarfsprofil (Testleitung)</legend>
            <label class="row" for="scale">Vergrößerung
              <select id="scale" name="scale" [(ngModel)]="scale">
                <option [ngValue]="1">100 %</option>
                <option [ngValue]="1.5">150 %</option>
                <option [ngValue]="2">200 %</option>
              </select>
            </label>
            <label class="row"><input type="checkbox" name="contrast" [(ngModel)]="contrast" /> Hoher Kontrast</label>
            <label class="row"><input type="checkbox" name="reflow" [(ngModel)]="reflow" /> Umbruch</label>
            <label class="row"><input type="checkbox" name="extended" [(ngModel)]="extended" /> Zeitverlängerung (×1,5)</label>
            <label class="row"><input type="checkbox" name="descriptions" [(ngModel)]="descriptions" /> Erweiterte Bildbeschreibungen</label>
            <label class="row" for="language">Sprachstufe
              <select id="language" name="language" [(ngModel)]="language">
                <option ngValue="">Original</option>
                <option ngValue="simple">Einfache Sprache</option>
                <option ngValue="easy">Leichte Sprache</option>
              </select>
            </label>
            <label class="row"><input type="checkbox" name="readAloud" [(ngModel)]="readAloud" /> Vorlesen</label>
            <label class="row"><input type="checkbox" name="focus" [(ngModel)]="focus" /> Fokus (Uhr nur auf Wunsch)</label>
            <label class="row" for="switch">Bedienung mit Tastern
              <select id="switch" name="switch" [(ngModel)]="switchAccess">
                <option ngValue="">aus</option>
                <option ngValue="step">zwei Taster (Leertaste weiter, Enter wählt)</option>
                <option ngValue="auto">ein Taster, Markierung im Takt</option>
              </select>
            </label>
            <p class="hint">Wirksam ist nur, was Studie und Aufgabe erlauben.</p>
          </fieldset>

          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <button type="submit" class="primary" [disabled]="!selected">Test starten</button>
          <button type="button" [disabled]="!selected" (click)="selected && preview.emit(selected)"
                  aria-describedby="preview-hint">Vorschau</button>
          <p id="preview-hint" class="hint">Vorschau: Aufgaben des Testhefts frei durchsehen – ohne Testcode, Zeitlimit und Speicherung.</p>
        </form>
      </main>
    `
})
export class Start {
    readonly booklets = input.required<BookletEntry[]>();
    readonly start = output<StartRequest>();
    readonly preview = output<BookletEntry>();

    code = '';
    selected?: BookletEntry;
    scale = 1;
    contrast = false;
    reflow = false;
    extended = false;
    descriptions = false;
    language: '' | 'simple' | 'easy' = '';
    readAloud = false;
    focus = false;
    switchAccess: '' | 'step' | 'auto' = '';
    readonly error = signal('');

    ngOnInit(): void {
        this.selected = this.booklets()[0];
    }

    submit(): void {
        const code = this.code.trim().toUpperCase();
        if (!/^[A-Z0-9-]{4,20}$/.test(code)) {
            this.error.set('Bitte einen gültigen Testcode eingeben.');
            return;
        }
        if (!this.selected) return;
        this.error.set('');
        this.start.emit({
            code,
            entry: this.selected,
            profile: {
                display: { scale: this.scale, contrast: this.contrast ? 'high' : 'normal', reflow: this.reflow, focus_emphasis: this.focus },
                content: {
                    extended_descriptions: this.descriptions, read_aloud: this.readAloud ? 'on_demand' : 'off',
                    simple_language: this.language === 'simple', easy_language: this.language === 'easy'
                },
                ...(this.switchAccess ? { interaction: { switch_access: { mode: this.switchAccess }, large_targets: true } } : {}),
                timing: { extension: this.extended ? 1.5 : 1 }
            }
        });
    }
}
