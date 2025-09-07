import {Component, OnDestroy, OnInit} from '@angular/core';
import {TimelyService} from 'src/app/core/services/timely.service';
import {TimelyEvent} from 'src/app/core/models/event';
import {Subscription} from "rxjs";
import {CalendarDay} from "./models/calendar-day.model";

// ---------------------------------------------------------------
// CalendarComponent
// ---------------------------------------------------------------
// Renders a month grid and shows Timely events for each day.
// The component:
//   1) Computes month boundaries (and a full week grid around them).
//   2) Requests events for the month (buffered by ±1 day to catch cross-midnight).
//   3) Groups events by *local day key* (YYYY-MM-DD) using the configured timezone.
//   4) Displays events per day in the grid.
//
// Notes on time handling:
// - We always *index* events by a local day key in the user's timezone (Intl.DateTimeFormat with timeZone).
// - This avoids “Friday becomes Saturday” mistakes when using raw UTC/ISO strings.
// - The service is responsible for mapping each event into *every* local day it touches.
//
// Dependencies (not shown here):
// - TimelyEvent, CalendarDay interfaces.
// - TimelyService, which wraps the Timely API and groups events by day.
// ---------------------------------------------------------------

type EventsByDate = Record<string, TimelyEvent[]>;

@Component({
	selector: 'app-calendar',
	templateUrl: './calendar.component.html',
	styleUrls: ['./calendar.component.scss'],
})
export class CalendarComponent implements OnInit, OnDestroy {

	/** Time zone used for grouping and rendering day keys. */
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

	constructor(private timely: TimelyService) {
	}

	ngOnInit(): void {
		this.updateMonthBoundaries();
		this.loadMonth();
	}

	ngOnDestroy(): void {
		this.reqSub?.unsubscribe();
	}

	// -----------------------
	// Navigation handlers
	// -----------------------

	/** Go to previous month (keeps the day as the 1st). */
	goToPreviousMonth() {
		this.currentMonth = this.addMonthsToDate(this.currentMonth, -1);
		this.updateMonthBoundaries();
		this.loadMonth();
	}

	/** Go to next month (keeps the day as the 1st). */
	goToNextMonth() {
		this.currentMonth = this.addMonthsToDate(this.currentMonth, 1);
		this.updateMonthBoundaries();
		this.loadMonth();
	}

	/** Jump back to the current month (now, normalized to the 1st). */
	goToCurrentMonth() {
		this.currentMonth = this.resetToMonthStart(new Date());
		this.updateMonthBoundaries();
		this.loadMonth();
	}

	// -----------------------
	// Data loading
	// -----------------------

	/**
	 * Loads events for the current month into `eventsByDate`.
	 *
	 * We query the API using UTC second timestamps and pass the component's
	 * `timezone`. The service returns a map keyed by local YYYY-MM-DD strings.
	 *
	 * Buffering by ±1 day (see `startUtc`/`endUtc` math) lets the service place
	 * cross-midnight events into the correct local columns.
	 */
	private loadMonth() {
		this.loading = true;
		this.error = null;

		const y = this.currentMonthStart.getFullYear();
		const m = this.currentMonthStart.getMonth();

		// Query range in *UTC seconds*. We add a 1-day pad before/after
		// to allow events that cross midnight to be placed correctly.
		const DAY = 24 * 3600;
		const startUtc = Date.UTC(y, m, 1, 0, 0, 0) / 1000 - DAY;
		const endUtc   = Date.UTC(y, m + 1, 1, 0, 0, 0) / 1000 - 1 + DAY;

		// Cancel any previous request (prevents race conditions when navigating fast).
		this.reqSub?.unsubscribe();

		this.reqSub = this.timely.fetchMonthViewGroupedEvents({
			timezone: this.timezone,
			startUtc,
			endUtc,
			perPage: 1000,
			page: 1
		})
			.subscribe({
				next: (byDate) => {
					this.eventsByDate = byDate || {};
					this.loading = false;
				},
				error: (err) => {
					this.error = err?.userMessage || 'Could not load data.';
					this.eventsByDate = {};
					this.loading = false;
				}
			});
	}

	// -----------------------
	// Date helpers (pure)
	// -----------------------
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

	/**
	 * Updates `currentMonthStart`/`currentMonthEnd` and builds the full week grid
	 * that covers the month (so the first row starts on Sunday and the last ends on Saturday).
	 */
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
		return new Intl.DateTimeFormat('en-CA', {
			timeZone: this.timezone
		}).format(date);
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
}
