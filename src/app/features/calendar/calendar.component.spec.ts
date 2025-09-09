import {ComponentFixture, fakeAsync, TestBed, tick} from "@angular/core/testing";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
import {NO_ERRORS_SCHEMA} from "@angular/core";

import {CalendarComponent} from "./calendar.component";
import {TimelyService} from "../../core/services/timely.service";
import {ReactiveFormsModule} from "@angular/forms";
import {of} from "rxjs";

describe('CalendarComponent', () => {
	let fixture: ComponentFixture<CalendarComponent>;
	let cmp: CalendarComponent;
	let http: HttpTestingController;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [
				HttpClientTestingModule,
				ReactiveFormsModule,
			],
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
		const infoReq = http.expectOne(r => r.url.includes('/api/calendars/info'));
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

		expect(cmp.error).toBe('Server error while loading events. Please try again later.');
		expect(cmp.loading).toBeFalse();
		expect(Object.keys(cmp.eventsByDate).length).toBe(0);
	});

	it('should load and group events by day on success', () => {
		fixture.detectChanges();

		const id = flushCalendarInfo(321);
		const evReq = http.expectOne(r => r.url.includes(`/api/calendars/${id}/events`));
		expect(evReq.request.method).toBe('GET');

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

	it('debounces form changes', fakeAsync(() => {
		const timely = TestBed.inject(TimelyService);
		spyOn(timely, 'fetchCalendarInfo').and.returnValue(of({ id: 1, title: 'X' }));

		fixture.detectChanges();

		const initReq = http.expectOne(r =>
			r.url.includes('/api/calendars/1/events') && !r.params.has('term')
		);
		expect(initReq.request.method).toBe('GET');
		initReq.flush({ data: { items: {} }, total: 0, has_next: false });

		cmp.filtersForm.patchValue({ q: 'a' });
		cmp.filtersForm.patchValue({ q: 'ab' });
		cmp.filtersForm.patchValue({ q: 'abc' });

		tick(249);
		expect(
			http.match(r => r.url.includes('/api/calendars/1/events')).length
		).toBe(0);

		tick(1);
		const debouncedReq = http.expectOne(r =>
			r.url.includes('/api/calendars/1/events') && r.params.get('term') === 'abc'
		);
		expect(debouncedReq.request.method).toBe('GET');
		debouncedReq.flush({ data: { items: {} }, total: 0, has_next: false });

		expect(http.match(() => true).length).toBe(0);
	}));
});
