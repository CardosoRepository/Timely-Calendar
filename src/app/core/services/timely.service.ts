import {Injectable} from '@angular/core';
import {HttpClient, HttpErrorResponse, HttpParams} from '@angular/common/http';
import {catchError, map, shareReplay, switchMap} from 'rxjs/operators';
import {Observable, throwError} from 'rxjs';
import {environment} from '../../../environments/environment';
import {FilterOption, MaybeData, Page, Taxonomy, TimelyApiCalendarInfo, TimelyApiEvent} from "../models/timely-api";
import {TimelyEvent} from "../models/event";

interface AppError {
	userMessage: string;
	status?: number;
	url?: string;
}

@Injectable({providedIn: 'root'})
export class TimelyService {
	private readonly apiBaseUrl = environment.apiBase;
	private readonly dayFmtCache = new Map<string, Intl.DateTimeFormat>();

	constructor(private http: HttpClient) {
	}

	/** Resolve calendar id from public URL (cached). */
	fetchCalendarInfo(): Observable<{ id: number; title?: string }> {
		const params = new HttpParams().set('url', environment.calendarUrl);
		return this.http
			.get<TimelyApiCalendarInfo>(`${this.apiBaseUrl}/api/calendars/info`, {params})
			.pipe(
				map((res: any) => {
					const raw = res?.data ?? res;
					const id = raw?.id;
					if (id == null) throw new Error('Calendar ID not found');
					return {id: Number(id), title: raw?.title};
				}),
				catchError(this.createErrorHandler('calendarInfo')),
				shareReplay({bufferSize: 1, refCount: true})
			);
	}

	// ---------------- Normalization ----------------

	/** Normalize "YYYY-MM-DD[ T]HH:mm:ss[Z]" to ISO; add 'Z' if asUtc. */
	private convertToIsoString(s?: string, asUtc = false): string | undefined {
		if (!s) return;
		const withT = s.includes('T') ? s : s.replace(' ', 'T');
		return asUtc ? (withT.endsWith('Z') ? withT : `${withT}Z`) : withT;
	}

	/** Pick best image url (medium > full > small > thumbnail). */
	private extractEventImageUrl(ev: TimelyApiEvent): string | undefined {
		const sz = ev.images?.[0]?.sizes;
		return sz?.medium?.url || sz?.full?.url || sz?.small?.url || sz?.thumbnail?.url || undefined;
	}

	/** Minimal event normalization (prefer UTC start). */
	private normalizeEvent(ev: TimelyApiEvent): TimelyEvent {
		const startIso = ev.start_utc_datetime
			? this.convertToIsoString(ev.start_utc_datetime, true)
			: this.convertToIsoString(ev.start_datetime, false);

		return {
			id: Number(ev.id),
			title: ev.title,
			start: startIso!,
			end: undefined,
			descriptionShort: ev.description_short,
			imageUrl: this.extractEventImageUrl(ev),
		};
	}

	/** Build user-facing error while logging raw HttpErrorResponse. */
	private createErrorHandler(context: 'calendarInfo' | 'events') {
		const base = context === 'calendarInfo' ? 'calendar information' : 'events';

		return (err: HttpErrorResponse) => {
			let userMessage = `Unable to load ${base}.`;
			if (err.status === 0) userMessage = 'Network error. Please check your connection and try again.';
			else if (err.status === 401 || err.status === 403) userMessage = `You don’t have permission to view the ${base}.`;
			else if (err.status === 404) userMessage = `The ${base} could not be found.`;
			else if (err.status >= 500) userMessage = `Server error while loading ${base}. Please try again later.`;

			console.error(`[${context}]`, err);

			return throwError(() => ({
				userMessage,
				status: err.status,
				url: err.url,
			} as AppError));
		};
	}

	// ---------------- Dates ----------------

	/** Parse to UTC Date from "YYYY-MM-DD[ T]HH:mm:ss[Z]" (forces UTC). */
	private toUtcDate(s?: string): Date | undefined {
		if (!s) return;
		const withT = s.includes('T') ? s : s.replace(' ', 'T');
		const isoZ = withT.endsWith('Z') ? withT : `${withT}Z`;
		return new Date(isoZ);
	}

	// ---------------- Public API ----------------

	/**
	 * Fetch month 'buckets' from Timely, then re-key events by **local** YYYY-MM-DD.
	 * - Uses `group_by_date=1` so the API returns a date-indexed object.
	 * - Expands cross-midnight / multi-day events into every local day they touch.
	 * - Supports optional text search and taxonomy filters (categories/tags).
	 */
	fetchMonthViewGroupedEvents(opts: {
		timezone: string;
		startUtc: number;
		endUtc: number;
		perPage?: number;
		page?: number;
		term?: string;
		categories?: number[];
		tags?: number[]
	}): Observable<Record<string, TimelyEvent[]>> {
		const {timezone, startUtc, endUtc, perPage = 1000, page = 1, term, categories, tags} = opts;

		return this.fetchCalendarInfo().pipe(
			// Resolve calendar id then perform the events request
			switchMap(info => {
				// Core month view params
				let params = new HttpParams()
					.set('view', 'month')
					.set('group_by_date', '1')
					.set('timezone', timezone)
					.set('start_date_utc', String(startUtc))
					.set('end_date_utc', String(endUtc))
					.set('per_page', String(perPage))
					.set('page', String(page));

				// Optional search + taxonomy filters
				if (term?.trim()) params = params.set('term', term.trim());
				if (categories?.length) params = params.set('categories', categories.join(','));
				if (tags?.length) params = params.set('tags', tags.join(','));

				return this.http.get<any>(`${this.apiBaseUrl}/api/calendars/${info.id}/events`, {params});
			}),
			// Normalize payload and expand events across all local days they overlap
			map((res: any) => {
				const itemsObj = res?.data?.items ?? res?.items ?? {};
				if (!itemsObj || typeof itemsObj !== 'object' || Array.isArray(itemsObj)) return {};

				const out: Record<string, TimelyEvent[]> = {};

				// itemsObj is keyed by (UTC) date buckets; flatten and normalize each event
				for (const [, arr] of Object.entries(itemsObj as Record<string, any[]>)) {
					const list = Array.isArray(arr) ? arr : [];
					for (const raw of list) {
						const ev = this.normalizeEvent(raw);

						const startUtcDate = this.toUtcDate(raw?.start_utc_datetime) ?? this.toUtcDate(ev.start);
						const endUtcDate = this.toUtcDate(raw?.end_utc_datetime) ?? startUtcDate;
						if (!startUtcDate) continue;

						const keys = this.enumerateLocalDaysFast(startUtcDate, endUtcDate!, timezone);
						for (const key of keys) (out[key] ||= []).push(ev);
					}
				}
				return out;
			}),
			catchError(this.createErrorHandler('events')),
			shareReplay({bufferSize: 1, refCount: true})
		);
	}

	/** Enumerate local day keys (YYYY-MM-DD) between UTC dates, inclusive. */
	private enumerateLocalDaysFast(startUtc: Date, endUtc: Date, tz: string): string[] {
		const a = this.getLocalYmd(startUtc, tz);
		const b = this.getLocalYmd(endUtc, tz);

		let y = a.y, m = a.m, d = a.d;
		const endY = b.y, endM = b.m, endD = b.d;

		const beforeOrEq = () =>
			y < endY || (y === endY && (m < endM || (m === endM && d <= endD)));

		const out: string[] = [];
		while (beforeOrEq()) {
			out.push(this.ymdKey(y, m, d));
			({y, m, d} = this.incYmd(y, m, d));
			if (out.length > 40000) break; // hard safety cap
		}
		return out;
	}

	/** Format YYYY-MM-DD. */
	private ymdKey(y: number, m: number, d: number): string {
		const mm = m < 10 ? `0${m}` : `${m}`;
		const dd = d < 10 ? `0${d}` : `${d}`;
		return `${y}-${mm}-${dd}`;
	}

	/** Next calendar day for Y/M/D. */
	private incYmd(y: number, m: number, d: number): { y: number; m: number; d: number } {
		const dim = this.daysInMonth(y, m);
		if (++d <= dim) return {y, m, d};
		d = 1;
		if (++m <= 12) return {y, m, d};
		return {y: y + 1, m: 1, d: 1};
	}

	/** Days in month (leap year aware). */
	private daysInMonth(y: number, m: number): number {
		if (m === 2) return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28;
		return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
	}

	/** Extract Y/M/D from a UTC Date in tz via Intl parts. */
	private getLocalYmd(dUtc: Date, tz: string): { y: number; m: number; d: number } {
		const parts = this.getDayFormatter(tz).formatToParts(dUtc);
		const y = Number(parts.find(p => p.type === 'year')!.value);
		const m = Number(parts.find(p => p.type === 'month')!.value);
		const d = Number(parts.find(p => p.type === 'day')!.value);
		return {y, m, d};
	}

	/** Intl.DateTimeFormat cache for Y-M-D in a tz. */
	private getDayFormatter(tz: string): Intl.DateTimeFormat {
		let fmt = this.dayFmtCache.get(tz);
		if (!fmt) {
			fmt = new Intl.DateTimeFormat('en-CA', {
				timeZone: tz,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
			});
			this.dayFmtCache.set(tz, fmt);
		}
		return fmt;
	}

	/** Fetch a single raw event payload (passthrough). */
	fetchEventRaw(eventId: number | string, timezone = 'America/Sao_Paulo'): Observable<any> {
		return this.fetchCalendarInfo().pipe(
			switchMap(info => {
				const url = `${this.apiBaseUrl}/api/calendars/${info.id}/events/${eventId}`;
				const params = new HttpParams().set('timezone', timezone);
				return this.http.get<{ data: any }>(url, {params});
			}),
			map(res => res.data),
			catchError(this.createErrorHandler('events'))
		);
	}

	/**
	 * List filter options (categories, tags).
	 * Builds the request with optional paging/search and unwraps `{ data: ... }` envelopes.
	 */
	listFilter(
		tax: Taxonomy,
		opts?: { title?: string; perPage?: number; page?: number }
	): Observable<Page<FilterOption>> {
		return this.fetchCalendarInfo().pipe(
			// Resolve calendar id first (cached via shareReplay upstream)
			switchMap(info => {
				// Build query params
				let params = new HttpParams().set('per_page', String(opts?.perPage ?? 50));
				if (opts?.page) params = params.set('page', String(opts.page));
				if (opts?.title?.trim()) params = params.set('title', opts.title.trim());

				const url = `${this.apiBaseUrl}/api/calendars/${info.id}/filters/${tax}`;
				return this.http.get<MaybeData<Page<FilterOption>>>(url, {params});
			}),
			map(res => ((res as any)?.data ?? res) as Page<FilterOption>),
			catchError(this.createErrorHandler('events'))
		);
	}
}
