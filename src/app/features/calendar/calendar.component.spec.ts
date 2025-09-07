import {ComponentFixture, TestBed} from "@angular/core/testing";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
import {NO_ERRORS_SCHEMA} from "@angular/core";

import {CalendarComponent} from "./calendar.component";
import {TimelyService} from "../../core/services/timely.service";

describe('CalendarComponent', () => {
	let fixture: ComponentFixture<CalendarComponent>;
	let cmp: CalendarComponent;
	let http: HttpTestingController;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [HttpClientTestingModule],
			declarations: [CalendarComponent],
			providers: [TimelyService],
			schemas: [NO_ERRORS_SCHEMA],
		}).compileComponents();

		fixture = TestBed.createComponent(CalendarComponent);
		cmp = fixture.componentInstance;
		http = TestBed.inject(HttpTestingController);

		cmp.timezone = 'UTC';
	});

	afterEach(() => http.verify());

	function flushCalendarInfo(id = 123) {
		const infoReq = http.expectOne(r => r.url.endsWith('/api/calendars/info'));
		expect(infoReq.request.method).toBe('GET');
		infoReq.flush({ data: { id } });
		return id;
	}

	it('should create', () => {
		expect(cmp).toBeTruthy();
	});

	it('should show friendly error message when events load fails', () => {
		fixture.detectChanges();

		const id = flushCalendarInfo(123);
		const evReq = http.expectOne(r => r.url.includes(`/api/calendars/${id}/events`));

		expect(evReq.request.method).toBe('GET');
		evReq.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

		fixture.detectChanges();

		expect(cmp.error).toBe('Unable to load events.');
		expect(cmp.loading).toBeFalse();
		expect(Object.keys(cmp.eventsByDate).length).toBe(0);
	});

	it('should load and group events by day on success', () => {
		fixture.detectChanges();

		const id = flushCalendarInfo(321);
		const evReq = http.expectOne(r => r.url.includes(`/api/calendars/${id}/events`));

		expect(evReq.request.method).toBe('GET');

		// Service expects month/grouped shape: data.items = { 'YYYY-MM-DD': [events...] }
		const dayKey = '2025-01-01';
		evReq.flush({
			data: {
				items: {
					[dayKey]: [
						{ id: 1, title: 'Sample', start_utc_datetime: '2025-01-01 10:00:00' }
					]
				}
			},
			total: 1,
			has_next: false
		});

		fixture.detectChanges();

		expect(cmp.error).toBeNull();
		expect(cmp.loading).toBeFalse();
		expect(Array.isArray(cmp.eventsByDate[dayKey])).toBeTrue();
		expect(cmp.eventsByDate[dayKey].length).toBe(1);
		expect(cmp.eventsByDate[dayKey][0].title).toBe('Sample');
	});
});
