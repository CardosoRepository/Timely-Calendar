import {ComponentFixture, TestBed} from "@angular/core/testing";
import {CalendarComponent} from "./calendar.component";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";
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
		}).compileComponents();

		fixture = TestBed.createComponent(CalendarComponent);
		cmp = fixture.componentInstance;
		http = TestBed.inject(HttpTestingController);
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
		expect(cmp.error).toBe('Não foi possível carregar os eventos.');
		expect(cmp.loading).toBeFalse();
		expect(Object.keys(cmp.eventsGroupedByDay).length).toBe(0);
	});

	it('should load and group events by day on success', () => {
		fixture.detectChanges();
		const id = flushCalendarInfo(321);

		const evReq = http.expectOne(r => r.url.includes(`/api/calendars/${id}/events`));
		evReq.flush({
			total: 1,
			has_next: false,
			items: [
				{ id: 1, title: 'Sample', start_utc_datetime: '2025-01-01 10:00:00' }
			]
		});

		fixture.detectChanges();
		expect(cmp.error).toBeNull();
		expect(cmp.loading).toBeFalse();

		const key = '2025-01-01';
		expect(cmp.eventsGroupedByDay[key]?.length).toBe(1);
		expect(cmp.eventsGroupedByDay[key][0].title).toBe('Sample');
	});
});
