import {ComponentFixture, TestBed} from '@angular/core/testing';
import {RouterTestingModule} from '@angular/router/testing';
import {AppComponent} from './app.component';
import {TimelyService} from "./core/services/timely.service";
import {HttpClientTestingModule, HttpTestingController} from "@angular/common/http/testing";

describe('AppComponent', () => {
	let fixture: ComponentFixture<AppComponent>;
	let http: HttpTestingController;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [
				RouterTestingModule,
				HttpClientTestingModule
			],
			declarations: [AppComponent],
			providers: [TimelyService],
		}).compileComponents();

		fixture = TestBed.createComponent(AppComponent);
		http = TestBed.inject(HttpTestingController);
	});

	afterEach(() => {
		http.verify();
	});

	it('should create the app', () => {
		const app = fixture.componentInstance;
		expect(app).toBeTruthy();
	});

	it(`should have as title 'Timely Calendar'`, () => {
		const app = fixture.componentInstance;
		expect(app.title).toEqual('Timely Calendar');
	});

	it('should show friendly error message when events load fails', () => {
		const cmp = fixture.componentInstance;

		fixture.detectChanges();

		const infoReq = http.expectOne(req => req.url.endsWith('/api/calendars/info'));
		expect(infoReq.request.method).toBe('GET');
		infoReq.flush({ id: 123 });

		const eventsReq = http.expectOne(req => req.url.includes('/api/calendars/123/events'));
		expect(eventsReq.request.method).toBe('GET');
		eventsReq.flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

		fixture.detectChanges();
		expect(cmp.error).toBe('Não foi possível carregar os eventos.');
		expect(cmp.loading).toBeFalse();
		expect(cmp.events.length).toBe(0);
	});

	it('should load and display events on success', () => {
		const cmp = fixture.componentInstance;
		fixture.detectChanges();

		const infoReq = http.expectOne(req => req.url.endsWith('/api/calendars/info'));
		infoReq.flush({ id: 321 });

		const eventsReq = http.expectOne(req => req.url.includes('/api/calendars/321/events'));
		eventsReq.flush({
			total: 1,
			has_next: false,
			items: [
				{ id: 1, title: 'Sample', start_utc_datetime: '2025-01-01 10:00:00' }
			]
		});

		fixture.detectChanges();
		expect(cmp.error).toBeNull();
		expect(cmp.loading).toBeFalse();
		expect(cmp.events.length).toBe(1);
		expect(cmp.events[0].title).toBe('Sample');
	});
});
