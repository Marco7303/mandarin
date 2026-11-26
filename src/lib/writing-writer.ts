import HanziWriter from 'hanzi-writer';

// Hanzi Writer 3.7.3 has no public destroy method and attaches permanent document
// end listeners. Isolate this pinned-version adapter so React mounts, retries and
// character changes can release them. All grading remains Hanzi Writer's own.
export class WritingWriter extends HanziWriter {
    declare private events: AbortController;
    override _setupListeners() {
        const events = new AbortController();
        this.events = events;
        this.target.addPointerEndListener = callback => {
            for (const event of ['mouseup', 'touchend', 'touchcancel']) document.addEventListener(event, callback, { signal: events.signal });
        };
        super._setupListeners();
    }
    dispose() {
        this.events.abort();
        this.cancelQuiz();
        void this.pauseAnimation();
    }
}
