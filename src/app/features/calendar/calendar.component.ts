import {Component, OnDestroy, OnInit} from '@angular/core';
import {TimelyService} from 'src/app/core/services/timely.service';
import {TimelyEvent} from 'src/app/core/models/event';
import {Subscription} from "rxjs";
import {CalendarDay} from "./models/calendar-day.model";

@Component({
	selector: 'app-calendar',
	templateUrl: './calendar.component.html',
	styleUrls: ['./calendar.component.scss'],
})
export class CalendarComponent implements OnInit, OnDestroy {
	currentMonth = this.resetToMonthStart(new Date());
	loading = false;
	error: string | null = null;

	currentMonthStart!: Date;
	currentMonthEnd!: Date;
	calendarDays: CalendarDay[] = [];
	eventsGroupedByDay: Record<string, TimelyEvent[]> = {};

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

	goToPreviousMonth() {
		this.currentMonth = this.addMonthsToDate(this.currentMonth, -1);
		this.updateMonthBoundaries();
		this.loadMonth();
	}

	goToNextMonth() {
		this.currentMonth = this.addMonthsToDate(this.currentMonth, 1);
		this.updateMonthBoundaries();
		this.loadMonth();
	}

	goToCurrentMonth() {
		this.currentMonth = this.resetToMonthStart(new Date());
		this.updateMonthBoundaries();
		this.loadMonth();
	}

	private loadMonth() {
		this.loading = true;
		this.error = null;

		const from = this.formatDateToYMD(this.currentMonthStart);
		const to = this.formatDateToYMD(this.currentMonthEnd);

		this.reqSub?.unsubscribe();

		this.reqSub = this.timely.fetchConfiguredCalendarEvents({from, to, size: 200, fromIndex: 0})
			.subscribe({
				next: (events) => {
					this.eventsGroupedByDay = this.groupEventsByDay(events);
					this.loading = false;
				},
				error: (err) => {
					this.error = err?.userMessage || 'Could not load data.';
					this.eventsGroupedByDay = {};
					this.loading = false;
				}
			});
	}

	private resetToMonthStart(d: Date) {
		return new Date(d.getFullYear(), d.getMonth(), 1);
	}

	private getFirstDayOfMonth(d: Date) {
		return new Date(d.getFullYear(), d.getMonth(), 1);
	}

	private getLastDayOfMonth(d: Date) {
		return new Date(d.getFullYear(), d.getMonth() + 1, 0);
	}

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

	private formatDateToYMD(d: Date) {
		const y = d.getUTCFullYear();
		const m = ('0' + (d.getUTCMonth() + 1)).slice(-2);
		const day = ('0' + d.getUTCDate()).slice(-2);
		return `${y}-${m}-${day}`;
	}


	private updateMonthBoundaries() {
		this.currentMonthStart = this.getFirstDayOfMonth(this.currentMonth);
		this.currentMonthEnd = this.getLastDayOfMonth(this.currentMonth);
		this.calendarDays = this.generateCalendarDays(this.currentMonthStart, this.currentMonthEnd);
	}

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

	private groupEventsByDay(events: TimelyEvent[]) {
		const mapDay: Record<string, TimelyEvent[]> = {};

		for (const ev of events ?? []) {
			if (!ev.start) continue;

			const start = new Date(ev.start);

			const key = this.formatDateToYMD(new Date(Date.UTC(
				start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()
			)));

			(mapDay[key] ||= []).push(ev);
		}

		Object.values(mapDay).forEach(list =>
			list.sort((a, b) => (a.start || '').localeCompare(b.start || ''))
		);

		return mapDay;
	}


	eventsForDay(date: Date) {
		return this.eventsGroupedByDay[this.formatDateToYMD(date)] ?? [];
	}

	trackDay = (_: number, d: CalendarDay) => d.date.toDateString();
	trackEvent = (_: number, e: TimelyEvent) => e.id ?? e.start;

}
