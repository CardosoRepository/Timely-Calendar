import {Component, OnDestroy, OnInit} from '@angular/core';
import {TimelyService} from 'src/app/core/services/timely.service';
import {TimelyEvent} from 'src/app/core/models/event';
import {debounceTime, distinctUntilChanged, Subscription} from "rxjs";
import {CalendarDay} from "./models/calendar-day.model";
import {FormBuilder, FormGroup} from "@angular/forms";
import {map} from "rxjs/operators";
import {MatDatepicker} from "@angular/material/datepicker";
import {EventDialogComponent} from "./event-dialog/event-dialog.component";
import {MatDialog} from "@angular/material/dialog";

type EventsByDate = Record<string, TimelyEvent[]>;

/**
 * CalendarComponent
 * -----------------
 * Renders a month grid and shows events grouped by **local** day keys (YYYY-MM-DD).
 * The daily grouping is produced by TimelyService (server + client expansion for cross-midnight/multi-day events).
 *
 * Notes on performance:
 * - We cache a single Intl.DateTimeFormat in `dayKeyFmt` to avoid recreating it per cell render.
 * - We keep `eventsForDay` trivial (pure lookup) so DOM rendering is the only real work.
 */
@Component({
	selector: 'app-calendar',
	templateUrl: './calendar.component.html',
	styleUrls: ['./calendar.component.scss'],
})
export class CalendarComponent implements OnInit, OnDestroy {

	/** Time zone used to format day keys and to query the API. */
	timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

	/** Anchor date for the current view (always normalized to the 1st of the month). */
	currentMonth = this.resetToMonthStart(new Date());

	/** Async state flags for the month fetch. */
	loading = false;
	error: string | null = null;

	/** Start/end of the *visible* month (1st → last day). */
	currentMonthStart!: Date;
	currentMonthEnd!: Date;

	/** Days rendered in the grid (covers full weeks that intersect the month). */
	calendarDays: CalendarDay[] = [];

	/** Events grouped by local day key (YYYY-MM-DD in `timezone`). */
	eventsByDate: EventsByDate = {};

	/** Subscription to the in-flight month request (so we can cancel on navigation). */
	private reqSub?: Subscription;

	/** Reactive form for server-side filters (search term, date range). */
	filtersForm!: FormGroup;
	private filtersSub?: Subscription;

	/** Cached formatter to build local day keys (YYYY-MM-DD) efficiently. */
	private dayKeyFmt!: Intl.DateTimeFormat;

	private palette: string[];

	private tmpYear = new Date();

	constructor(private timely: TimelyService, private fb: FormBuilder, private dialog: MatDialog) {
		const styles = getComputedStyle(document.documentElement);
		this.palette = [
			styles.getPropertyValue('--c1').trim(),
			styles.getPropertyValue('--c2').trim(),
			styles.getPropertyValue('--c3').trim(),
			styles.getPropertyValue('--c4').trim(),
			styles.getPropertyValue('--c5').trim(),
			styles.getPropertyValue('--c6').trim(),
		];
	}

	ngOnInit(): void {
		this.buildForm();

		this.dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
			timeZone: this.timezone,
			year: 'numeric', month: '2-digit', day: '2-digit'
		});

		this.updateMonthBoundaries();
		this.loadRange(); // initial fetch (month fallback when no date range selected)
	}

	ngOnDestroy(): void {
		this.reqSub?.unsubscribe();
		this.filtersSub?.unsubscribe();
	}

	/**
	 * Builds the filter form and subscribes to changes (debounced).
	 * On any change (q/start/end), we re-fetch the data with the new parameters.
	 */
	private buildForm(): void {
		this.filtersForm = this.fb.group({
			q: [''],
			start: [null],
			end: [null],
		});

		this.filtersSub = this.filtersForm.valueChanges
			.pipe(
				// Normalize values and create a stable comparison key to avoid redundant reloads
				map(v => {
					const q = (v?.q || '').trim();
					const s = v?.start instanceof Date ? v.start : (v?.start ? new Date(v.start) : null);
					const e = v?.end instanceof Date ? v.end : (v?.end ? new Date(v.end) : null);
					return {q, start: s, end: e, _k: `${q}|${s?.toDateString() ?? ''}|${e?.toDateString() ?? ''}`};
				}),
				debounceTime(250),
				distinctUntilChanged((a, b) => a._k === b._k)
			)
			.subscribe(() => this.loadRange());
	}

	// -----------------------
	// Date conversion helpers
	// -----------------------

	/** Offset (minutes) between UTC and the given time zone for a specific instant */
	private tzOffsetMin(at: Date, timeZone: string): number {
		const a = new Date(at.toLocaleString('en-US', {timeZone}));
		const b = new Date(at.toLocaleString('en-US', {timeZone: 'UTC'}));
		return (a.getTime() - b.getTime()) / 60000;
	}

	/** Convert "wall clock time" (in the given timezone) → epoch seconds (UTC) */
	private wallToUtcSeconds(y: number, m0: number, d: number, hh: number, mm: number, ss: number, tz: string): number {
		const utcGuess = new Date(Date.UTC(y, m0, d, hh, mm, ss));
		const offMin = this.tzOffsetMin(utcGuess, tz);
		return Math.floor((utcGuess.getTime() - offMin * 60000) / 1000);
	}

	/** Start of local day → epoch seconds (UTC) */
	private startOfDayUtcSeconds(localDate: Date, tz: string): number {
		const y = localDate.getFullYear();
		const m0 = localDate.getMonth();
		const d = localDate.getDate();
		return this.wallToUtcSeconds(y, m0, d, 0, 0, 0, tz);
	}

	/** End of local day (23:59:59) → epoch seconds (UTC) */
	private endOfDayUtcSeconds(localDate: Date, tz: string): number {
		const y = localDate.getFullYear();
		const m0 = localDate.getMonth();
		const d = localDate.getDate();
		return this.wallToUtcSeconds(y, m0, d, 23, 59, 59, tz);
	}

	// -----------------------
	// Navigation handlers
	// -----------------------

	/** Go to previous month (keeps the day as the 1st). */
	goToPreviousMonth() {
		this.currentMonth = this.addMonthsToDate(this.currentMonth, -1);
		this.updateMonthBoundaries();
		this.loadRange();
	}

	/** Go to next month (keeps the day as the 1st). */
	goToNextMonth() {
		this.currentMonth = this.addMonthsToDate(this.currentMonth, 1);
		this.updateMonthBoundaries();
		this.loadRange();
	}

	openMonthPicker(dp: MatDatepicker<Date>) {
		dp.open();
	}

	onYearSelected(d: Date) {
		this.tmpYear = new Date(this.currentMonthStart);
		this.tmpYear.setFullYear(d.getFullYear());
	}

	onMonthSelected(d: Date, dp: MatDatepicker<Date>) {
		const result = new Date(this.tmpYear);
		result.setMonth(d.getMonth());
		result.setDate(1);
		result.setHours(0, 0, 0, 0);

		this.currentMonth = result;
		this.updateMonthBoundaries();
		this.loadRange();
		dp.close();
	}

	// -----------------------
	// Data loading
	// -----------------------

	/**
	 * Loads events based on the current filter state:
	 * - If a date range is selected, we query exactly that range.
	 * - Otherwise, we query the current month with a ±1 day pad to handle cross-midnight placement.
	 *
	 * The service returns a record keyed by local YYYY-MM-DD strings for the given timezone.
	 */
	private loadRange() {
		this.loading = true;
		this.error = null;

		const tz = this.timezone;
		const {q, start, end} = this.filtersForm.value;

		// Normalize possible string values from native <input type="date"> or Material Datepicker
		const startCtrl: Date | null = start instanceof Date ? start : (start ? new Date(start) : null);
		const endCtrl: Date | null = end instanceof Date ? end : (end ? new Date(end) : null);

		let startUtc: number;
		let endUtc: number;

		if (startCtrl || endCtrl) {
			const startLocal = startCtrl ?? endCtrl!;
			const endLocal = endCtrl ?? startCtrl!;
			startUtc = this.startOfDayUtcSeconds(startLocal, tz);
			endUtc = this.endOfDayUtcSeconds(endLocal, tz);
		} else {
			// Month fallback (with a ±1 day pad to allow correct placement of cross-midnight events)
			const y = this.currentMonthStart.getFullYear();
			const m = this.currentMonthStart.getMonth();
			const DAY = 24 * 3600;
			startUtc = Date.UTC(y, m, 1, 0, 0, 0) / 1000 - DAY;
			endUtc = Date.UTC(y, m + 1, 1, 0, 0, 0) / 1000 - 1 + DAY;
		}

		const term = (q || '').trim();

		// Cancel previous in-flight request (prevents races when navigating fast)
		this.reqSub?.unsubscribe();
		this.reqSub = this.timely.fetchMonthViewGroupedEvents({
			timezone: tz,
			startUtc,
			endUtc,
			perPage: 1000,
			page: 1,
			term: term || undefined,
		})
			.subscribe({
				next: (byDate) => {
					this.eventsByDate = byDate || {};
					this.loading = false;
				},
				error: (err) => {
					this.error = err?.userMessage || 'Unable to load events.';
					this.eventsByDate = {};
					this.loading = false;
				}
			});
	}

	public retry(): void {
		this.loadRange();
	}

	get hasActiveFilters(): boolean {
		const v = this.filtersForm?.value || {};
		return !!(v.q?.trim() || v.start || v.end);
	}

	clearFilters(): void {
		this.filtersForm.reset({ q: '', start: null, end: null });
		this.currentMonth = this.resetToMonthStart(new Date());
		this.updateMonthBoundaries();
	}

	// -----------------------
	// Date helpers (pure)
	// -----------------------

	/** Start-of-month for a given date. */
	private resetToMonthStart(d: Date) {
		return new Date(d.getFullYear(), d.getMonth(), 1);
	}

	private getFirstDayOfMonth(d: Date) {
		return new Date(d.getFullYear(), d.getMonth(), 1);
	}

	private getLastDayOfMonth(d: Date) {
		return new Date(d.getFullYear(), d.getMonth() + 1, 0);
	}

	/** Start of week (Sunday) for the given date. */
	private getStartOfWeek(d: Date) {
		const dt = new Date(d);
		const day = dt.getDay();
		dt.setDate(dt.getDate() - day);
		return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
	}

	private getEndOfWeek(d: Date) {
		const dt = this.getStartOfWeek(d);
		dt.setDate(dt.getDate() + 6);
		return dt;
	}

	private addMonthsToDate(d: Date, m: number) {
		const nd = new Date(d);
		nd.setMonth(nd.getMonth() + m, 1);
		return nd;
	}

	private areDatesOnSameDay(a: Date, b: Date) {
		return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
	}

	/** Rebuilds the visible grid (full weeks around the visible month). */
	private updateMonthBoundaries() {
		this.currentMonthStart = this.getFirstDayOfMonth(this.currentMonth);
		this.currentMonthEnd = this.getLastDayOfMonth(this.currentMonth);
		this.calendarDays = this.generateCalendarDays(this.currentMonthStart, this.currentMonthEnd);
	}

	/** Builds the day cells for the UI grid (full weeks around the month). */
	private generateCalendarDays(currentMonthStart: Date, currentMonthEnd: Date) {
		const gridStart = this.getStartOfWeek(currentMonthStart);
		const gridEnd = this.getEndOfWeek(currentMonthEnd);
		const days: { date: Date; inMonth: boolean; isToday: boolean }[] = [];
		for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
			days.push({
				date: new Date(d),
				inMonth: d.getMonth() === currentMonthStart.getMonth(),
				isToday: this.areDatesOnSameDay(d, new Date())
			});
		}
		return days;
	}

	/** Formats a local day key (YYYY-MM-DD) in the component's `timezone`. */
	private formatDayKeyTZ(date: Date): string {
		return this.dayKeyFmt.format(date);
	}

	// -----------------------
	// Template helpers
	// -----------------------

	/** Returns the (possibly empty) list of events for a given calendar day cell. */
	eventsForDay(date: Date) {
		return this.eventsByDate[this.formatDayKeyTZ(date)] ?? [];
	}

	/** trackBy: avoid re-rendering day cells unnecessarily. */
	trackDay = (_: number, d: CalendarDay) => d.date.toDateString();

	/** trackBy: avoid re-rendering event rows unnecessarily. */
	trackEvent = (_: number, e: TimelyEvent) => e.id ?? e.start;

	/** Simple string hashing function to generate a numeric seed from a title. */
	private hashSeed(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) {
			h = (h << 5) - h + s.charCodeAt(i);
			h |= 0;
		}
		return Math.abs(h);
	}

	/** Maps an event to an index in the color palette (using id if available, otherwise title hash). */
	private colorIndex(e: { id?: number; title: string }): number {
		if (e.id != null) return e.id % this.palette.length;
		return this.hashSeed(e.title) % this.palette.length;
	}

	/** Resolves the display color for an event from the palette. */
	getEventColor(e: any): string {
		return this.palette[this.colorIndex(e)];
	}

	openEvent(e: any) {
		this.dialog.open(EventDialogComponent, {
			data: {
				id: e.id,
				timezone: e.timezone ?? 'America/Sao_Paulo'
			},
			width:  'min(1280px, 96vw)',
			maxWidth: 'none',
			maxHeight: '92vh',
			panelClass: 'event-dialog',
			autoFocus: false
		});
	}
}
