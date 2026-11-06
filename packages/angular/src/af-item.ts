import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import type { Bundle, ResponseSet, StateSnapshot } from '@answerfield/bundle';
import {
    mountItem, type AssetResolver, type ItemPlayer, type ItemState, type NeedsProfile, type ParamValues, type PracticeSummary,
    type Theme
} from '@answerfield/player';

/**
 * A single item, as an Angular component over `mountItem` (`@answerfield/player`); changing any input mounts it anew.
 *
 * ```html
 * <af-item [bundle]="bundle" item="fraction1" [profile]="profile" (responsesChange)="save($event)" />
 * ```
 */
@Component({
    selector: 'af-item',
    template: '',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'af-item' }
})
export class AfItem {
    readonly bundle = input.required<Bundle>();
    readonly item = input.required<string>();
    readonly profile = input<NeedsProfile>({});
    /** State to resume from; read only when the item is mounted. */
    readonly restore = input<StateSnapshot>();
    /** Item version as parameter values (e.g. from `randomVersion`); if absent, taken from `restore`, else defaults. */
    readonly params = input<ParamValues>();
    /** Base URL for relative media paths. */
    readonly baseUrl = input<string>();
    /** Media resolver (e.g. a CDN, see `assetResolver`); takes precedence over `baseUrl`. */
    readonly asset = input<AssetResolver>();
    /** Theme layered over the default, supplied by the host (a `Theme` object, e.g. from a theme package of its own). */
    readonly theme = input<Theme>();
    /** Show coordinates of dragged points as a label (for practice). */
    readonly coordinates = input(false);
    /** Practice mode: `check()` evaluates responses and shows results and feedback. */
    readonly practice = input(false);

    /** Emits the responses when mounted and after every change. */
    readonly responsesChange = output<ResponseSet>();
    /** Emits a resumable snapshot when mounted and after every response change. */
    readonly snapshotChange = output<StateSnapshot>();

    /** Item state (page, pages, version, lock …); `undefined` before the first mount. */
    readonly state = signal<ItemState | undefined>(undefined);
    /** The mounted item (e.g. `page()`, `skip()`, `coding()`). */
    player?: ItemPlayer;

    /** With `practice` only: checks responses and resolves to the summary (correct, partial, wrong, open). */
    check(): Promise<PracticeSummary | undefined> {
        return this.player?.check() ?? Promise.resolve(undefined);
    }

    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

    constructor() {
        effect(onCleanup => {
            const bundle = this.bundle(), item = this.item(), profile = this.profile(), baseUrl = this.baseUrl(), asset = this.asset();
            const theme = this.theme(), practice = this.practice(), coordinates = this.coordinates(), params = this.params();
            const player = mountItem(this.host, bundle, item, {
                profile, coordinates, practice,
                ...(baseUrl !== undefined ? { baseUrl } : {}), ...(asset ? { asset } : {}), ...(theme ? { theme } : {}),
                ...(params ? { params } : {}),
                ...(untracked(this.restore) ? { restore: untracked(this.restore) } : {})
            });
            this.player = player;
            const offs = [
                player.on('change', s => this.state.set(s)),
                player.on('responses', r => this.responsesChange.emit(r)),
                player.on('snapshot', s => this.snapshotChange.emit(s))
            ];
            untracked(() => {
                this.state.set(player.state);
                this.responsesChange.emit(player.responses());
                this.snapshotChange.emit(player.snapshot());
            });
            onCleanup(() => {
                offs.forEach(off => off());
                player.dispose();
                if (this.player === player) this.player = undefined;
            });
        });
    }
}
