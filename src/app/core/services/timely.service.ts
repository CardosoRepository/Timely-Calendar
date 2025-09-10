import {Injectable} from '@angular/core';
import {HttpClient, HttpErrorResponse, HttpParams} from '@angular/common/http';
import {catchError, map, shareReplay, switchMap} from 'rxjs/operators';
import {Observable, throwError} from 'rxjs';
import {environment} from '../../../environments/environment';
import {TimelyApiCalendarInfo, TimelyApiEvent} from "../models/timely-api";
import {TimelyEvent} from "../models/event";

// ---------------------------------------------------------------
// TimelyService
// ---------------------------------------------------------------
// Responsible for:
//  - Resolving the calendar id from a public calendar URL.
//  - Fetching month-scoped events from Timely.
//  - Normalizing/flattening the response.
//  - Grouping events into every *local* day they touch in a given timezone.
//
// Core idea:
//  - Always use UTC timestamps supplied by the API when available
//    (start_utc_datetime / end_utc_datetime).
//  - Derive a *local* YYYY-MM-DD key via Intl.DateTimeFormat with a specific timeZone.
//  - If an event spans midnight locally, add it to each affected day key.
//
// Why this matters:
//  - Avoids “Friday becomes Saturday” issues that happen when keying by `toISOString()` (UTC).
//  - Correctly paints multi-day / cross-midnight events in multiple columns.
// ---------------------------------------------------------------

interface AppError {
	userMessage: string;
	status?: number;
	url?: string;
}

@Injectable({providedIn: 'root'})
export class TimelyService {
	private apiBaseUrl = environment.apiBase;

	private dayFmtCache = new Map<string, Intl.DateTimeFormat>();

	constructor(private http: HttpClient) {
	}

	/**
	 * Looks up the Timely calendar id based on an external/public URL.
	 * The result is cached via shareReplay so follow-up calls don't repeat the request.
	 */
	fetchCalendarInfo(): Observable<{ id: number; title?: string }> {
		const params = new HttpParams().set('url', environment.calendarUrl);
		return this.http.get<TimelyApiCalendarInfo>(`${this.apiBaseUrl}/api/calendars/info`, {params}).pipe(
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

	// -----------------------
	// Normalization helpers
	// -----------------------

	/**
	 * Converts a date/time string (with or without 'T' and 'Z') into ISO.
	 * If `asUtc` is true, we ensure it ends with 'Z' (UTC).
	 * Example inputs:
	 *   "2025-09-04 08:00:00"  → "2025-09-04T08:00:00"
	 *   "2025-09-04T08:00:00"  → "2025-09-04T08:00:00"
	 *   with asUtc=true       → "...Z"
	 */
	private convertToIsoString(s?: string, asUtc = false): string | undefined {
		if (!s) return undefined;
		const withT = s.includes('T') ? s : s.replace(' ', 'T');
		return asUtc ? (withT.endsWith('Z') ? withT : `${withT}Z`) : withT;
	}

	/** Picks a representative image URL (medium > full > small > thumbnail). */
	private extractEventImageUrl(ev: TimelyApiEvent): string | undefined {
		const sz = ev.images?.[0]?.sizes;
		return sz?.medium?.url || sz?.full?.url || sz?.small?.url || sz?.thumbnail?.url || undefined;
	}

	/**
	 * Minimal normalization: build a TimelyEvent with an ISO start (prefer UTC field).
	 * We keep the title/description/image and leave expansion/grouping to the map step.
	 */
	private normalizeEvent(ev: TimelyApiEvent): TimelyEvent {
		const startIso =
			ev.start_utc_datetime
				? this.convertToIsoString(ev.start_utc_datetime, true) // "Z"
				: this.convertToIsoString(ev.start_datetime, false);   // local (fallback)

		return {
			id: Number(ev.id),
			title: ev.title,
			start: startIso!,
			end: undefined,
			descriptionShort: ev.description_short,
			imageUrl: this.extractEventImageUrl(ev)
		};
	}

	/** Creates a user-facing error while logging the original HttpErrorResponse. */
	private createErrorHandler(context: 'calendarInfo' | 'events') {
		const base = context === 'calendarInfo' ? 'calendar information' : 'events';

		return (err: HttpErrorResponse) => {
			let userMessage = `Unable to load ${base}.`;

			if (err.status === 0) userMessage = `Network error. Please check your connection and try again.`;
			else if (err.status === 401 || err.status === 403) userMessage = `You don’t have permission to view the ${base}.`;
			else if (err.status === 404) userMessage = `The ${base} could not be found.`;
			else if (err.status >= 500) userMessage = `Server error while loading ${base}. Please try again later.`;

			console.error(`[${context}]`, err);

			return throwError(() => ({
				userMessage,
				status: err.status,
				url: err.url
			} as AppError));
		};
	}

	// -----------------------
	// Date utilities (private)
	// -----------------------

	/**
	 * Parses a date/time string to a Date in UTC. Accepts:
	 *   "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DDTHH:mm:ss", with or without 'Z'.
	 * Ensures the result is interpreted as UTC.
	 */
	private toUtcDate(s?: string): Date | undefined {
		if (!s) return;
		const withT = s.includes('T') ? s : s.replace(' ', 'T');
		const isoZ  = withT.endsWith('Z') ? withT : `${withT}Z`;
		return new Date(isoZ);
	}

	// -----------------------
	// Public API
	// -----------------------

	/**
	 * Fetches month events from Timely (already grouped by date on the backend),
	 * then re-keys them on the client by **local** day keys (YYYY-MM-DD) in the
	 * requested `timezone`. We replicate each event into **all** local days touched
	 * by its UTC interval to:
	 *  - avoid UTC off-by-one issues, and
	 *  - correctly display cross-midnight / multi-day events.
	 *
	 * Implementation notes:
	 * - Accepts an optional free-text `term` that is forwarded to the API.
	 * - Uses backend "month view" buckets (`view=month&group_by_date=1`) as pass-through;
	 *   we iterate buckets and expand each item locally with `enumerateLocalDaysFast`.
	 * - Prefers UTC fields when present (`start_utc_datetime`/`end_utc_datetime`);
	 *   if `end` is missing, we fall back to the `start` day only.
	 *
	 * @param opts.timezone Target timezone for computing local day keys.
	 * @param opts.startUtc Range start (UTC seconds).
	 * @param opts.endUtc   Range end   (UTC seconds).
	 * @param opts.perPage  Page size sent to the API (default: 1000).
	 * @param opts.page     Page number sent to the API (default: 1).
	 * @param opts.term     Optional search term forwarded to the API.
	 *
	 * @returns Record<YYYY-MM-DD, TimelyEvent[]> keyed by local day in `timezone`.
	 */
	fetchMonthViewGroupedEvents(opts: {
		timezone: string;
		startUtc: number;
		endUtc: number;
		perPage?: number;
		page?: number;
		term?: string;
	}): Observable<Record<string, TimelyEvent[]>> {
		const { timezone, startUtc, endUtc, perPage = 1000, page = 1, term } = opts;

		return this.fetchCalendarInfo().pipe(
			switchMap(info => {
				let params = new HttpParams()
					.set('view', 'month')
					.set('group_by_date', '1')
					.set('timezone', timezone)
					.set('start_date_utc', String(startUtc))
					.set('end_date_utc', String(endUtc))
					.set('per_page', String(perPage))
					.set('page', String(page));

				if (term && term.trim()) params = params.set('term', term.trim());

				return this.http.get<any>(`${this.apiBaseUrl}/api/calendars/${info.id}/events`, { params });
			}),

			map((res: any) => {
				const itemsObj = res?.data?.items ?? res?.items ?? {};
				if (!itemsObj || typeof itemsObj !== 'object' || Array.isArray(itemsObj)) {
					return {} as Record<string, TimelyEvent[]>;
				}

				const out: Record<string, TimelyEvent[]> = {};

				for (const [, arr] of Object.entries(itemsObj as Record<string, any[]>)) {
					const list = Array.isArray(arr) ? arr : [];
					for (const raw of list) {
						const ev = this.normalizeEvent(raw);

						const startUtcDate = this.toUtcDate(raw?.start_utc_datetime) ?? this.toUtcDate(ev.start);
						const endUtcDate   = this.toUtcDate(raw?.end_utc_datetime)   ?? startUtcDate;

						if (!startUtcDate) continue;

						const keys = this.enumerateLocalDaysFast(startUtcDate, endUtcDate!, timezone);
						for (const key of keys) {
							(out[key] ||= []).push(ev);
						}
					}
				}

				return out;
			}),
			catchError(this.createErrorHandler('events')),
			shareReplay({ bufferSize: 1, refCount: true })
		);
	}

	/** Enumerates all local YYYY-MM-DD keys between two UTC dates (inclusive). */
	private enumerateLocalDaysFast(startUtc: Date, endUtc: Date, tz: string): string[] {
		const a = this.getLocalYmd(startUtc, tz);
		const b = this.getLocalYmd(endUtc, tz);

		let y = a.y, m = a.m, d = a.d;
		const endY = b.y, endM = b.m, endD = b.d;

		const beforeOrEq = () => (y < endY) || (y === endY && (m < endM || (m === endM && d <= endD)));

		const out: string[] = [];
		while (beforeOrEq()) {
			out.push(this.ymdKey(y, m, d));
			({ y, m, d } = this.incYmd(y, m, d));
			if (out.length > 40000) break;
		}
		return out;
	}

	/** Formats year/month/day as YYYY-MM-DD string. */
	private ymdKey(y: number, m: number, d: number): string {
		const mm = m < 10 ? `0${m}` : `${m}`;
		const dd = d < 10 ? `0${d}` : `${d}`;
		return `${y}-${mm}-${dd}`;
	}

	/** Increments a Y/M/D triple to the next calendar day. */
	private incYmd(y: number, m: number, d: number): { y: number; m: number; d: number } {
		const dim = this.daysInMonth(y, m);
		if (++d <= dim) return { y, m, d };
		d = 1; if (++m <= 12) return { y, m, d };
		return { y: y + 1, m: 1, d: 1 };
	}

	/** Returns number of days in a given month/year (handles leap years). */
	private daysInMonth(y: number, m: number): number {
		if (m === 2) return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28;
		return (m === 4 || m === 6 || m === 9 || m === 11) ? 30 : 31;
	}

	/** Extracts Y/M/D parts from a UTC Date in a given timezone. */
	private getLocalYmd(dUtc: Date, tz: string): { y: number; m: number; d: number } {
		const parts = this.getDayFormatter(tz).formatToParts(dUtc);
		const y = Number(parts.find(p => p.type === 'year')!.value);
		const m = Number(parts.find(p => p.type === 'month')!.value);
		const d = Number(parts.find(p => p.type === 'day')!.value);
		return { y, m, d };
	}

	/** Gets (and caches) an Intl.DateTimeFormat for Y-M-D in the given timezone. */
	private getDayFormatter(tz: string): Intl.DateTimeFormat {
		let fmt = this.dayFmtCache.get(tz);
		if (!fmt) {
			fmt = new Intl.DateTimeFormat('en-CA', {
				timeZone: tz,
				year: 'numeric', month: '2-digit', day: '2-digit'
			});
			this.dayFmtCache.set(tz, fmt);
		}
		return fmt;
	}

	fetchEventRaw(eventId: number | string, timezone = 'America/Sao_Paulo'): Observable<any> {
		return this.fetchCalendarInfo().pipe(
			switchMap(info => {
				const url = `${this.apiBaseUrl}/api/calendars/${info.id}/events/${eventId}`;
				const params = new HttpParams().set('timezone', timezone);
				return this.http.get<{ data: any }>(url, { params });
			}),
			map(res => res.data)
		);
	}

}
