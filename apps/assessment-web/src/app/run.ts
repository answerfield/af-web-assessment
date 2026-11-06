import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { AfBooklet, assetResolver, type BookletSnapshot, type NeedsProfile } from '@answerfield/angular';
import type { Bundle } from '@answerfield/bundle';
import { ASSET_BASE } from './app.config';

/** Test run: header bar with part, progress, remaining time and navigation; the booklet below. */
@Component({
    selector: 'app-run',
    imports: [AfBooklet],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
      <header class="bar">
        <div class="where">
          <strong>{{ state()?.part?.title ?? state()?.part?.name }}</strong>
          <span class="muted">{{ progress() }}</span>
        </div>
        @if (time(); as t) {
          @if (!focus() || clockShown()) {
            <span class="timer" [class.low]="!focus() && (state()?.remaining ?? 99) <= 60" role="timer"
                  [attr.aria-label]="'Restzeit ' + t">{{ t }}</span>
          }
          @if (focus()) {
            <button type="button" (click)="clockShown.set(!clockShown())">{{ clockShown() ? 'Zeit ausblenden' : 'Zeit zeigen' }}</button>
          }
        }
        <nav class="actions" aria-label="Navigation">
          @if (state()?.part?.navigation === 'free') {
            <button type="button" (click)="booklet.previous()" [disabled]="!state()?.canPrevious">Zurück</button>
          }
          @if (!state()?.atPartEnd) {
            <button type="button" class="primary" (click)="booklet.next()" [disabled]="!state()?.canNext">Weiter</button>
          } @else if (confirming()) {
            <span class="muted">{{ state()?.isLastPart ? 'Test wirklich beenden?' : 'Danach geht es nicht mehr zurück.' }}</span>
            <button type="button" class="primary" (click)="confirming.set(false); booklet.next()">
              {{ state()?.isLastPart ? 'Beenden' : 'Abschließen' }}
            </button>
            <button type="button" (click)="confirming.set(false)">Abbrechen</button>
          } @else {
            <button type="button" class="primary" (click)="confirming.set(true)">
              {{ state()?.isLastPart ? 'Test beenden' : 'Teil abschließen' }}
            </button>
          }
        </nav>
      </header>
      <af-booklet #b [bundle]="bundle()" [booklet]="name()" [profile]="profile()" [restore]="restore()" [asset]="asset" [scanScope]="host"
                  [attr.aria-label]="progress()" (snapshotChange)="snapshot.emit($event)" (finished)="finished.emit()" />
    `
})
export class Run {
    readonly bundle = input.required<Bundle>();
    readonly name = input.required<string>();
    readonly profile = input.required<NeedsProfile>();
    readonly restore = input<BookletSnapshot>();

    readonly snapshot = output<BookletSnapshot>();
    readonly finished = output<void>();

    private readonly bookletRef = viewChild.required(AfBooklet);
    readonly asset = assetResolver(inject(ASSET_BASE));
    /** Scan region for switch access: item and navigation. */
    readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    readonly confirming = signal(false);

    /** The booklet component (for results on finish). */
    get booklet(): AfBooklet {
        return this.bookletRef();
    }

    readonly state = computed(() => this.bookletRef().state());
    /** Focus emphasis: the clock shows on request only (no pressure from a running countdown). */
    readonly focus = computed(() => this.state() !== undefined && this.booklet.accommodations()?.accommodations.includes('focus_emphasis') === true);
    readonly clockShown = signal(false);

    readonly progress = computed(() => {
        const s = this.state();
        if (!s) return '';
        if (s.instruction) return 'Instruktion';
        const page = s.pageCount > 1 ? `, Seite ${s.page + 1} von ${s.pageCount}` : '';
        return `Aufgabe ${s.itemNumber} von ${s.itemCount}${page}`;
    });

    readonly time = computed(() => {
        const r = this.state()?.remaining;
        return r === undefined ? undefined : `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
    });
}
