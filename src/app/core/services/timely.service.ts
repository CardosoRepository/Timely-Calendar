import {Injectable} from '@angular/core';
import {HttpClient, HttpErrorResponse, HttpParams} from '@angular/common/http';
import {catchError, map, shareReplay, switchMap} from 'rxjs/operators';
import {Observable, throwError} from 'rxjs';
import {environment} from '../../../environments/environment';
import {TimelyApiCalendarInfo, TimelyApiEvent, TimelyApiEventsResponse} from "../models/timely-api";
import {TimelyEvent} from "../models/event";

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

	fetchCalendarInfo(): Observable<{ id: number; title?: string }> {
		const params = new HttpParams().set('url', environment.calendarUrl);
		return this.http.get<TimelyApiCalendarInfo>(`${this.apiBaseUrl}/api/calendars/info`, { params }).pipe(
			map((res: any) => {
				const raw = res?.data ?? res;
				const id = raw?.id;
				if (id == null) throw new Error('Calendar ID not found');
				return { id: Number(id), title: raw?.title };
			}),
			catchError(this.createErrorHandler('calendarInfo')),
			shareReplay({ bufferSize: 1, refCount: true })
		);
	}

	private fetchCalendarEventsRaw(calendarId: number, opts?: { q?: string; from?: string; to?: string; size?: number; fromIndex?: number })
		: Observable<TimelyApiEventsResponse> {
		let params = new HttpParams();
		if (opts?.q)                 params = params.set('search', opts.q);
		if (opts?.from)              params = params.set('start_date', opts.from);
		if (opts?.to)                params = params.set('end_date', opts.to);
		if (opts?.size)              params = params.set('size', String(opts.size));
		if (opts?.fromIndex != null) params = params.set('from', String(opts.fromIndex));
		return this.http.get<TimelyApiEventsResponse>(`${this.apiBaseUrl}/api/calendars/${calendarId}/events`, { params });
	}

	private convertToIsoString(s?: string): string | undefined {
		if (!s) return undefined;
		return s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
	}

	private extractEventImageUrl(ev: TimelyApiEvent): string | undefined {
		const sz = ev.images?.[0]?.sizes;
		return sz?.medium?.url || sz?.full?.url || sz?.small?.url || sz?.thumbnail?.url || undefined;
	}

	private normalizeEvent(ev: TimelyApiEvent): TimelyEvent {
		return {
			id: Number(ev.id),
			title: ev.title,
			start: this.convertToIsoString(ev.start_utc_datetime || ev.start_datetime)!,
			end: undefined,
			descriptionShort: ev.description_short,
			imageUrl: this.extractEventImageUrl(ev)
		};
	}

	fetchConfiguredCalendarEvents(opts?: { q?: string; from?: string; to?: string; size?: number; fromIndex?: number })
		: Observable<TimelyEvent[]> {
		return this.fetchCalendarInfo().pipe(
			switchMap(info => this.fetchCalendarEventsRaw(info.id, opts)),
			map((res: any) => {
				const items =
					res?.items ??
					res?.data?.items ??
					res?.data ??
					[];
				return Array.isArray(items) ? items.map((e: TimelyApiEvent) => this.normalizeEvent(e)) : [];
			}),
			catchError(this.createErrorHandler('events')),
			shareReplay({ bufferSize: 1, refCount: true })
		);
	}

	private createErrorHandler(context: 'calendarInfo' | 'events') {
		return (err: HttpErrorResponse) => {
			const userMessage = context === 'calendarInfo'
				? 'Não foi possível carregar as informações do calendário.'
				: 'Não foi possível carregar os eventos.';

			console.error(`[${context}]`, err);

			return throwError(() => ({
				userMessage,
				status: err.status,
				url: err.url
			} as AppError));
		};
	}
}
