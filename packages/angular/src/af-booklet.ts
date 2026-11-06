import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import type { Bundle, CodingResult, ResponseSet } from '@answerfield/bundle';
import {
    mountBooklet, type AssetResolver, type BookletLog, type BookletPlayer, type BookletSnapshot, type BookletState, type ControlCommand,
    type NeedsProfile, type Theme
} from '@answerfield/player';

/** Booklet state for the host's UI; the same as `BookletState` of `@answerfield/player`. */
export type AfBookletState = BookletState;

/**
 * A booklet, as an Angular component over `mountBooklet` (`@answerfield/player`). Renders the current item; the host builds
 * navigation and chrome from `state` and the methods `next()`, `previous()`, `finish()`. Focus moves to the host
 * element when the item changes.
 *
 * ```html
 * <main #frame>
 *   <af-booklet #b [bundle]="bundle" booklet="brueche" [profile]="profile" [restore]="saved" [scanScope]="frame"
 *               (snapshotChange)="store($event)" (finished)="done()" />
 *   <button (click)="b.next()" [disabled]="!b.state()?.canNext">Weiter</button>
 * </main>
 * ```
 */
@Component({
    selector: 'af-booklet',
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'af-booklet', tabindex: '-1' }
})
export class AfBooklet {
    readonly bundle = input.required<Bundle>();
    readonly booklet = input.required<string>();
    readonly profile = input<NeedsProfile>({});
    /** Region scanned in switch access mode: the frame including navigation, so that "Weiter" is reachable. */
    readonly scanScope = input<HTMLElement | undefined>(undefined);
    /** Theme layered over the default, supplied by the host (a `Theme` object, e.g. from a theme package of its own). */
    readonly theme = input<Theme>();
    /** State to resume from; read only when the booklet is mounted. */
    readonly restore = input<BookletSnapshot>();
    /** Base URL for relative media paths. */
    readonly baseUrl = input<string>();
    /** Media resolver (e.g. a CDN, see `assetResolver`); takes precedence over `baseUrl`. */
    readonly asset = input<AssetResolver>();
    /** Clock tick in milliseconds (0: no automatic ticking). */
    readonly tickInterval = input(1000);

    /** Emits a resumable snapshot when mounted, on every relevant change and every 10 s while running. */
    readonly snapshotChange = output<BookletSnapshot>();
    /** Emits the responses of all items when mounted and after every change. */
    readonly responsesChange = output<ResponseSet[]>();
    /** Emits once the booklet is finished. */
    readonly finished = output<void>();

    /** Current booklet state; `undefined` before the first mount. */
    readonly state = signal<AfBookletState | undefined>(undefined);

    private player?: BookletPlayer;
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    constructor() {
        inject(DestroyRef).onDestroy(() => this.player?.dispose());
        effect(onCleanup => {
            const bundle = this.bundle(), name = this.booklet(), profile = this.profile(), baseUrl = this.baseUrl(), asset = this.asset();
            const scanScope = this.scanScope(), theme = this.theme(), tickInterval = this.tickInterval();
            const restore = untracked(this.restore);
            const player = mountBooklet(this.host, bundle, name, {
                profile, tickInterval,
                ...(baseUrl !== undefined ? { baseUrl } : {}), ...(asset ? { asset } : {}), ...(scanScope ? { scanScope } : {}),
                ...(theme ? { theme } : {}), ...(restore ? { restore } : {})
            });
            this.player = player;
            const offs = [
                player.on('change', s => this.state.set(s)),
                player.on('responses', r => this.responsesChange.emit(r)),
                player.on('snapshot', s => this.snapshotChange.emit(s)),
                player.on('finished', () => this.finished.emit())
            ];
            untracked(() => {
                this.state.set(player.state);
                this.responsesChange.emit(player.responses());
                this.snapshotChange.emit(player.snapshot());
                if (player.state.finished) this.finished.emit();
            });
            onCleanup(() => {
                offs.forEach(off => off());
                player.dispose();
                if (this.player === player) this.player = undefined;
            });
        });
    }

    /** Next page or item, as the booklet rules allow. */
    next(): void { this.player?.next(); }
    /** Previous page or item, as the booklet rules allow. */
    previous(): void { this.player?.previous(); }
    /** Jumps to an entry (zero-based) of the current part; only with `navigation: free`. */
    goTo(entry: number): void { this.player?.goTo(entry); }
    /** Finishes the booklet. */
    finish(): void { this.player?.finish(); }
    /** Test administrator command, e.g. from the session service: release, pause, resume, extend, end. */
    control(command: ControlCommand): void { this.player?.control(command); }

    /** Responses of all items. */
    responses(): ResponseSet[] { return this.player?.responses() ?? []; }
    /** Coding of all items with the built-in coder. */
    coding(): CodingResult[] { return this.player?.coding() ?? []; }
    /** Resumable snapshot of the booklet. */
    snapshot(): BookletSnapshot | undefined { return this.player?.snapshot(); }
    /** Logs of the booklet (navigation, time) and of its items. */
    log(): BookletLog | undefined { return this.player?.log(); }
    /** Accommodations in effect at booklet level, and the time factor. */
    accommodations(): { accommodations: string[]; timeFactor: number } | undefined { return this.player?.accommodations(); }
}
