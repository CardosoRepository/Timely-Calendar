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

	/** Returns a local day key (YYYY-MM-DD) for `date` in `tz`. */
	private dayKeyTZ(date: Date, tz: string): string {
		return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date); // YYYY-MM-DD
	}

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

	/**
	 * Enumerates *all* local day keys (YYYY-MM-DD) touched by the UTC interval [startUtc, endUtc].
	 * We step in 12h UTC increments to cross DST transitions safely without missing a day boundary.
	 *
	 * Example:
	 *  - startUtc=2025-09-04T23:59Z, endUtc=2025-09-05T00:01Z in America/Sao_Paulo
	 *  - May produce two keys: ["2025-09-04","2025-09-05"].
	 *
	 * A small guard prevents infinite loops in case of bad payloads.
	 */
	private enumerateLocalDays(startUtc: Date, endUtc: Date, tz: string): string[] {
		const keys: string[] = [];
		const last = this.dayKeyTZ(endUtc, tz);
		let cur = new Date(startUtc);
		let seen = '';
		let guard = 0;

		while (true) {
			const k = this.dayKeyTZ(cur, tz);
			if (k !== seen) {
				keys.push(k);
				seen = k;
				if (k === last) break;
			}
			cur.setUTCHours(cur.getUTCHours() + 12);
			if (++guard > 1000) break;
		}
		return keys;
	}

	// -----------------------
	// Public API
	// -----------------------

	/**
	 * Fetches month events (grouped by date by the backend), then
	 * re-groups them on the client by *local* day keys to:
	 *  - avoid UTC off-by-one,
	 *  - and place cross-midnight events into all affected days.
	 *
	 * @param opts.timezone  Target timezone used to compute local day keys.
	 * @param opts.startUtc  Range start (UTC seconds).
	 * @param opts.endUtc    Range end   (UTC seconds).
	 *
	 * @returns Record<YYYY-MM-DD, TimelyEvent[]>
	 */
	fetchMonthViewGroupedEvents(opts: {
		timezone: string;
		startUtc: number;
		endUtc: number;
		perPage?: number;
		page?: number;
	}): Observable<Record<string, TimelyEvent[]>> {
		const { timezone, startUtc, endUtc, perPage = 1000, page = 1 } = opts;

		return this.fetchCalendarInfo().pipe(
			switchMap(info => {
				const params = new HttpParams()
					.set('view', 'month')
					.set('group_by_date', '1')
					.set('timezone', timezone)
					.set('start_date_utc', String(startUtc))
					.set('end_date_utc', String(endUtc))
					.set('per_page', String(perPage))
					.set('page', String(page));

				return this.http.get<any>(`${this.apiBaseUrl}/api/calendars/${info.id}/events`, { params });
			}),
			map((res: any) => {
				const itemsObj = res?.data?.items ?? res?.items ?? {};
				if (!itemsObj || typeof itemsObj !== 'object' || Array.isArray(itemsObj)) {
					return {} as Record<string, TimelyEvent[]>;
				}

				const out: Record<string, TimelyEvent[]> = {};

				// Backend is grouped by "day" buckets -> flatten then re-key locally.
				for (const [, arr] of Object.entries(itemsObj as Record<string, any[]>)) {
					const list = Array.isArray(arr) ? arr : [];
					for (const raw of list) {
						const ev = this.normalizeEvent(raw);

						// Prefer UTC fields when present; fallback to normalized `start`.
						const startUtcDate = this.toUtcDate(raw?.start_utc_datetime) ?? this.toUtcDate(ev.start);
						const endUtcDate   = this.toUtcDate(raw?.end_utc_datetime);

						if (startUtcDate && endUtcDate) {
							// Put the event in *all* local days it touches.
							for (const key of this.enumerateLocalDays(startUtcDate, endUtcDate, timezone)) {
								(out[key] ||= []).push(ev);
							}
						} else if (startUtcDate) {
							// Single-day or missing end: place it by its local start day.
							const key = this.dayKeyTZ(startUtcDate, timezone);
							(out[key] ||= []).push(ev);
						}
					}
				}

				return out;
			}),
			catchError(this.createErrorHandler('events')),
			// Cache per-subscriber to avoid refetching when templates re-subscribe.
			shareReplay({ bufferSize: 1, refCount: true })
		);
	}
}
