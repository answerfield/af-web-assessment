import { Injectable } from '@angular/core';
import type { BookletSnapshot, NeedsProfile } from '@answerfield/angular';

/** Stored session: state for resuming after a reload or interruption. */
export interface StoredSession {
    code: string;
    booklet: string;
    file: string;
    profile: NeedsProfile;
    snapshot?: BookletSnapshot;
    /** Hash of the bundle the state belongs to; state is not restored into a different bundle. */
    sha256?: string;
    finished?: boolean;
    /** Results captured on finish (export); kept until a new session starts. */
    results?: unknown;
    startedAt: string;
}

/**
 * Session persistence in browser storage (no server). Missing or blocked storage must never stop the test.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
    private key(code: string, booklet: string): string {
        return `af-session:${booklet}:${code}`;
    }

    /** Loads the session for a test code and booklet. */
    load(code: string, booklet: string): StoredSession | undefined {
        try {
            const raw = localStorage.getItem(this.key(code, booklet));
            return raw ? JSON.parse(raw) as StoredSession : undefined;
        } catch {
            return undefined;
        }
    }

    /** Saves a session (best effort). */
    save(session: StoredSession): void {
        try {
            localStorage.setItem(this.key(session.code, session.booklet), JSON.stringify(session));
        } catch {
            // storage full or blocked: the test continues, just without resume
        }
    }

    /** Deletes a stored session. */
    remove(code: string, booklet: string): void {
        try {
            localStorage.removeItem(this.key(code, booklet));
        } catch { /* ignore */ }
    }

    /** Key of the running session (per tab, for resuming after reload). */
    get current(): { code: string; booklet: string } | undefined {
        try {
            const raw = sessionStorage.getItem('af-current');
            return raw ? JSON.parse(raw) : undefined;
        } catch {
            return undefined;
        }
    }

    set current(value: { code: string; booklet: string } | undefined) {
        try {
            if (value) sessionStorage.setItem('af-current', JSON.stringify(value));
            else sessionStorage.removeItem('af-current');
        } catch { /* ignore */ }
    }
}
