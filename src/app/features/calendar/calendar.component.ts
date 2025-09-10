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

@Component({
	selector: 'app-calendar',
	templateUrl: './calendar.component.html',
	styleUrls: ['./calendar.component.scss'],
})
export class CalendarComponent implements OnInit, OnDestroy {
	/** Time zone used for day keys and API queries. */
	timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

	/** Current month (always anchored on day 1). */
	currentMonth = this.resetToMonthStart(new Date());

	/** Async state flags. */
	loading = false;
	error: string | null = null;

	/** Visible month boundaries and days to render. */
	currentMonthStart!: Date;
	currentMonthEnd!: Date;
	calendarDays: CalendarDay[] = [];

	/** Events grouped by YYYY-MM-DD (in local tz). */
	eventsByDate: EventsByDate = {};

	/** Active subscriptions. */
	private reqSub?: Subscription;
	private filtersSub?: Subscription;

	/** Filters form + cached day key formatter. */
	filtersForm!: FormGroup;
	private dayKeyFmt!: Intl.DateTimeFormat;

	/** Palette loaded from CSS variables. */
	private palette: string[];

	/** Temporary year used by month picker. */
	private tmpYear = new Date();

	selectedCategoryIds = new Set<number>();
	selectedTagIds = new Set<number>();

	constructor(
		private timely: TimelyService,
		private fb: FormBuilder,
		private dialog: MatDialog
	) {
		const css = getComputedStyle(document.documentElement);
		this.palette = [
			css.getPropertyValue('--c1').trim(),
			css.getPropertyValue('--c2').trim(),
			css.getPropertyValue('--c3').trim(),
			css.getPropertyValue('--c4').trim(),
			css.getPropertyValue('--c5').trim(),
			css.getPropertyValue('--c6').trim(),
		];
	}

	ngOnInit(): void {
		this.buildForm();

		// Cache a single DateTimeFormat for efficiency
		this.dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
			timeZone: this.timezone,
			year: 'numeric', month: '2-digit', day: '2-digit',
		});

		this.updateMonthBoundaries();
		this.loadRange();
	}

	ngOnDestroy(): void {
		this.reqSub?.unsubscribe();
		this.filtersSub?.unsubscribe();
	}

	// -------- Filters --------

	/** Build filters form and refetch on changes (debounced). */
	private buildForm(): void {
		this.filtersForm = this.fb.group({
			q: [''],
			start: [null],
			end: [null],
		});

		this.filtersSub = this.filtersForm.valueChanges
			.pipe(
				map(v => {
					const q = (v?.q || '').trim();
					const s = v?.start instanceof Date ? v.start : (v?.start ? new Date(v.start) : null);
					const e = v?.end instanceof Date ? v.end : (v?.end ? new Date(v.end) : null);
					return {q, start: s, end: e, _k: `${q}|${s?.toDateString() ?? ''}|${e?.toDateString() ?? ''}`};
				}),
				debounceTime(250),
				distinctUntilChanged((a, b) => a._k === b._k),
			)
			.subscribe(() => this.loadRange());
	}

	get hasActiveFilters(): boolean {
		const v = this.filtersForm?.value || {};
		return !!(v.q?.trim() || v.start || v.end);
	}

	clearFilters(): void {
		this.filtersForm.reset({q: '', start: null, end: null});
		this.currentMonth = this.resetToMonthStart(new Date());
		this.updateMonthBoundaries();
	}

	// -------- Navigation --------

	goToPreviousMonth() {
		this.currentMonth = this.addMonthsToDate(this.currentMonth, -1);
		this.updateMonthBoundaries();
		this.loadRange();
	}

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
		result.setMonth(d.getMonth(), 1);
		result.setHours(0, 0, 0, 0);

		this.currentMonth = result;
		this.updateMonthBoundaries();
		this.loadRange();
		dp.close();
	}

	// -------- Data --------

	/**
	 * Load events based on filters:
	 * - If a range is selected → use it directly.
	 * - Otherwise → load current month + 1-day padding for cross-midnight events.
	 */
	private loadRange() {
		this.loading = true;
		this.error = null;

		const tz = this.timezone;
		const {q, start, end} = this.filtersForm.value;

		const s: Date | null = start instanceof Date ? start : (start ? new Date(start) : null);
		const e: Date | null = end instanceof Date ? end : (end ? new Date(end) : null);

		let startUtc: number;
		let endUtc: number;

		if (s || e) {
			const startLocal = s ?? e!;
			const endLocal = e ?? s!;
			startUtc = this.startOfDayUtcSeconds(startLocal, tz);
			endUtc = this.endOfDayUtcSeconds(endLocal, tz);
		} else {
			const y = this.currentMonthStart.getFullYear();
			const m = this.currentMonthStart.getMonth();
			const DAY = 24 * 3600;
			startUtc = Date.UTC(y, m, 1, 0, 0, 0) / 1000 - DAY;
			endUtc = Date.UTC(y, m + 1, 1, 0, 0, 0) / 1000 - 1 + DAY;
		}

		const term = (q || '').trim();
		const categories = Array.from(this.selectedCategoryIds);
		const tags = Array.from(this.selectedTagIds);

		this.reqSub?.unsubscribe();
		this.reqSub = this.timely
			.fetchMonthViewGroupedEvents({
				timezone: tz,
				startUtc,
				endUtc,
				perPage: 1000,
				page: 1,
				term: term || undefined,
				categories,
				tags
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
				},
			});
	}

	public retry(): void {
		this.loadRange();
	}

	// -------- Date helpers --------

	private resetToMonthStart(d: Date) {
		return new Date(d.getFullYear(), d.getMonth(), 1);
	}

	private getFirstDayOfMonth(d: Date) {
		return new Date(d.getFullYear(), d.getMonth(), 1);
	}

	private getLastDayOfMonth(d: Date) {
		return new Date(d.getFullYear(), d.getMonth() + 1, 0);
	}

	/** Return Sunday of the given week. */
	private getStartOfWeek(d: Date) {
		const dt = new Date(d);
		dt.setDate(dt.getDate() - dt.getDay());
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
		return a.getFullYear() === b.getFullYear()
			&& a.getMonth() === b.getMonth()
			&& a.getDate() === b.getDate();
	}

	/** Update month boundaries and build day grid (full weeks). */
	private updateMonthBoundaries() {
		this.currentMonthStart = this.getFirstDayOfMonth(this.currentMonth);
		this.currentMonthEnd = this.getLastDayOfMonth(this.currentMonth);
		this.calendarDays = this.generateCalendarDays(this.currentMonthStart, this.currentMonthEnd);
	}

	private generateCalendarDays(currentMonthStart: Date, currentMonthEnd: Date) {
		const gridStart = this.getStartOfWeek(currentMonthStart);
		const gridEnd = this.getEndOfWeek(currentMonthEnd);

		const days: CalendarDay[] = [];
		for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
			days.push({
				date: new Date(d),
				inMonth: d.getMonth() === currentMonthStart.getMonth(),
				isToday: this.areDatesOnSameDay(d, new Date()),
			});
		}
		return days;
	}

	/** Time zone offset (min) between UTC and given tz. */
	private tzOffsetMin(at: Date, timeZone: string): number {
		const a = new Date(at.toLocaleString('en-US', {timeZone}));
		const b = new Date(at.toLocaleString('en-US', {timeZone: 'UTC'}));
		return (a.getTime() - b.getTime()) / 60000;
	}

	/** Convert local time (tz) → epoch seconds (UTC). */
	private wallToUtcSeconds(
		y: number, m0: number, d: number, hh: number, mm: number, ss: number, tz: string
	): number {
		const utcGuess = new Date(Date.UTC(y, m0, d, hh, mm, ss));
		const offMin = this.tzOffsetMin(utcGuess, tz);
		return Math.floor((utcGuess.getTime() - offMin * 60000) / 1000);
	}

	private startOfDayUtcSeconds(localDate: Date, tz: string): number {
		return this.wallToUtcSeconds(
			localDate.getFullYear(),
			localDate.getMonth(),
			localDate.getDate(),
			0, 0, 0, tz
		);
	}

	private endOfDayUtcSeconds(localDate: Date, tz: string): number {
		return this.wallToUtcSeconds(
			localDate.getFullYear(),
			localDate.getMonth(),
			localDate.getDate(),
			23, 59, 59, tz
		);
	}

	// -------- Template helpers --------

	eventsForDay(date: Date) {
		return this.eventsByDate[this.dayKeyFmt.format(date)] ?? [];
	}

	trackDay = (_: number, d: CalendarDay) => d.date.toDateString();
	trackEvent = (_: number, e: TimelyEvent) => e.id ?? e.start;

	private hashSeed(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) {
			h = (h << 5) - h + s.charCodeAt(i);
			h |= 0;
		}
		return Math.abs(h);
	}

	private colorIndex(e: { id?: number; title: string }): number {
		return (e.id ?? this.hashSeed(e.title)) % this.palette.length;
	}

	getEventColor(e: any): string {
		return this.palette[this.colorIndex(e)];
	}

	openEvent(e: any) {
		this.dialog.open(EventDialogComponent, {
			data: {id: e.id, timezone: e.timezone ?? 'America/Sao_Paulo'},
			width: 'min(1280px, 96vw)',
			maxWidth: 'none',
			maxHeight: '92vh',
			panelClass: 'event-dialog',
			autoFocus: false,
		});
	}

	// -------- Dynamic taxonomy filters (Categories / Tags) --------

	/** Factory: curries the taxonomy and returns a fetcher used by the UI component. */
	private makeFetchPage(tax: 'categories' | 'tags' | 'organizers' | 'venues') {
		return (p: { page: number; perPage: number; title: string }) =>
			this.timely.listFilter(tax, p);
	}

	/** Bound data sources for <app-filter-multi-select>. */
	fetchCategoriesPage = this.makeFetchPage('categories');
	fetchTagsPage       = this.makeFetchPage('tags');

	/** Expose selected Sets as arrays for template bindings (avoid Array.from in HTML). */
	get catIds(): number[] { return [...this.selectedCategoryIds]; }
	get tagIds(): number[] { return [...this.selectedTagIds]; }

	/** Commit selection and refresh calendar. (Remove loadRange() if you want a global "Apply all") */
	onApplyCategories(ids: number[]): void {
		this.selectedCategoryIds = new Set(ids);
		this.loadRange();
	}

	/** Commit selection and refresh calendar. */
	onApplyTags(ids: number[]): void {
		this.selectedTagIds = new Set(ids);
		this.loadRange();
	}

}
